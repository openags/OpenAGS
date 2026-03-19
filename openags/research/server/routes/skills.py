"""Skills management API routes."""

from __future__ import annotations

from pathlib import Path

from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel

from openags.models import SkillMeta
from openags.agent.skills.engine import SkillEngine

router = APIRouter()


def _get_skill_engine(request: Request) -> SkillEngine:
    """Get or create the skill engine from app state."""
    if not hasattr(request.app.state, "skill_engine"):
        config = request.app.state.config
        skill_dirs = [
            Path("skills/core"),
            Path("skills/shared"),
            config.workspace_dir / "skills",
        ]
        request.app.state.skill_engine = SkillEngine(skill_dirs=skill_dirs)
    return request.app.state.skill_engine


@router.get("/", response_model=list[SkillMeta])
async def list_skills(request: Request) -> list[SkillMeta]:
    """List all loaded skills."""
    return _get_skill_engine(request).get_all()


@router.get("/count")
async def skill_count(request: Request) -> dict[str, int]:
    return {"count": _get_skill_engine(request).count()}


@router.get("/role/{role}", response_model=list[SkillMeta])
async def skills_for_role(request: Request, role: str) -> list[SkillMeta]:
    """Get skills applicable to a specific agent role or name."""
    engine = _get_skill_engine(request)
    results = engine.get_for_agent(role)
    if not results:
        raise HTTPException(status_code=400, detail=f"Unknown role/agent: {role}")
    return results


class TriggerRequest(BaseModel):
    input: str


@router.post("/match")
async def match_triggers(request: Request, body: TriggerRequest) -> list[SkillMeta]:
    """Find skills matching trigger keywords in user input."""
    return _get_skill_engine(request).match_trigger(body.input)


class PathMatchRequest(BaseModel):
    paths: list[str]


@router.post("/match-paths")
async def match_paths(request: Request, body: PathMatchRequest) -> list[SkillMeta]:
    """Find skills matching file path patterns (Phase 11)."""
    return _get_skill_engine(request).match_paths(body.paths)


@router.get("/{name}")
async def get_skill(request: Request, name: str) -> dict:
    """Get a specific skill by name (metadata + content)."""
    engine = _get_skill_engine(request)
    meta = engine.get(name)
    if meta is None:
        raise HTTPException(status_code=404, detail=f"Skill '{name}' not found")
    content = engine.get_content(name) or ""
    return {"meta": meta.model_dump(), "content": content}
