"""Tests for Phase 3: Server routes, WebSocket, and FrontendAdapter."""

from __future__ import annotations

import json
from pathlib import Path
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from fastapi.testclient import TestClient

from openags.research.config import reset_config
from openags.models import (
    AgentResult,
    BackendResponse,
    StepResult,
    SystemConfig,
    TokenUsage,
)
from openags.research.server.app import create_app
from openags.research.server.frontend import CLIAdapter, FrontendAdapter, WebSocketAdapter
from openags.research.server.routes.ws import ConnectionManager


# ── Fixtures ──────────────────────────────────────────


@pytest.fixture
def app(tmp_path: Path):
    """Create a test app with a temp workspace."""
    reset_config()
    config = SystemConfig(workspace_dir=tmp_path / "ws")
    config.workspace_dir.mkdir(parents=True)

    with patch("openags.research.server.app.load_config", return_value=config):
        application = create_app()

    mock_orch = MagicMock()
    mock_orch.project_mgr = MagicMock()
    mock_orch._runtime = MagicMock()
    application.state.orchestrator = mock_orch
    application.state.config = config

    return application


@pytest.fixture
def client(app):
    return TestClient(app)


@pytest.fixture
def mock_orch(app):
    return app.state.orchestrator


# ── Health ────────────────────────────────────────────


def test_health(client):
    r = client.get("/api/health")
    assert r.status_code == 200
    assert r.json()["status"] == "ok"


# ── Agent routes ──────────────────────────────────────


def test_run_agent(client, mock_orch):
    result = AgentResult(success=True, output="Done", token_usage=TokenUsage())
    mock_orch.run_agent = AsyncMock(return_value=result)

    r = client.post("/api/agents/proj-1/run", json={
        "task": "Find papers on LLMs",
        "role": "literature",
    })
    assert r.status_code == 200
    assert r.json()["success"] is True
    assert r.json()["output"] == "Done"


def test_run_agent_project_not_found(client, mock_orch):
    from openags.agent.errors import ProjectError
    mock_orch.run_agent = AsyncMock(side_effect=ProjectError("not found"))

    r = client.post("/api/agents/bad/run", json={"task": "x"})
    assert r.status_code == 404


def test_run_agent_agent_error(client, mock_orch):
    from openags.agent.errors import AgentError
    mock_orch.run_agent = AsyncMock(side_effect=AgentError("broken"))

    r = client.post("/api/agents/proj/run", json={"task": "x"})
    assert r.status_code == 400


def test_step_agent(client, mock_orch):
    result = StepResult(content="Step done", done=True)
    mock_orch.step_agent = AsyncMock(return_value=result)

    r = client.post("/api/agents/proj-1/step", json={
        "task": "Next step",
        "role": "ags",
    })
    assert r.status_code == 200
    assert r.json()["content"] == "Step done"


def test_run_pipeline(client, mock_orch):
    results = [
        AgentResult(success=True, output="Lit done", token_usage=TokenUsage()),
        AgentResult(success=True, output="Exp done", token_usage=TokenUsage()),
    ]
    mock_orch.run_pipeline = AsyncMock(return_value=results)

    r = client.post("/api/agents/proj-1/pipeline", json={
        "task": "Research transformers",
        "stages": ["literature", "experiments"],
    })
    assert r.status_code == 200
    assert len(r.json()) == 2


def test_list_modules(client, mock_orch):
    """Test the modules discovery endpoint (replaces old /roles)."""
    r = client.get("/api/agents/proj-1/modules")
    assert r.status_code == 200
    modules = r.json()
    assert isinstance(modules, list)


def test_get_tokens(client, mock_orch):
    mock_orch.get_token_summary = MagicMock(return_value={
        "total_tokens": 1000,
        "cost_usd": 0.05,
    })
    r = client.get("/api/agents/proj-1/tokens")
    assert r.status_code == 200
    assert r.json()["cost_usd"] == 0.05


def test_chat_non_streaming(client, mock_orch):
    mock_orch.chat = AsyncMock(return_value=BackendResponse(
        content="Hello from LLM",
        token_usage=TokenUsage(input_tokens=10, output_tokens=20),
    ))

    r = client.post("/api/agents/proj-1/chat", json={
        "messages": [{"role": "user", "content": "Hi"}],
        "stream": False,
    })
    assert r.status_code == 200
    assert r.json()["content"] == "Hello from LLM"
    mock_orch.chat.assert_called_once()


# ── Config routes ─────────────────────────────────────


def test_get_config(client):
    r = client.get("/api/config/")
    assert r.status_code == 200
    assert "workspace_dir" in r.json()


def test_get_config_masks_api_key(client, app):
    app.state.config.default_backend.api_key = "sk-secret-key-12345"
    r = client.get("/api/config/")
    assert r.status_code == 200
    assert r.json()["default_backend"]["api_key"] == "***"


def test_list_backends(client):
    r = client.get("/api/config/backends")
    assert r.status_code == 200
    data = r.json()
    assert "default" in data
    assert "default_model" in data


# ── Skills routes ─────────────────────────────────────


