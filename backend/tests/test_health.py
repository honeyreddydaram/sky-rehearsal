import os

import pytest
from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)


def test_liveness_without_database(monkeypatch):
    monkeypatch.delenv("DATABASE_URL", raising=False)
    response = client.get("/api/health")
    assert response.status_code == 200
    assert response.json() == {"status": "ok"}


def test_unconfigured_database_is_not_ready(monkeypatch):
    monkeypatch.delenv("DATABASE_URL", raising=False)
    response = client.get("/api/ready")
    assert response.status_code == 503
    assert response.json() == {"detail": "Database is not configured"}


def test_unreachable_database_is_not_ready(monkeypatch):
    monkeypatch.setenv("DATABASE_URL", "postgresql://private:do-not-expose@127.0.0.1:1/missing")
    response = client.get("/api/ready")
    assert response.status_code == 503
    assert "do-not-expose" not in response.text


@pytest.mark.skipif(not os.getenv("DATABASE_URL"), reason="requires PostgreSQL")
def test_postgres_readiness():
    response = client.get("/api/ready")
    assert response.status_code == 200
    assert response.json() == {"status": "ready"}
