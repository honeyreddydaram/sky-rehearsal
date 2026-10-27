import json
from unittest.mock import Mock
import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from app.operations import OperationsMiddleware, MAX_BODY
from app import main, operations
from app.catalog import get_airport


def test_operational_headers_and_sanitized_failure(monkeypatch):
    app = FastAPI()
    app.add_middleware(OperationsMiddleware)
    @app.get('/failure/{private_id}')
    def failure(private_id: str):
        raise RuntimeError('private-password-token')
    log = Mock()
    monkeypatch.setattr(operations,'LOGGER',log)
    response = TestClient(app).get('/failure/private-student-id',headers={'Authorization':'Bearer private-token'})
    assert response.status_code == 503
    assert response.headers['cache-control']=='no-store'
    assert len(response.headers['x-request-id'])==32
    messages = ' '.join(str(call) for call in log.mock_calls)
    assert 'private-password' not in response.text + messages
    assert 'private-student-id' not in messages and 'private-token' not in messages
    assert '/failure/{private_id}' in messages


def test_body_limit_before_authentication():
    client = TestClient(main.app)
    response = client.post('/api/radio/transcribe',content=b'x'*(MAX_BODY+1))
    assert response.status_code == 413
    assert response.headers['x-content-type-options']=='nosniff'
    # Valid-sized unauthenticated requests still reach the existing auth boundary.
    assert client.post('/api/radio/transcribe',json={'audio':'abc'}).status_code==401


def test_catalog_and_public_release_metadata():
    assert get_airport('ZZZZ')['weatherStation'] is None
    client = TestClient(main.app)
    assert client.get('/api/version').json()['airports']['ZZZZ']=='synthetic-v1'
    assert client.get('/api/weather/metar?airport_id=ZZZZ').status_code==422
    assert client.get('/api/weather/metar?airport_id=ABCD').status_code==422
    with pytest.raises(Exception):
        get_airport('VOHY','wrong-revision')


def test_telemetry_requires_identity_and_rejects_private_payloads(monkeypatch):
    client = TestClient(main.app)
    assert client.post('/api/telemetry',json={'airport':'VOHY','mode':'quiz','recallScore':80}).status_code==401
    main.app.dependency_overrides[main.identity] = lambda: {'uid':'student'}
    monkeypatch.setattr(main,'firebase_app',lambda:object())
    try:
        assert client.post('/api/telemetry',json={'airport':'VOHY','mode':'quiz','recallScore':80,'email':'not-allowed'}).status_code==422
    finally:
        main.app.dependency_overrides.clear()


def test_school_quota_is_shared_and_fails_closed(monkeypatch):
    data={}
    doc=Mock(); doc.get.return_value.to_dict.side_effect=lambda:data.copy()
    tx=Mock(); tx.set.side_effect=lambda ref,value:data.update(value)
    db=Mock(); db.collection.return_value.document.return_value=doc; db.transaction.return_value=tx
    monkeypatch.setattr(operations.firestore,'client',lambda **kwargs:db)
    monkeypatch.setattr(operations.firestore,'transactional',lambda fn:fn)
    monkeypatch.setattr(operations.time,'time',lambda:120)
    for _ in range(3): operations.reserve_api_quota(object(),'student',limit=3)
    from fastapi import HTTPException
    with pytest.raises(HTTPException) as error: operations.reserve_api_quota(object(),'student',limit=3)
    assert error.value.status_code==429
    monkeypatch.setattr(operations.time,'time',lambda:180)
    operations.reserve_api_quota(object(),'student',limit=3)
    assert data['count']==1


def test_opt_in_event_logging_omits_identity(monkeypatch):
    from app import telemetry
    main.app.dependency_overrides[main.identity] = lambda: {'uid':'private-student-id'}
    monkeypatch.setattr(main,'firebase_app',lambda:object())
    monkeypatch.setattr(telemetry,'reserve_api_quota',Mock())
    logger = Mock()
    monkeypatch.setattr(telemetry,'LOGGER',logger)
    try:
        response = TestClient(main.app).post('/api/telemetry',json={'airport':'VOHY','mode':'quiz','recallScore':80})
        assert response.status_code==200
        event = json.loads(logger.info.call_args.args[0])
        assert event=={'severity':'INFO','event':'training_completed','airport':'VOHY','mode':'quiz','recallScore':80}
        assert 'private-student-id' not in str(logger.mock_calls)
    finally:
        main.app.dependency_overrides.clear()
