"""Tests for session CRUD API routes."""

from __future__ import annotations

from pathlib import Path
from unittest.mock import MagicMock, patch

import pytest
from fastapi.testclient import TestClient

from openags.research.config import reset_config
from openags.research.project import ProjectManager
from openags.models import Project, SystemConfig
from openags.research.server.app import create_app


@pytest.fixture
def workspace(tmp_path: Path) -> Path:
    ws = tmp_path / "ws"
    ws.mkdir()
    return ws


@pytest.fixture
def project(workspace: Path) -> Project:
    pm = ProjectManager(workspace)
    return pm.create("test-proj", "Test Project")


@pytest.fixture
def app(workspace: Path, project: Project):
    reset_config()
    config = SystemConfig(workspace_dir=workspace)

    with patch("openags.research.server.app.load_config", return_value=config):
        application = create_app()

    mock_orch = MagicMock()
    mock_orch.project_mgr = ProjectManager(workspace)
    application.state.orchestrator = mock_orch
    application.state.config = config

    return application


@pytest.fixture
def client(app):
    return TestClient(app)


def test_create_session(client):
    # Sessions are scoped to a section (module name)
    r = client.post("/api/sessions/test-proj/sessions", json={
        "agent_role": "coordinator",
        "title": "My Chat",
    })
    assert r.status_code == 200
    data = r.json()
    assert data["project_id"] == "test-proj"
    assert data["agent_role"] == "coordinator"
    assert data["title"] == "My Chat"
    assert "id" in data


def test_list_sessions_empty(client):
    r = client.get("/api/sessions/test-proj/literature")
    assert r.status_code == 200
    assert r.json() == []


def test_list_sessions_after_create(client):
    client.post("/api/sessions/test-proj/literature", json={"agent_role": "literature"})
    client.post("/api/sessions/test-proj/literature", json={"agent_role": "literature"})

    r = client.get("/api/sessions/test-proj/literature")
    assert r.status_code == 200
    assert len(r.json()) == 2


def test_get_session(client):
    create_r = client.post("/api/sessions/test-proj/proposal", json={"agent_role": "proposer"})
    assert create_r.status_code == 200
    session_id = create_r.json()["id"]

    r = client.get(f"/api/sessions/test-proj/proposal/{session_id}")
    assert r.status_code == 200
    assert r.json()["id"] == session_id


def test_get_session_not_found(client):
    r = client.get("/api/sessions/test-proj/literature/nonexistent")
    assert r.status_code == 404


def test_delete_session(client):
    create_r = client.post("/api/sessions/test-proj/manuscript", json={"agent_role": "writer"})
    assert create_r.status_code == 200
    session_id = create_r.json()["id"]

    r = client.delete(f"/api/sessions/test-proj/manuscript/{session_id}")
    assert r.status_code == 200
    assert r.json()["status"] == "deleted"

    # Verify it's gone
    r = client.get(f"/api/sessions/test-proj/manuscript/{session_id}")
    assert r.status_code == 404


def test_delete_session_not_found(client):
    r = client.delete("/api/sessions/test-proj/literature/nonexistent")
    assert r.status_code == 404


def test_session_for_nonexistent_project(client):
    r = client.get("/api/sessions/no-such-project/literature")
    assert r.status_code == 404
