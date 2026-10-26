"""Small API foundation. Authentication and session storage arrive in milestone 4."""
import os

import psycopg
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel

app = FastAPI(title="SkyRehearsal API", version="0.1.0")


class Health(BaseModel):
    status: str


@app.get("/api/health", response_model=Health)
def health() -> Health:
    """Liveness is independent of the database."""
    return Health(status="ok")


@app.get("/api/ready", response_model=Health)
def ready() -> Health:
    """Readiness fails closed when PostgreSQL is unconfigured or unreachable."""
    database_url = os.getenv("DATABASE_URL")
    if not database_url:
        raise HTTPException(status_code=503, detail="Database is not configured")
    try:
        with psycopg.connect(database_url, connect_timeout=3) as connection:
            connection.execute("SELECT 1").fetchone()
    except psycopg.Error:
        # Connection errors can contain credentials; do not return them to clients.
        raise HTTPException(status_code=503, detail="Database is unavailable") from None
    return Health(status="ready")
