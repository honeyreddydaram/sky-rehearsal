"""Run against the real Auth emulator; never substitute mocked token verification."""
import os
import uuid

import httpx
import pytest
from fastapi.testclient import TestClient
from firebase_admin import auth

from app import main

pytestmark = pytest.mark.skipif(
    not os.getenv("FIREBASE_AUTH_EMULATOR_HOST"), reason="requires the Firebase Auth emulator"
)


def test_real_token_verification_roles_and_disabled_account():
    main.firebase_app.cache_clear()
    email = f"auth-{uuid.uuid4()}@example.test"
    base = "http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/accounts:"
    payload = {"email": email, "password": "Local-test-password-123", "returnSecureToken": True}
    response = httpx.post(base + "signUp?key=demo-key", json=payload)
    response.raise_for_status()
    user = response.json()
    client = TestClient(main.app)
    headers = {"Authorization": "Bearer " + user["idToken"]}
    identity = client.get("/api/me", headers=headers)
    assert identity.status_code == 200
    assert identity.json()["role"] == "student"
    assert identity.json()["uid"] == user["localId"]
    assert client.get("/api/admin/health", headers=headers).status_code == 403
    application = main.firebase_app()
    auth.set_custom_user_claims(user["localId"], {"role": "platform_admin"}, app=application)
    signed_in = httpx.post(base + "signInWithPassword?key=demo-key", json=payload)
    signed_in.raise_for_status()
    headers = {"Authorization": "Bearer " + signed_in.json()["idToken"]}
    assert client.get("/api/admin/health", headers=headers).status_code == 200
    auth.update_user(user["localId"], disabled=True, app=application)
    assert client.get("/api/me", headers=headers).status_code == 401


@pytest.mark.skipif(os.getenv("RUN_FIREBASE_FULL_SUITE") != "true", reason="requires Firestore emulator")
def test_firestore_readiness():
    main.firebase_app.cache_clear()
    response = TestClient(main.app).get("/api/ready")
    assert response.status_code == 200
    assert response.json() == {"status": "ready"}
