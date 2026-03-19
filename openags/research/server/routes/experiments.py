"""Experiment execution API routes."""

from __future__ import annotations

import logging

from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel

from openags.agent.errors import ProjectError
from openags.models import ExperimentResult, SandboxMode

router = APIRouter()
logger = logging.getLogger(__name__)


class RunExperimentRequest(BaseModel):
    """Submit an experiment for execution."""

    code: str
    filename: str = "experiment.py"
    requirements: list[str] = []
    gpu_count: int = 0
    sandbox: SandboxMode = SandboxMode.LOCAL
    timeout: int = 3600


class ExperimentStatus(BaseModel):
    id: str
    project_id: str
    name: str
    status: str
    result: ExperimentResult | None = None


def _get_orch(request: Request):
    return request.app.state.orchestrator


@router.post("/{project_id}/run")
async def run_experiment(
    request: Request,
    project_id: str,
    body: RunExperimentRequest,
) -> ExperimentResult:
    """Run experiment code in a sandbox with auto-fix."""
    orch = _get_orch(request)
    try:
        project = orch.project_mgr.get(project_id)
    except ProjectError:
        raise HTTPException(status_code=404, detail=f"Project '{project_id}' not found")

    # Write experiment code to file
    code_dir = project.workspace / "experiments" / "runs"
    code_dir.mkdir(parents=True, exist_ok=True)

    import secrets

    run_id = f"run-{secrets.token_hex(4)}"
    run_dir = code_dir / run_id
    run_dir.mkdir(parents=True, exist_ok=True)
    code_path = run_dir / body.filename
    code_path.write_text(body.code, encoding="utf-8")

    # Write requirements if any
    if body.requirements:
        req_path = run_dir / "requirements.txt"
        req_path.write_text("\n".join(body.requirements), encoding="utf-8")

    result = await orch.run_experiment(
        project_id=project_id,
        name=run_id,
        code_path=code_path,
        gpu_count=body.gpu_count,
        sandbox_mode=body.sandbox,
        timeout=body.timeout,
    )
    return result


@router.get("/{project_id}/runs")
async def list_runs(request: Request, project_id: str) -> list[dict[str, str]]:
    """List experiment run directories for a project."""
    orch = _get_orch(request)
    try:
        project = orch.project_mgr.get(project_id)
    except ProjectError:
        raise HTTPException(status_code=404, detail=f"Project '{project_id}' not found")

    runs_dir = project.workspace / "experiments" / "runs"
    if not runs_dir.exists():
        return []

    runs = []
    for d in sorted(runs_dir.iterdir(), reverse=True):
        if d.is_dir():
            code_files = list(d.glob("*.py"))
            runs.append(
                {
                    "id": d.name,
                    "path": str(d),
                    "files": [f.name for f in code_files],
                }
            )
    return runs
