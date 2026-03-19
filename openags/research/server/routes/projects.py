"""Project management API routes."""

from __future__ import annotations

import re
import unicodedata
from pathlib import Path

import yaml
from fastapi import APIRouter, HTTPException, Request, UploadFile
from pydantic import BaseModel

from openags.agent.errors import ProjectError
from openags.research.project import ProjectManager
from openags.models import Project
from openags.research.server.routes.auth import _extract_user

router = APIRouter()


def _slugify(text: str) -> str:
    """Convert text to a valid project ID slug."""
    text = unicodedata.normalize("NFKD", text).encode("ascii", "ignore").decode()
    text = text.lower().strip()
    text = re.sub(r"[^a-z0-9]+", "-", text)
    text = text.strip("-")
    if len(text) < 3:
        import secrets

        text = f"{text or 'project'}-{secrets.token_hex(3)}"
    if len(text) > 64:
        text = text[:64].rstrip("-")
    return text


class CreateProjectRequest(BaseModel):
    name: str
    description: str = ""
    project_id: str = ""
    workspace_dir: str = ""  # custom workspace directory (empty = use default)


class ProjectConfigUpdate(BaseModel):
    """Per-project configuration update."""

    name: str | None = None
    description: str | None = None
    workspace_override: str | None = None
    latex_engine: str | None = None  # pdflatex, xelatex, lualatex
    default_agent: str | None = None
    custom: dict[str, str] = {}


def _get_pm(request: Request) -> ProjectManager:
    pm: ProjectManager = request.app.state.orchestrator.project_mgr
    return pm


@router.post("/", response_model=Project)
async def create_project(request: Request, body: CreateProjectRequest) -> Project:
    pm = _get_pm(request)
    user = _extract_user(request)
    owner_id = user.id if user else ""

    project_id = body.project_id.strip() if body.project_id else _slugify(body.name)

    workspace_dir = None
    if body.workspace_dir.strip():
        workspace_path = Path(body.workspace_dir.strip()).resolve()
        workspace_dir = workspace_path

    try:
        return pm.create(
            project_id, body.name, body.description,
            owner_id=owner_id, workspace_dir=workspace_dir,
        )
    except ProjectError as e:
        raise HTTPException(status_code=409, detail=str(e))


@router.get("/", response_model=list[Project])
async def list_projects(request: Request) -> list[Project]:
    user = _extract_user(request)
    all_projects = _get_pm(request).list_all()
    if not user:
        return all_projects
    return [p for p in all_projects if not p.owner_id or p.owner_id == user.id]


@router.get("/{project_id}", response_model=Project)
async def get_project(request: Request, project_id: str) -> Project:
    try:
        return _get_pm(request).get(project_id)
    except ProjectError:
        raise HTTPException(status_code=404, detail=f"Project '{project_id}' not found")


@router.delete("/{project_id}")
async def delete_project(request: Request, project_id: str) -> dict[str, str]:
    """Delete a project and its workspace directory. This is irreversible."""
    try:
        _get_pm(request).delete(project_id)
        return {"status": "deleted", "project_id": project_id}
    except ProjectError:
        raise HTTPException(status_code=404, detail=f"Project '{project_id}' not found")


@router.post("/{project_id}/files")
async def upload_file(request: Request, project_id: str, file: UploadFile) -> dict[str, object]:
    """Upload a file to the project workspace."""
    pm = _get_pm(request)
    try:
        project = pm.get(project_id)
    except ProjectError:
        raise HTTPException(status_code=404, detail=f"Project '{project_id}' not found")

    uploads_dir = project.workspace / "uploads"
    uploads_dir.mkdir(parents=True, exist_ok=True)

    filename = file.filename or "unnamed"
    # Sanitize filename
    filename = re.sub(r"[^\w.\-]", "_", filename)
    file_path = (uploads_dir / filename).resolve()

    # Prevent path traversal: ensure resolved path stays inside uploads_dir
    if not str(file_path).startswith(str(uploads_dir.resolve())):
        raise HTTPException(status_code=400, detail="Invalid filename")

    content = await file.read()
    file_path.write_bytes(content)

    return {"filename": filename, "path": str(file_path), "size": len(content)}


# ── Per-project configuration ─────────────────────────


def _config_path(project: Project) -> Path:
    return project.workspace / ".openags" / "config.yaml"


@router.get("/{project_id}/config")
async def get_project_config(
    request: Request, project_id: str,
) -> dict[str, object]:
    """Get per-project configuration."""
    pm = _get_pm(request)
    try:
        project = pm.get(project_id)
    except ProjectError:
        raise HTTPException(status_code=404, detail=f"Project '{project_id}' not found")

    cfg_path = _config_path(project)
    if cfg_path.exists():
        data = yaml.safe_load(cfg_path.read_text(encoding="utf-8")) or {}
    else:
        data = {}

    # Always include project metadata
    data.setdefault("name", project.name)
    data.setdefault("description", project.description)
    data.setdefault("workspace", str(project.workspace))
    data.setdefault("latex_engine", "pdflatex")
    return data


@router.put("/{project_id}/config")
async def update_project_config(
    request: Request, project_id: str, body: ProjectConfigUpdate,
) -> dict[str, object]:
    """Update per-project configuration."""
    pm = _get_pm(request)
    try:
        project = pm.get(project_id)
    except ProjectError:
        raise HTTPException(status_code=404, detail=f"Project '{project_id}' not found")

    # Load existing config
    cfg_path = _config_path(project)
    if cfg_path.exists():
        data = yaml.safe_load(cfg_path.read_text(encoding="utf-8")) or {}
    else:
        data = {}

    # Update name/description in project metadata too
    updated_meta = False
    if body.name is not None:
        project.name = body.name
        data["name"] = body.name
        updated_meta = True
    if body.description is not None:
        project.description = body.description
        data["description"] = body.description
        updated_meta = True

    if body.workspace_override is not None:
        override = Path(body.workspace_override).resolve()
        if not override.exists():
            raise HTTPException(status_code=400, detail="Workspace path does not exist")
        data["workspace_override"] = str(override)
    if body.latex_engine is not None:
        if body.latex_engine not in ("pdflatex", "xelatex", "lualatex", "tectonic"):
            raise HTTPException(
                status_code=400,
                detail="latex_engine must be pdflatex, xelatex, lualatex, or tectonic",
            )
        data["latex_engine"] = body.latex_engine
    if body.default_agent is not None:
        data["default_agent"] = body.default_agent
    if body.custom:
        data.setdefault("custom", {})
        data["custom"].update(body.custom)

    # Save config
    cfg_path.write_text(
        yaml.dump(data, allow_unicode=True, default_flow_style=False),
        encoding="utf-8",
    )

    # Save project metadata if changed
    if updated_meta:
        pm._save_meta(project)

    return data
