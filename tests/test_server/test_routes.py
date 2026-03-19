"""Tests for server API routes: auth, experiments, gpu, messaging, manuscript."""

from __future__ import annotations

from pathlib import Path
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from fastapi.testclient import TestClient

from openags.research.auth import UserManager
from openags.research.config import reset_config
from openags.models import ExperimentResult, Project, SystemConfig
from openags.research.server.app import create_app


# ── Fixtures ──────────────────────────────────────────


@pytest.fixture
def app(tmp_path: Path):
    """Create a test app with a temp workspace."""
    reset_config()
    ws = tmp_path / "ws"
    ws.mkdir(parents=True)
    config = SystemConfig(workspace_dir=ws)

    with patch("openags.research.server.app.load_config", return_value=config):
        application = create_app()

    mock_orch = MagicMock()
    mock_orch.project_mgr = MagicMock()
    application.state.orchestrator = mock_orch
    application.state.config = config
    application.state.user_mgr = UserManager(ws)
    application.state.notifier = MagicMock()

    return application


@pytest.fixture
def client(app):
    return TestClient(app)


@pytest.fixture
def mock_orch(app):
    return app.state.orchestrator


# ── Auth routes (/api/auth/) ─────────────────────────


def test_register_and_login(client):
    r = client.post("/api/auth/register", json={
        "username": "alice",
        "password": "secret1234",
        "display_name": "Alice",
    })
    assert r.status_code == 200
    data = r.json()
    assert data["user"]["username"] == "alice"
    assert "token" in data

    r = client.post("/api/auth/login", json={
        "username": "alice",
        "password": "secret1234",
    })
    assert r.status_code == 200
    assert r.json()["user"]["username"] == "alice"


def test_register_duplicate_409(client):
    client.post("/api/auth/register", json={
        "username": "bob",
        "password": "pass1234",
    })
    r = client.post("/api/auth/register", json={
        "username": "bob",
        "password": "pass1234",
    })
    assert r.status_code == 409


def test_login_wrong_password_401(client):
    client.post("/api/auth/register", json={
        "username": "carol",
        "password": "pass1234",
    })
    r = client.post("/api/auth/login", json={
        "username": "carol",
        "password": "wrongpass",
    })
    assert r.status_code == 401


def test_get_me_with_token(client):
    r = client.post("/api/auth/register", json={
        "username": "dave",
        "password": "pass1234",
    })
    token = r.json()["token"]

    r = client.get("/api/auth/me", headers={"Authorization": f"Bearer {token}"})
    assert r.status_code == 200
    assert r.json()["username"] == "dave"


def test_get_me_without_token_401(client):
    r = client.get("/api/auth/me")
    assert r.status_code == 401


def test_logout(client):
    r = client.post("/api/auth/register", json={
        "username": "eve",
        "password": "pass1234",
    })
    token = r.json()["token"]

    r = client.post("/api/auth/logout", headers={"Authorization": f"Bearer {token}"})
    assert r.status_code == 200

    r = client.get("/api/auth/me", headers={"Authorization": f"Bearer {token}"})
    assert r.status_code == 401


# ── Experiment routes (/api/experiments/) ─────────────


def test_run_experiment(client, mock_orch, tmp_path: Path):
    project = Project(
        id="exp-proj",
        name="Exp Project",
        workspace=tmp_path / "ws" / "exp-proj",
    )
    project.workspace.mkdir(parents=True, exist_ok=True)
    mock_orch.project_mgr.get = MagicMock(return_value=project)
    mock_orch.run_experiment = AsyncMock(
        return_value=ExperimentResult(success=True, attempts=1),
    )

    r = client.post("/api/experiments/exp-proj/run", json={
        "code": "print('hello')",
        "filename": "test.py",
    })
    assert r.status_code == 200
    assert r.json()["success"] is True
    mock_orch.run_experiment.assert_called_once()


def test_run_experiment_project_not_found(client, mock_orch):
    from openags.agent.errors import ProjectError

    mock_orch.project_mgr.get = MagicMock(side_effect=ProjectError("not found"))

    r = client.post("/api/experiments/bad-proj/run", json={
        "code": "print('hello')",
    })
    assert r.status_code == 404


def test_list_runs_empty(client, mock_orch, tmp_path: Path):
    project = Project(
        id="empty-proj",
        name="Empty",
        workspace=tmp_path / "ws" / "empty-proj",
    )
    project.workspace.mkdir(parents=True, exist_ok=True)
    mock_orch.project_mgr.get = MagicMock(return_value=project)

    r = client.get("/api/experiments/empty-proj/runs")
    assert r.status_code == 200
    assert r.json() == []


# ── GPU routes (/api/gpu/) ───────────────────────────


