from unittest.mock import Mock

import pytest
from fastapi.testclient import TestClient

from app import main

client = TestClient(main.app)


@pytest.fixture(autouse=True)
def reset_app():
    main.firebase_app.cache_clear()
    yield
    main.firebase_app.cache_clear()


def test_liveness_without_configuration(monkeypatch):
    monkeypatch.delenv("FIREBASE_PROJECT_ID", raising=False)
    assert client.get("/api/health").json() == {"status": "ok"}
    assert client.get("/api/ready").status_code == 503


def test_unsigned_requests_are_rejected():
    assert client.get("/api/me").status_code == 401
    assert client.get("/api/admin/health").status_code == 401


def test_production_rejects_emulator_configuration(monkeypatch):
    monkeypatch.setenv("FIREBASE_PROJECT_ID", "demo-sky-rehearsal")
    monkeypatch.setenv("APP_ENV", "production")
    monkeypatch.setenv("FIREBASE_AUTH_EMULATOR_HOST", "127.0.0.1:9099")
    assert client.get("/api/ready").status_code == 503


def test_invalid_token_does_not_leak_verifier_errors(monkeypatch):
    monkeypatch.setattr(main, "firebase_app", lambda: object())
    monkeypatch.setattr(main.auth, "verify_id_token", Mock(side_effect=ValueError("private-error")))
    response = client.get("/api/me", headers={"Authorization": "Bearer bad"})
    assert response.status_code == 401
    assert "private-error" not in response.text


@pytest.mark.parametrize("role,expected", [("student", 403), ("instructor", 403), ("school_admin", 403), ("platform_admin", 200)])
def test_roles_are_enforced_by_verified_claims(monkeypatch, role, expected):
    monkeypatch.setattr(main, "firebase_app", lambda: object())
    verify = Mock(return_value={"uid": "student-a", "role": role})
    monkeypatch.setattr(main.auth, "verify_id_token", verify)
    response = client.get("/api/admin/health", headers={"Authorization": "Bearer verified-by-sdk"})
    assert response.status_code == expected
    assert verify.call_args.kwargs["check_revoked"] is True
