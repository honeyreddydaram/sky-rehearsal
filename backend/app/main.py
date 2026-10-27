"""Trusted Firebase endpoints. Client data access is guarded by Firebase Rules."""
import os
from functools import lru_cache
from typing import Annotated

import firebase_admin
from firebase_admin import auth, firestore, credentials
from google.auth.credentials import AnonymousCredentials
from fastapi import Depends, FastAPI, HTTPException
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from app.school import school_router
from app.telemetry import TrainingEvent, record_event
from app.operations import OperationsMiddleware
from app.catalog import airport_catalog
from app.conditions import AudioRequest, latest_metar, transcribe
from app.instructor import CoachingContext, configuration, generate, reserve_request

app = FastAPI(title="SkyRehearsal API", version="0.2.0")
app.add_middleware(OperationsMiddleware)
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
    storage_emulator = os.getenv("FIREBASE_STORAGE_EMULATOR_HOST")
    gcs_emulator = os.getenv("STORAGE_EMULATOR_HOST")
    if emulator or firestore_emulator or storage_emulator or gcs_emulator:
        if os.getenv("APP_ENV") != "development" or project != "demo-sky-rehearsal":
            raise HTTPException(503, "Emulators are restricted to local development")
        if emulator != "127.0.0.1:9099" or firestore_emulator != "127.0.0.1:8080":
            raise HTTPException(503, "Use the configured loopback emulator suite")
        if storage_emulator not in {None, "127.0.0.1:9199"} or gcs_emulator not in {None, "127.0.0.1:9199", "http://127.0.0.1:9199"}:
            raise HTTPException(503, "Use the configured loopback Storage emulator")
        if storage_emulator:
            os.environ["STORAGE_EMULATOR_HOST"] = "http://127.0.0.1:9199"
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
        return firebase_admin.initialize_app(EmulatorCredentials() if emulator else None, options={"projectId": project, "storageBucket": (os.getenv("FIREBASE_STORAGE_BUCKET") or project + ".firebasestorage.app")}, name="sky-api")
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


@app.post("/api/instructor")
def instructor(context: CoachingContext, user: Annotated[dict, Depends(identity)]):
    config = configuration()
    reserve_request(firebase_app(), user["uid"])
    return generate(context, config)


@app.get("/api/weather/metar")
def metar(airport_id: str = "VOHY"):
    return latest_metar(airport_id)


@app.post("/api/radio/transcribe")
def radio_transcribe(body: AudioRequest, user: Annotated[dict, Depends(identity)]):
    if not os.getenv("GOOGLE_CLOUD_PROJECT") or os.getenv("FIREBASE_AUTH_EMULATOR_HOST"):
        raise HTTPException(503, "Google Cloud Speech is not configured")
    reserve_request(firebase_app(), user["uid"])
    return transcribe(body)


app.include_router(school_router(identity, lambda: firebase_app()))


@app.get('/api/version')
def version():
    return {'release':os.getenv('RELEASE_SHA','development'), 'airports':{id:p['revision'] for id,p in airport_catalog().items()}}


@app.post('/api/telemetry')
def telemetry(body: TrainingEvent, user: Annotated[dict, Depends(identity)]):
    return record_event(firebase_app(),user,body)
