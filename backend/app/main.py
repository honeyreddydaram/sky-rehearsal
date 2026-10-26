"""Trusted Firebase endpoints. Client data access is guarded by Firebase Rules."""
import os
from functools import lru_cache
from typing import Annotated

import firebase_admin
from firebase_admin import auth, firestore, credentials
from google.auth.credentials import AnonymousCredentials
from fastapi import Depends, FastAPI, HTTPException
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

app = FastAPI(title="SkyRehearsal API", version="0.2.0")
bearer = HTTPBearer(auto_error=False)
ROLES = {"student", "instructor", "school_admin", "platform_admin"}


class EmulatorCredentials(credentials.Base):
    def get_credential(self):
        return AnonymousCredentials()


@lru_cache
def firebase_app():
    project = os.getenv("FIREBASE_PROJECT_ID")
    if not project:
        raise HTTPException(503, "Firebase project is not configured")
    emulator = os.getenv("FIREBASE_AUTH_EMULATOR_HOST")
    firestore_emulator = os.getenv("FIRESTORE_EMULATOR_HOST")
    if emulator or firestore_emulator:
        if os.getenv("APP_ENV") != "development" or project != "demo-sky-rehearsal":
            raise HTTPException(503, "Emulators are restricted to local development")
        if emulator != "127.0.0.1:9099" or firestore_emulator != "127.0.0.1:8080":
            raise HTTPException(503, "Use the configured loopback emulator suite")
    # ADC/workload identity is used in production. Never load a key from chat or Vite.
    try:
        try:
            existing = firebase_admin.get_app("sky-api")
            if existing.project_id == project:
                return existing
            raise ValueError("Project changed; restart API")
        except ValueError as error:
            if "Project changed" in str(error):
                raise
        return firebase_admin.initialize_app(EmulatorCredentials() if emulator else None, options={"projectId": project}, name="sky-api")
    except Exception:
        raise HTTPException(503, "Firebase initialization failed") from None


def identity(credentials: Annotated[HTTPAuthorizationCredentials | None, Depends(bearer)]):
    if credentials is None:
        raise HTTPException(401, "Sign in required", headers={"WWW-Authenticate": "Bearer"})
    application = firebase_app()
    try:
        token = auth.verify_id_token(credentials.credentials, app=application, check_revoked=True)
    except Exception:
        raise HTTPException(401, "Invalid or expired sign-in", headers={"WWW-Authenticate": "Bearer"}) from None
    role = token.get("role", "student")
    return {"uid": token["uid"], "email": token.get("email"), "role": role if role in ROLES else "student"}


@app.get("/api/health")
def health():
    return {"status": "ok"}


@app.get("/api/ready")
def ready():
    application = firebase_app()
    try:
        # Read-only operation verifies actual Firestore access; missing doc is fine.
        firestore.client(app=application).document("_system/readiness").get(timeout=3, retry=None)
    except Exception:
        raise HTTPException(503, "Firestore is unavailable") from None
    return {"status": "ready"}


@app.get("/api/me")
def me(user: Annotated[dict, Depends(identity)]):
    return user


@app.get("/api/admin/health")
def admin_health(user: Annotated[dict, Depends(identity)]):
    if user["role"] != "platform_admin":
        raise HTTPException(403, "Platform administrator required")
    return {"status": "ok"}
