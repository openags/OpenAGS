"""Workflow API — DIRECTIVE.md / STATUS.md state + workflow config management."""

from __future__ import annotations

from pathlib import Path
from typing import Any

from fastapi import APIRouter, HTTPException, Request

from openags.agent.directive import parse_directive
from openags.agent.discovery import AgentDiscovery
from openags.agent.status import parse_status
from openags.models import WorkflowConfig

router = APIRouter()


def _get_project_workspace(request: Request, project_id: str) -> Path:
    """Get project workspace path."""
    orch = request.app.state.orchestrator
    project = orch.project_mgr.get(project_id)
    return project.workspace


def _get_agent_dirs(workspace: Path) -> list[str]:
    """Get all agent directory names (excluding coordinator)."""
    discovered = AgentDiscovery.discover(workspace)
    return [name for name in discovered if name not in ("ags", "coordinator")]


@router.get("/{project_id}/status")
async def get_workflow_status(request: Request, project_id: str) -> dict[str, Any]:
    """Return all agents' STATUS.md + DIRECTIVE.md parsed as JSON."""
    workspace = _get_project_workspace(request, project_id)
    agent_dirs = _get_agent_dirs(workspace)

    agents: dict[str, Any] = {}
    for name in agent_dirs:
        agent_dir = workspace / name
        status = parse_status(agent_dir)
        directive = parse_directive(agent_dir)
        agents[name] = {
            "status": status.model_dump() if status else None,
            "directive": directive.model_dump() if directive else None,
        }

    # Coordinator status (root)
    coord_status = parse_status(workspace)
    coord_directive = parse_directive(workspace)

    return {
        "ags": {
            "status": coord_status.model_dump() if coord_status else None,
            "directive": coord_directive.model_dump() if coord_directive else None,
        },
        "agents": agents,
    }


@router.get("/{project_id}/config")
async def get_workflow_config(request: Request, project_id: str) -> dict[str, Any]:
    """Return workflow configuration."""
    config = request.app.state.config
    return config.workflow.model_dump()


@router.put("/{project_id}/config")
async def update_workflow_config(request: Request, project_id: str, body: dict[str, Any]) -> dict[str, Any]:
    """Update workflow configuration."""
    from openags.research.config import load_config, set_config_value

    for key, value in body.items():
        set_config_value(f"workflow.{key}", value)

    new_config = load_config()
    request.app.state.config = new_config
    return {"status": "ok", "workflow": new_config.workflow.model_dump()}


@router.get("/{project_id}/decision-log")
async def get_decision_log(request: Request, project_id: str) -> dict[str, Any]:
    """Return coordinator decision history from memory.md."""
    workspace = _get_project_workspace(request, project_id)
    memory_path = workspace / "memory.md"

    if not memory_path.exists():
        return {"decisions": []}

    content = memory_path.read_text(encoding="utf-8")
    return {"decisions": content}