def test_list_skills(client):
    r = client.get("/api/skills/")
    assert r.status_code == 200
    assert isinstance(r.json(), list)


def test_skill_count(client):
    r = client.get("/api/skills/count")
    assert r.status_code == 200
    assert r.json()["count"] >= 0


def test_skills_for_invalid_role(client):
    r = client.get("/api/skills/role/nonexistent")
    assert r.status_code == 200
    assert r.json() == []


def test_skills_for_valid_role(client):
    r = client.get("/api/skills/role/literature")
    assert r.status_code == 200
    assert isinstance(r.json(), list)


def test_skill_not_found(client):
    r = client.get("/api/skills/nonexistent_skill")
    assert r.status_code == 404


def test_match_triggers(client):
    r = client.post("/api/skills/match", json={"input": "search papers"})
    assert r.status_code == 200
    assert isinstance(r.json(), list)


# ── WebSocket ConnectionManager ───────────────────────


@pytest.fixture
def conn_mgr():
    return ConnectionManager()


def test_connection_count_empty(conn_mgr):
    assert conn_mgr.get_connection_count() == 0
    assert conn_mgr.get_connection_count("proj") == 0


async def test_connect_and_disconnect(conn_mgr):
    mock_ws = AsyncMock()
    await conn_mgr.connect("proj", mock_ws)
    assert conn_mgr.get_connection_count("proj") == 1
    conn_mgr.disconnect("proj", mock_ws)
    assert conn_mgr.get_connection_count("proj") == 0


async def test_broadcast(conn_mgr):
    mock_ws = AsyncMock()
    await conn_mgr.connect("proj", mock_ws)
    await conn_mgr.broadcast("proj", "test.event", {"key": "value"})
    mock_ws.send_text.assert_called_once()
    sent = json.loads(mock_ws.send_text.call_args[0][0])
    assert sent["event"] == "test.event"
    assert sent["data"]["key"] == "value"


async def test_broadcast_removes_dead(conn_mgr):
    good_ws = AsyncMock()
    bad_ws = AsyncMock()
    bad_ws.send_text.side_effect = RuntimeError("dead")

    await conn_mgr.connect("proj", good_ws)
    await conn_mgr.connect("proj", bad_ws)
    assert conn_mgr.get_connection_count("proj") == 2

    await conn_mgr.broadcast("proj", "evt", {})
    assert conn_mgr.get_connection_count("proj") == 1


async def test_broadcast_no_connections(conn_mgr):
    await conn_mgr.broadcast("empty", "evt", {})


def test_websocket_endpoint(client):
    with client.websocket_connect("/ws/test-proj") as ws:
        ws.send_text(json.dumps({"action": "interrupt"}))


def test_websocket_invalid_json(client):
    with client.websocket_connect("/ws/test-proj") as ws:
        ws.send_text("not json")
        data = ws.receive_text()
        msg = json.loads(data)
        assert "error" in msg


# ── FrontendAdapter Protocol ──────────────────────────


def test_cli_adapter_protocol():
    adapter = CLIAdapter()
    assert isinstance(adapter, FrontendAdapter)
    assert adapter.adapter_id == "cli"


def test_ws_adapter_protocol():
    adapter = WebSocketAdapter()
    assert isinstance(adapter, FrontendAdapter)
    assert adapter.adapter_id == "web"


async def test_cli_send_output(capsys):
    adapter = CLIAdapter()
    await adapter.send_output("proj", "Hello world")
    assert "Hello world" in capsys.readouterr().out


async def test_cli_send_event(capsys):
    adapter = CLIAdapter()
    await adapter.send_event("proj", "agent.completed", {"ok": True})
    assert "agent.completed" in capsys.readouterr().out


async def test_ws_adapter_send_output():
    adapter = WebSocketAdapter()
    mock_ws = AsyncMock()
    await adapter._manager.connect("proj", mock_ws)
    await adapter.send_output("proj", "Test output")
    mock_ws.send_text.assert_called_once()


async def test_ws_adapter_send_event():
    adapter = WebSocketAdapter()
    mock_ws = AsyncMock()
    await adapter._manager.connect("proj", mock_ws)
    await adapter.send_event("proj", "agent.done", {"x": 1})
    sent = json.loads(mock_ws.send_text.call_args[0][0])
    assert sent["event"] == "agent.done"


# ── Project routes regression ─────────────────────────


def test_projects_crud(client, mock_orch):
    from openags.models import Project

    mock_orch.project_mgr.create = MagicMock(return_value=Project(
        id="my-proj", name="My Project", workspace=Path("/tmp/ws/my-proj"),
    ))
    mock_orch.project_mgr.list_all = MagicMock(return_value=[])
    mock_orch.project_mgr.get = MagicMock(return_value=Project(
        id="my-proj", name="My Project", workspace=Path("/tmp/ws/my-proj"),
    ))

    assert client.post("/api/projects/", json={
        "project_id": "my-proj", "name": "My Project",
    }).status_code == 200
    assert client.get("/api/projects/").status_code == 200
    assert client.get("/api/projects/my-proj").status_code == 200
