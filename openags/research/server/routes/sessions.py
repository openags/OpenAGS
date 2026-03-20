"""Session management API routes — create, list, get, and delete chat sessions.

Sessions are scoped to a project module (section). Each section has its own
sessions directory: {project}/{section}/sessions/

Module directories are resolved dynamically — no hardcoded mapping required.
"""

from __future__ import annotations

from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel

from openags.agent.errors import ProjectError
from openags.agent.session import SessionManager
from openags.models import RunMode, Session
from openags.research.orchestrator import Orchestrator

router = APIRouter()


class CreateSessionRequest(BaseModel):
    module: str = "ags"
    agent_role: str = ""  # deprecated alias for module
    agent_name: str = ""
    title: str = ""
    mode: RunMode = RunMode.INTERACTIVE


def _get_orch(request: Request) -> Orchestrator:
    return request.app.state.orchestrator


def _resolve_section_dir(section: str) -> str:
    """Map a section name to a directory name.

    ``sessions`` and ``coordinator`` map to ``.openags`` (project-level).
    Everything else maps directly to the section name itself — no hardcoded
    lookup table required.
    """
    if section in ("ags", "sessions", "coordinator"):
        return ".openags"
    return section


def _get_session_mgr(request: Request, project_id: str, section: str) -> SessionManager:
    """Get a SessionManager for a specific project section."""
    orch = _get_orch(request)
    try:
        project = orch.project_mgr.get(project_id)
    except ProjectError:
        raise HTTPException(status_code=404, detail=f"Project '{project_id}' not found")

    dir_name = _resolve_section_dir(section)
    module_dir = project.workspace / dir_name
    return SessionManager(module_dir)


@router.post("/{project_id}/{section}", response_model=Session)
async def create_session(
    request: Request,
    project_id: str,
    section: str,
    body: CreateSessionRequest,
) -> Session:
    """Create a new chat session in a project section."""
    mgr = _get_session_mgr(request, project_id, section)

    agent_name = body.agent_name or body.module or body.agent_role
    session = mgr.create(project_id, agent_name, body.mode, agent_name=agent_name)

    # Re-save with title if provided
    if body.title:
        import json

        path = mgr._sessions_dir / f"{session.id}.jsonl"
        meta = session.model_dump(mode="json", exclude={"messages"})
        meta["title"] = body.title
        path.write_text(json.dumps(meta) + "\n", encoding="utf-8")
        session.title = body.title
    return session


@router.get("/{project_id}/{section}", response_model=list[Session])
async def list_sessions(request: Request, project_id: str, section: str) -> list[Session]:
    """List all sessions in a project section."""
    mgr = _get_session_mgr(request, project_id, section)
    return mgr.list_sessions(project_id)


@router.get("/{project_id}/{section}/{session_id}", response_model=Session)
async def get_session(
    request: Request,
    project_id: str,
    section: str,
    session_id: str,
) -> Session:
    """Get a session with its full message history."""
    mgr = _get_session_mgr(request, project_id, section)
    session = mgr.get(session_id)
    if session is None:
        raise HTTPException(status_code=404, detail=f"Session '{session_id}' not found")
    return session


@router.delete("/{project_id}/{section}/{session_id}")
async def delete_session(
    request: Request,
    project_id: str,
    section: str,
    session_id: str,
) -> dict[str, str]:
    """Delete a session."""
    mgr = _get_session_mgr(request, project_id, section)
    if not mgr.delete(session_id):
        raise HTTPException(status_code=404, detail=f"Session '{session_id}' not found")
    return {"status": "deleted", "session_id": session_id}
