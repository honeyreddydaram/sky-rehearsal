import base64
from unittest.mock import Mock

import pytest
from fastapi import HTTPException
from fastapi.testclient import TestClient
from app import main, conditions

client = TestClient(main.app)


@pytest.fixture(autouse=True)
def clear_weather():
    conditions.cached_metar.cache_clear()
    yield
    conditions.cached_metar.cache_clear()


def test_fixed_metar_source_cache_and_failure(monkeypatch):
    response = Mock(text="VOHY 261130Z 27010KT CAVOK 30/20 Q1013\nVOHY 261100Z older")
    http = Mock()
    http.get.return_value = response
    factory = Mock()
    factory.return_value.__enter__ = Mock(return_value=http)
    factory.return_value.__exit__ = Mock(return_value=False)
    monkeypatch.setattr(conditions.httpx, "Client", factory)
    assert client.get('/api/weather/metar').json()['station'] == 'VOHY'
    assert client.get('/api/weather/metar').status_code == 200
    assert http.get.call_count == 1
    assert http.get.call_args.args[0] == 'https://aviationweather.gov/api/data/metar'
    conditions.cached_metar.cache_clear()
    response.raise_for_status.side_effect = ValueError('private-provider-error')
    result = client.get('/api/weather/metar')
    assert result.status_code == 503
    assert 'private-provider-error' not in result.text


def test_speech_requires_signin_and_bounded_request():
    assert client.post('/api/radio/transcribe', json={'audio': 'abc'}).status_code == 401
    main.app.dependency_overrides[main.identity] = lambda: {'uid': 'student'}
    try:
        assert client.post('/api/radio/transcribe', json={'audio': 'x' * 1400001}).status_code == 422
    finally:
        main.app.dependency_overrides.clear()


def test_speech_disabled_without_google_project(monkeypatch):
    monkeypatch.delenv('GOOGLE_CLOUD_PROJECT', raising=False)
    with pytest.raises(HTTPException) as error:
        conditions.transcribe(conditions.AudioRequest(audio='bad'))
    assert error.value.status_code == 503


def test_google_speech_call_and_validation(monkeypatch):
    monkeypatch.setenv('GOOGLE_CLOUD_PROJECT', 'test-project')
    monkeypatch.delenv('FIREBASE_AUTH_EMULATOR_HOST', raising=False)
    speech = Mock()
    speech.recognize.return_value.results = [Mock(alternatives=[Mock(transcript='November downwind runway two seven')])]
    factory = Mock()
    factory.return_value.__enter__ = Mock(return_value=speech)
    factory.return_value.__exit__ = Mock(return_value=False)
    monkeypatch.setattr(conditions.speech, 'SpeechClient', factory)
    audio = base64.b64encode(b'\x1a\x45\xdf\xa3synthetic-webm-fixture').decode()
    assert conditions.transcribe(conditions.AudioRequest(audio=audio))['transcript'].startswith('November')
    sent = speech.recognize.call_args.kwargs
    assert sent['config'].language_code == 'en-IN'
    assert sent['timeout'] == 15 and sent['retry'] is None
    for audio in ['invalidbase64!', base64.b64encode(b'not webm').decode()]:
        with pytest.raises(HTTPException) as error:
            conditions.transcribe(conditions.AudioRequest(audio=audio))
        assert error.value.status_code == 422
    speech.recognize.side_effect = ValueError('private-cloud-error')
    with pytest.raises(HTTPException) as error:
        conditions.transcribe(conditions.AudioRequest(audio=base64.b64encode(b'\x1a\x45\xdf\xa3abc').decode()))
    assert error.value.status_code == 503
    assert 'private-cloud-error' not in error.value.detail


def test_transcription_uses_verified_uid_quota(monkeypatch):
    main.app.dependency_overrides[main.identity] = lambda: {'uid': 'student-a'}
    monkeypatch.setenv('GOOGLE_CLOUD_PROJECT', 'project')
    monkeypatch.delenv('FIREBASE_AUTH_EMULATOR_HOST', raising=False)
    monkeypatch.setattr(main, 'firebase_app', lambda: object())
    quota = Mock()
    monkeypatch.setattr(main, 'reserve_request', quota)
    monkeypatch.setattr(main, 'transcribe', lambda body: {'transcript': 'Readback'})
    try:
        assert client.post('/api/radio/transcribe', json={'audio': 'fixture'}).status_code == 200
        assert quota.call_args.args[1] == 'student-a'
    finally:
        main.app.dependency_overrides.clear()
