"""Configuration management API routes."""

from __future__ import annotations

import asyncio

from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel

from openags.research.config import load_config, reset_config, save_config, set_config_value
from openags.research.orchestrator import Orchestrator

router = APIRouter()


class SetConfigRequest(BaseModel):
    key: str
    value: str


class AddServerRequest(BaseModel):
    name: str
    host: str
    port: int = 22
    user: str
    key_file: str | None = None
    gpus: list[int] = []


class TestServerResponse(BaseModel):
    connected: bool
    gpu_info: str = ""
    error: str | None = None


class ComputeConfigRequest(BaseModel):
    experiment_sandbox: str = "local"
    experiment_timeout: int = 300


@router.get("/")
async def get_config(request: Request) -> dict:
    """Get current system configuration (secrets masked)."""
    config = request.app.state.config
    data = config.model_dump()

    # Mask secrets
    if "default_backend" in data and "api_key" in data["default_backend"]:
        key = data["default_backend"]["api_key"]
        data["default_backend"]["api_key"] = "***" if key else None

    for name, backend in data.get("backends", {}).items():
        if "api_key" in backend:
            data["backends"][name]["api_key"] = "***" if backend["api_key"] else None

    return data


@router.put("/")
async def update_config(request: Request, body: SetConfigRequest) -> dict:
    """Set a configuration value (dot notation key)."""
    try:
        set_config_value(body.key, body.value)
        new_config = load_config()
        request.app.state.config = new_config
        request.app.state.orchestrator = Orchestrator(new_config)
        display = "***" if "key" in body.key.lower() or "secret" in body.key.lower() else body.value
        return {"key": body.key, "value": display, "status": "ok"}
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.get("/backends")
async def list_backends(request: Request) -> dict:
    """List configured backends and their health."""
    config = request.app.state.config
    return {
        "default": config.default_backend.type,
        "default_model": config.default_backend.model,
        "configured": list(config.backends.keys()),
    }


@router.get("/backends/test")
async def test_backends(request: Request) -> dict:
    """Test backend connectivity."""
    orch: Orchestrator = request.app.state.orchestrator
    try:
        backend = orch._runtime.get_llm_backend()
        ok = await backend.health_check()
        return {"results": {"builtin": ok}}
    except Exception as e:
        return {"results": {"error": str(e)}}


# ── Remote Server Management ────────────────────────


@router.get("/remote-servers")
async def list_remote_servers(request: Request) -> list[dict]:
    """List all configured remote servers."""
    config = request.app.state.config
    return [s.model_dump(mode="json") for s in config.remote_servers]


@router.post("/remote-servers", status_code=201)
async def add_remote_server(request: Request, body: AddServerRequest) -> dict:
    """Add a new remote server."""
    from openags.models import RemoteServer

    config = request.app.state.config

    # Check name uniqueness
    if any(s.name == body.name for s in config.remote_servers):
        raise HTTPException(status_code=409, detail=f"Server '{body.name}' already exists")

    server = RemoteServer(
        name=body.name,
        host=body.host,
        port=body.port,
        user=body.user,
        key_file=body.key_file,
        gpus=body.gpus,
    )
    config.remote_servers.append(server)
    save_config(config)
    reset_config()
    return server.model_dump(mode="json")


@router.delete("/remote-servers/{name}")
async def delete_remote_server(request: Request, name: str) -> dict:
    """Delete a remote server by name."""
    config = request.app.state.config
    before = len(config.remote_servers)
    config.remote_servers = [s for s in config.remote_servers if s.name != name]

    if len(config.remote_servers) == before:
        raise HTTPException(status_code=404, detail=f"Server '{name}' not found")

    save_config(config)
    reset_config()
    return {"status": "deleted", "name": name}


@router.post("/remote-servers/{name}/test", response_model=TestServerResponse)
async def test_remote_server(request: Request, name: str) -> TestServerResponse:
    """Test SSH connection to a remote server and detect GPUs."""
    config = request.app.state.config
    server = next((s for s in config.remote_servers if s.name == name), None)
    if server is None:
        raise HTTPException(status_code=404, detail=f"Server '{name}' not found")

    from openags.research.experiment.ssh_executor import SSHSandbox

    try:
        sandbox = SSHSandbox(server, timeout=15)

        # Test connection
        result = await asyncio.wait_for(
            sandbox.execute("echo ok"),
            timeout=15,
        )
        if not result.success:
            return TestServerResponse(connected=False, error=result.error or "Connection failed")

        # Detect GPUs
        gpu_result = await asyncio.wait_for(
            sandbox.check_gpu(),
            timeout=10,
        )
        gpu_info = gpu_result.data if gpu_result.success else "No GPU detected"

        return TestServerResponse(connected=True, gpu_info=str(gpu_info))
    except TimeoutError:
        return TestServerResponse(connected=False, error="Connection timed out (15s)")
    except Exception as e:
        return TestServerResponse(connected=False, error=str(e))


# ── Compute Configuration ───────────────────────────


@router.put("/compute")
async def update_compute_config(request: Request, body: ComputeConfigRequest) -> dict:
    """Update default compute/execution configuration."""
    valid_modes = ("local", "docker", "remote")
    if body.experiment_sandbox not in valid_modes:
        raise HTTPException(status_code=400, detail=f"Invalid mode: {body.experiment_sandbox}")

    set_config_value("experiment_sandbox", body.experiment_sandbox)
    if body.experiment_timeout > 0:
        set_config_value("experiment_timeout", str(body.experiment_timeout))

    new_config = load_config()
    request.app.state.config = new_config
    return {"status": "ok", "experiment_sandbox": body.experiment_sandbox}


@router.get("/mcp-servers")
async def list_mcp_servers(request: Request) -> list[dict]:
    """List configured MCP servers from mcp.json."""
    import json
    config = request.app.state.config
    mcp_path = config.workspace_dir / "mcp.json"
    if not mcp_path.exists():
        return []
    try:
        data = json.loads(mcp_path.read_text(encoding="utf-8"))
        servers = data.get("servers", [])
        return [{"name": s.get("name", ""), "command": s.get("command", ""), "args": s.get("args", [])} for s in servers]
    except Exception:
        return []


@router.get("/plugins")
async def list_plugins(request: Request) -> list[dict]:
    """List installed plugins."""
    orch = request.app.state.orchestrator
    if hasattr(orch, '_plugin_mgr'):
        return orch._plugin_mgr.list_plugins()
    return []
