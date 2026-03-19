"""Agent execution API routes — run, step, and chat with agents."""

from __future__ import annotations

from collections.abc import AsyncIterator

from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from openags.agent.discovery import AgentDiscovery
from openags.agent.errors import AgentError, BackendError, ProjectError
from openags.research.orchestrator import Orchestrator
from openags.models import AgentResult, RunMode, StepResult

router = APIRouter()


class RunAgentRequest(BaseModel):
    task: str
    module: str = "coordinator"
    role: str = ""  # deprecated alias for module
    agent_name: str = ""
    mode: RunMode = RunMode.AUTO


class StepAgentRequest(BaseModel):
    task: str
    module: str = "coordinator"
    role: str = ""  # deprecated alias for module
    agent_name: str = ""


class RunPipelineRequest(BaseModel):
    task: str
    stages: list[str] | None = None
    mode: RunMode = RunMode.AUTO


class ChatRequest(BaseModel):
    messages: list[dict[str, str]]
    module: str = "coordinator"
    role: str = ""  # deprecated alias for module
    agent_name: str = ""
    stream: bool = False
    session_id: str | None = None


def _get_orch(request: Request) -> Orchestrator:
    return request.app.state.orchestrator


def _effective_name(agent_name: str, module: str, role: str = "") -> str:
    """Resolve effective agent name: prefer agent_name, then module, then role (deprecated)."""
    return agent_name or module or role or "coordinator"


@router.post("/{project_id}/run", response_model=AgentResult)
async def run_agent(request: Request, project_id: str, body: RunAgentRequest) -> AgentResult:
    """Run a single agent on a task."""
    orch = _get_orch(request)
    agent_name = _effective_name(body.agent_name, body.module, body.role)
    try:
        return await orch.run_agent(project_id, agent_name, body.task, body.mode)
    except ProjectError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except AgentError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/{project_id}/step", response_model=StepResult)
async def step_agent(request: Request, project_id: str, body: StepAgentRequest) -> StepResult:
    """Single-step an agent for fine-grained control."""
    orch = _get_orch(request)
    agent_name = _effective_name(body.agent_name, body.module, body.role)
    try:
        return await orch.step_agent(project_id, agent_name, body.task)
    except ProjectError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except AgentError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/{project_id}/pipeline")
async def run_pipeline(
    request: Request, project_id: str, body: RunPipelineRequest,
) -> list[AgentResult]:
    """Run a full or partial research pipeline."""
    orch = _get_orch(request)
    try:
        return await orch.run_pipeline(project_id, body.task, body.stages, body.mode)
    except ProjectError as e:
        raise HTTPException(status_code=404, detail=str(e))


@router.post("/{project_id}/chat")
async def chat(request: Request, project_id: str, body: ChatRequest):
    """Send messages to an agent. Routes through agent system (skills, memory, SOUL.md)."""
    orch = _get_orch(request)
    agent_name = _effective_name(body.agent_name, body.module, body.role)

    try:
        if body.stream:
            async def generate() -> AsyncIterator[str]:
                async for chunk in orch.chat_stream(
                    project_id, agent_name, body.messages, body.session_id,
                ):
                    yield chunk

            return StreamingResponse(generate(), media_type="text/plain")
        else:
            response = await orch.chat(
                project_id, agent_name, body.messages, body.session_id,
            )
            return {"content": response.content, "token_usage": response.token_usage.model_dump()}
    except ProjectError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except (AgentError, BackendError) as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.get("/{project_id}/tokens")
async def get_tokens(request: Request, project_id: str) -> dict[str, int | float]:
    """Get token usage summary for a project."""
    return _get_orch(request).get_token_summary(project_id)


@router.get("/{project_id}/agents")
async def list_agents(request: Request, project_id: str) -> list[dict[str, str]]:
    """Discover and return agent configs for a project."""
    orch = _get_orch(request)
    try:
        project = orch.project_mgr.get(project_id)
    except ProjectError as e:
        raise HTTPException(status_code=404, detail=str(e))

    discovered = AgentDiscovery.discover(project.workspace)
    return [
        {
            "name": config.name,
            "description": config.description,
            "mode": config.mode,
        }
        for config in discovered.values()
    ]


@router.get("/{project_id}/modules")
async def list_modules(request: Request, project_id: str) -> list[dict[str, str]]:
    """List dynamically discovered modules in a project."""
    orch = _get_orch(request)
    try:
        project = orch.project_mgr.get(project_id)
    except ProjectError as e:
        raise HTTPException(status_code=404, detail=str(e))

    from openags.research.project import discover_modules

    modules = discover_modules(project.workspace)
    return [{"name": m, "path": str(project.workspace / m)} for m in modules]


@router.post("/{project_id}/modules")
async def create_module(
    request: Request,
    project_id: str,
    body: dict[str, str],
) -> dict[str, str]:
    """Create a new agent module (directory + SOUL.md)."""
    orch = _get_orch(request)
    try:
        project = orch.project_mgr.get(project_id)
    except ProjectError as e:
        raise HTTPException(status_code=404, detail=str(e))

    name = body.get("name", "")
    description = body.get("description", "")
    if not name:
        raise HTTPException(status_code=400, detail="'name' is required")

    from openags.agent.soul import write_soul
    from openags.models import AgentConfig

    mod_dir = project.workspace / name
    mod_dir.mkdir(parents=True, exist_ok=True)
    (mod_dir / "memory.md").touch(exist_ok=True)
    (mod_dir / "sessions").mkdir(exist_ok=True)

    soul_path = mod_dir / "SOUL.md"
    if not soul_path.exists():
        config = AgentConfig(name=name, description=description)
        write_soul(soul_path, config, f"You are a specialist in **{name}**.")

    return {"name": name, "path": str(mod_dir)}
