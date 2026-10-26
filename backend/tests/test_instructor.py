import json
from unittest.mock import Mock

import pytest
from fastapi import HTTPException
from fastapi.testclient import TestClient

from app import main, instructor

client = TestClient(main.app)
CONTEXT = {"kind": "hint", "phase": "Downwind", "focus": "landmark", "attempts": 3,
           "level": 0, "facts": ["Unverified reference", "Recall the next checkpoint"]}


@pytest.fixture
def signed_in(monkeypatch):
    main.app.dependency_overrides[main.identity] = lambda: {"uid": "learner-a"}
    monkeypatch.setattr(main, "firebase_app", lambda: object())
    yield
    main.app.dependency_overrides.clear()


def test_auth_required():
    assert client.post("/api/instructor", json=CONTEXT).status_code == 401


def test_missing_config_and_emulators_do_not_call_model(signed_in, monkeypatch):
    generate = Mock()
    monkeypatch.setattr(main, "generate", generate)
    monkeypatch.delenv("GOOGLE_CLOUD_PROJECT", raising=False)
    assert client.post("/api/instructor", json=CONTEXT).status_code == 503
    monkeypatch.setenv("GOOGLE_CLOUD_PROJECT", "real-project")
    monkeypatch.setenv("GEMINI_MODEL", "gemini-model")
    monkeypatch.setenv("FIREBASE_AUTH_EMULATOR_HOST", "127.0.0.1:9099")
    assert client.post("/api/instructor", json=CONTEXT).status_code == 503
    generate.assert_not_called()


@pytest.mark.parametrize("changes", [
    {"facts": ["x" * 501]}, {"facts": ["x"] * 13}, {"level": 4}, {"attempts": -1},
    {"kind": "score"}, {"model": "other-model"}, {"phase": "x" * 61}, {"level": "1"},
])
def test_bounded_schema(signed_in, changes):
    assert client.post("/api/instructor", json={**CONTEXT, **changes}).status_code == 422


def test_endpoint_uses_verified_uid_and_returns_explanation_only(signed_in, monkeypatch):
    monkeypatch.setattr(main, "configuration", lambda: ("project", "global", "model"))
    quota = Mock()
    monkeypatch.setattr(main, "reserve_request", quota)
    monkeypatch.setattr(main, "generate", lambda context, config: {"message": "What comes next?", "source": "Gemini / Vertex AI", "model": config[2]})
    result = client.post("/api/instructor", json=CONTEXT)
    assert result.status_code == 200
    assert "score" not in result.json()
    assert quota.call_args.args[1] == "learner-a"


def test_quota_blocks_model(signed_in, monkeypatch):
    monkeypatch.setattr(main, "configuration", lambda: ("project", "global", "model"))
    monkeypatch.setattr(main, "reserve_request", Mock(side_effect=HTTPException(429, "Wait")))
    model = Mock()
    monkeypatch.setattr(main, "generate", model)
    assert client.post("/api/instructor", json=CONTEXT).status_code == 429
    model.assert_not_called()


def test_vertex_receives_only_structured_context(monkeypatch):
    model = Mock()
    model.models.generate_content.return_value.text = json.dumps({"message": "Recall the next checkpoint."})
    factory = Mock()
    factory.return_value.__enter__ = Mock(return_value=model)
    factory.return_value.__exit__ = Mock(return_value=False)
    monkeypatch.setattr(instructor.genai, "Client", factory)
    result = instructor.generate(instructor.CoachingContext(**CONTEXT), ("project", "global", "chosen-model"))
    assert result["message"] == "Recall the next checkpoint."
    factory.assert_called_once()
    assert factory.call_args.kwargs["vertexai"] is True
    sent = model.models.generate_content.call_args.kwargs
    assert json.loads(sent["contents"]) == CONTEXT
    assert sent["model"] == "chosen-model"
    assert "Never invent" in sent["config"].system_instruction
    model.models.generate_content.return_value.text = '{"message": ""}'
    with pytest.raises(HTTPException) as error:
        instructor.generate(instructor.CoachingContext(**CONTEXT), ("project", "global", "model"))
    assert error.value.status_code == 503


def test_persistent_quota_and_window_reset(monkeypatch):
    data = {}
    document = Mock()
    document.get.return_value.to_dict.side_effect = lambda: data.copy()
    transaction = Mock()
    transaction.set.side_effect = lambda ref, value: data.update(value)
    db = Mock()
    db.collection.return_value.document.return_value = document
    db.transaction.return_value = transaction
    monkeypatch.setattr(instructor.firestore, "client", lambda **kwargs: db)
    monkeypatch.setattr(instructor.firestore, "transactional", lambda fn: fn)
    monkeypatch.setattr(instructor.time, "time", lambda: 120)
    for _ in range(6):
        instructor.reserve_request(object(), "learner-a")
    with pytest.raises(HTTPException) as error:
        instructor.reserve_request(object(), "learner-a")
    assert error.value.status_code == 429
    monkeypatch.setattr(instructor.time, "time", lambda: 180)
    instructor.reserve_request(object(), "learner-a")
    assert data == {"window": 3, "count": 1}


def test_debrief_does_not_invent_attempt_count():
    context = instructor.CoachingContext(**{**CONTEXT, "kind": "debrief", "attempts": None})
    assert context.attempts is None


def test_quota_initialization_failure_is_sanitized(monkeypatch):
    monkeypatch.setattr(instructor.firestore, "client", Mock(side_effect=ValueError("private-error")))
    with pytest.raises(HTTPException) as error:
        instructor.reserve_request(object(), "learner-a")
    assert error.value.status_code == 503
    assert "private-error" not in error.value.detail