def test_list_gpus(client):
    from openags.models import GPUInfo

    fake_gpus = [
        GPUInfo(index=0, name="RTX 4090", memory_total_mb=24576, memory_free_mb=20000),
    ]
    with patch("openags.research.server.routes.gpu.detect_gpus", new_callable=AsyncMock, return_value=fake_gpus):
        r = client.get("/api/gpu/devices")

    assert r.status_code == 200
    data = r.json()
    assert len(data) == 1
    assert data[0]["name"] == "RTX 4090"


def test_allocate_gpus(client, app):
    from openags.models import GPUInfo

    fake_gpus = [
        GPUInfo(index=0, name="RTX 4090", memory_total_mb=24576, memory_free_mb=20000),
        GPUInfo(index=1, name="RTX 4090", memory_total_mb=24576, memory_free_mb=18000),
    ]
    with patch("openags.research.server.routes.gpu.detect_gpus", new_callable=AsyncMock, return_value=fake_gpus), \
         patch("openags.research.server.routes.gpu.allocate_gpus", return_value=[0]):
        r = client.post("/api/gpu/allocate", json={"count": 1})

    assert r.status_code == 200
    data = r.json()
    assert "device_ids" in data
    assert "cuda_env" in data


# ── Messaging routes (/api/messaging/) ───────────────


def test_list_channels(client, app):
    app.state.notifier.channel_ids = ["slack", "email"]

    r = client.get("/api/messaging/channels")
    assert r.status_code == 200
    assert r.json()["channels"] == ["slack", "email"]


def test_health_check(client, app):
    app.state.notifier.health_check_all = AsyncMock(return_value={"slack": True})

    r = client.get("/api/messaging/health")
    assert r.status_code == 200
    assert r.json()["slack"] is True


def test_send_notification(client, app):
    app.state.notifier.notify = AsyncMock(return_value={"slack": True})

    r = client.post("/api/messaging/notify", json={
        "title": "Test",
        "body": "Hello",
        "level": "info",
    })
    assert r.status_code == 200
    assert r.json()["slack"] is True


def test_send_text(client, app):
    app.state.notifier.send_text = AsyncMock(return_value={"slack": True})

    r = client.post("/api/messaging/send", json={"text": "Hello world"})
    assert r.status_code == 200
    assert r.json()["slack"] is True


# ── Manuscript routes (/api/manuscript/) ──────────────


@pytest.fixture
def manuscript_project(tmp_path: Path, mock_orch):
    """Set up a project with a real workspace for manuscript tests."""
    project = Project(
        id="ms-proj",
        name="Manuscript Project",
        workspace=tmp_path / "ws" / "ms-proj",
    )
    project.workspace.mkdir(parents=True, exist_ok=True)
    (project.workspace / "manuscript").mkdir(parents=True, exist_ok=True)
    mock_orch.project_mgr.get = MagicMock(return_value=project)
    return project


def test_get_tree_empty(client, manuscript_project):
    r = client.get("/api/manuscript/ms-proj/tree")
    assert r.status_code == 200
    assert r.json() == []


def test_create_and_read_file(client, manuscript_project):
    r = client.post("/api/manuscript/ms-proj/create", json={
        "path": "intro.tex",
        "is_dir": False,
    })
    assert r.status_code == 200

    r = client.get("/api/manuscript/ms-proj/file", params={"path": "intro.tex"})
    assert r.status_code == 200
    assert r.json()["path"] == "intro.tex"


def test_write_file(client, manuscript_project):
    r = client.put("/api/manuscript/ms-proj/file", json={
        "path": "main.tex",
        "content": "\\documentclass{article}\n\\begin{document}\nHello\n\\end{document}",
    })
    assert r.status_code == 200
    assert r.json()["size"] > 0

    r = client.get("/api/manuscript/ms-proj/file", params={"path": "main.tex"})
    assert r.status_code == 200
    assert "Hello" in r.json()["content"]


def test_rename_file(client, manuscript_project):
    client.put("/api/manuscript/ms-proj/file", json={
        "path": "old.tex",
        "content": "old content",
    })

    r = client.post("/api/manuscript/ms-proj/rename", json={
        "old_path": "old.tex",
        "new_path": "new.tex",
    })
    assert r.status_code == 200

    r = client.get("/api/manuscript/ms-proj/file", params={"path": "new.tex"})
    assert r.status_code == 200
    assert r.json()["content"] == "old content"

    r = client.get("/api/manuscript/ms-proj/file", params={"path": "old.tex"})
    assert r.status_code == 404


def test_delete_file(client, manuscript_project):
    client.put("/api/manuscript/ms-proj/file", json={
        "path": "trash.tex",
        "content": "delete me",
    })

    r = client.delete("/api/manuscript/ms-proj/file", params={"path": "trash.tex"})
    assert r.status_code == 200

    r = client.get("/api/manuscript/ms-proj/file", params={"path": "trash.tex"})
    assert r.status_code == 404


def test_path_traversal_blocked(client, manuscript_project):
    r = client.get("/api/manuscript/ms-proj/file", params={"path": "../../../etc/passwd"})
    assert r.status_code == 400
