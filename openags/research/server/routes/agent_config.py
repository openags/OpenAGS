"""Per-module agent configuration API — manage SOUL.md and skills for each section.

Module directories are resolved dynamically: the section name IS the directory
name (no hardcoded mapping). ``sessions`` maps to ``.openags``.
"""

from __future__ import annotations

from pathlib import Path

import yaml
from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel

from openags.agent.errors import ProjectError
from openags.agent.soul import parse_soul
from openags.models import AgentConfig
from openags.research.orchestrator import Orchestrator

router = APIRouter()


# ── Request / Response models ──────────────────────────


class SoulUpdate(BaseModel):
    content: str


class SkillCreate(BaseModel):
    name: str
    description: str
    roles: list[str] = []
    tools: list[str] = []
    triggers: list[str] = []
    version: str = "1.0.0"
    body: str = ""


class SkillUpdate(BaseModel):
    description: str | None = None
    roles: list[str] | None = None
    tools: list[str] | None = None
    triggers: list[str] | None = None
    version: str | None = None
    body: str | None = None


class SkillInfo(BaseModel):
    name: str
    description: str
    roles: list[str]
    tools: list[str]
    triggers: list[str]
    version: str
    body: str
    source: str = "module"  # "module" or "global"


class AgentConfigResponse(BaseModel):
    soul: str
    soul_source: str
    skills: list[SkillInfo]
    global_skills_count: int = 0


class AgentFrontmatterResponse(BaseModel):
    """Parsed AgentConfig from SOUL.md frontmatter."""

    name: str
    description: str
    tools: list[str]
    max_steps: int
    mode: str
    model: str | None = None


# ── Helpers ────────────────────────────────────────────


def _get_orch(request: Request) -> Orchestrator:
    return request.app.state.orchestrator


def _resolve_module_dir(request: Request, project_id: str, section: str) -> Path:
    """Resolve the module directory for a project section.

    The section name IS the directory name directly — no mapping table needed.
    ``sessions`` and ``coordinator`` map to ``.openags`` (project-level).
    """
    orch = _get_orch(request)
    try:
        project = orch.project_mgr.get(project_id)
    except ProjectError:
        raise HTTPException(status_code=404, detail=f"Project '{project_id}' not found")

    if section in ("ags", "sessions", "coordinator"):
        return project.workspace / ".openags"
    return project.workspace / section


def _agent_dir(module_dir: Path) -> Path:
    return module_dir / "agent"


def _skills_dir(module_dir: Path) -> Path:
    return module_dir / "skills"


def _soul_path(module_dir: Path) -> Path:
    return module_dir / "SOUL.md"


def _parse_skill_file(path: Path) -> SkillInfo:
    """Parse a skill markdown file with YAML frontmatter into SkillInfo."""
    text = path.read_text(encoding="utf-8")

    if not text.startswith("---"):
        raise ValueError(f"No YAML frontmatter in {path}")

    end = text.index("---", 3)
    frontmatter_text = text[3:end]
    body = text[end + 3 :].strip()

    frontmatter = yaml.safe_load(frontmatter_text)
    if not isinstance(frontmatter, dict):
        raise ValueError(f"Invalid frontmatter in {path}")

    return SkillInfo(
        name=frontmatter.get("name", path.stem),
        description=frontmatter.get("description", ""),
        roles=frontmatter.get("roles", []),
        tools=frontmatter.get("tools", []),
        triggers=frontmatter.get("triggers", []),
        version=frontmatter.get("version", "1.0.0"),
        body=body,
    )


def _build_skill_content(meta: dict[str, object], body: str) -> str:
    """Build a skill markdown file from frontmatter dict and body."""
    frontmatter = yaml.dump(meta, allow_unicode=True, default_flow_style=False).strip()
    return f"---\n{frontmatter}\n---\n{body}\n"


def _resolve_soul(module_dir: Path, section: str) -> tuple[str, str]:
    """Resolve the SOUL.md content.

    Lookup order:
    1. Module-level: {module_dir}/SOUL.md
    2. Project-level: {project}/.openags/souls/{section}.md
    3. Global: skills/agents/{section}/SOUL.md
    4. Default: empty string

    Returns (content, source) where source is one of:
    "module", "project", "global", "default".
    """
    # 1. Module-level SOUL.md
    module_soul = _soul_path(module_dir)
    if module_soul.exists():
        return module_soul.read_text(encoding="utf-8"), "module"

    # 2. Legacy: Module-level SOUL.md at directory root
    root_soul = module_dir / "SOUL.md"
    if root_soul.exists():
        return root_soul.read_text(encoding="utf-8"), "module"

    # 3. Project-level (use section name directly)
    project_dir = module_dir.parent
    project_soul = project_dir / ".openags" / "souls" / f"{section}.md"
    if project_soul.exists():
        return project_soul.read_text(encoding="utf-8"), "project"

    # 4. Global
    global_soul = Path(f"skills/agents/{section}/SOUL.md")
    if global_soul.exists():
        return global_soul.read_text(encoding="utf-8"), "global"

    # 5. Default
    return "", "default"


def _resolve_soul_frontmatter(module_dir: Path) -> AgentConfig | None:
    """Parse SOUL.md frontmatter into AgentConfig using the soul.py parser.

    Returns None if no SOUL.md is found.
    """
    # Check module-level agent/SOUL.md first, then root SOUL.md
    for candidate in (_soul_path(module_dir), module_dir / "SOUL.md"):
        if candidate.exists():
            config, _ = parse_soul(candidate)
            return config
    return None


def _list_skills(module_dir: Path) -> list[SkillInfo]:
    """List all skills in the module's skills/ directory."""
    skills_path = _skills_dir(module_dir)
    if not skills_path.exists():
        return []

    result: list[SkillInfo] = []
    # Directory-based: skills/skill-name/SKILL.md (Claude Code compatible)
    for path in sorted(skills_path.rglob("SKILL.md")):
        try:
            result.append(_parse_skill_file(path))
        except (ValueError, KeyError):
            continue
    # Legacy flat: skills/skill_name.md
    for path in sorted(skills_path.glob("*.md")):
        if path.name == "SKILL.md":
            continue
        try:
            info = _parse_skill_file(path)
            if not any(s.name == info.name for s in result):
                result.append(info)
        except (ValueError, KeyError):
            continue
    return result


def _list_global_skills(section: str) -> list[SkillInfo]:
    """List global skills applicable to this section's agent.

    Checks both the section name and discovered agent config for role matching.
    """
    result: list[SkillInfo] = []
    global_dir = Path("skills")
    if not global_dir.exists():
        return result

    for path in sorted(global_dir.rglob("SKILL.md")):
        if path.name == "SOUL.md":
            continue
        try:
            info = _parse_skill_file(path)
            # Match by section name in roles list
            if section in info.roles:
                info.source = "global"
                result.append(info)
        except (ValueError, KeyError):
            continue

    return result


# ── Endpoints ──────────────────────────────────────────


@router.get("/{project_id}/{section}", response_model=AgentConfigResponse)
async def get_agent_config(
    request: Request,
    project_id: str,
    section: str,
) -> AgentConfigResponse:
    """Get the full agent configuration for a project section (soul + skills)."""
    module_dir = _resolve_module_dir(request, project_id, section)
    soul_content, soul_source = _resolve_soul(module_dir, section)
    module_skills = _list_skills(module_dir)
    global_skills = _list_global_skills(section)
    all_skills = module_skills + global_skills
    return AgentConfigResponse(
        soul=soul_content,
        soul_source=soul_source,
        skills=all_skills,
        global_skills_count=len(global_skills),
    )


@router.get("/{project_id}/{section}/frontmatter", response_model=AgentFrontmatterResponse)
async def get_agent_frontmatter(
    request: Request,
    project_id: str,
    section: str,
) -> AgentFrontmatterResponse:
    """Get parsed SOUL.md frontmatter as structured AgentConfig data."""
    module_dir = _resolve_module_dir(request, project_id, section)
    config = _resolve_soul_frontmatter(module_dir)
    if config is None:
        # Return defaults for the section
        return AgentFrontmatterResponse(
            name=section,
            description="",
            tools=[],
            max_steps=50,
            mode="subagent",
        )
    return AgentFrontmatterResponse(
        name=config.name,
        description=config.description,
        tools=config.tools,
        max_steps=config.max_steps,
        mode=config.mode,
        model=config.model,
    )


@router.put("/{project_id}/{section}/soul")
async def save_soul(
    request: Request,
    project_id: str,
    section: str,
    body: SoulUpdate,
) -> dict[str, str]:
    """Save SOUL.md content for a project section."""
    module_dir = _resolve_module_dir(request, project_id, section)
    agent = _agent_dir(module_dir)
    agent.mkdir(parents=True, exist_ok=True)
    _soul_path(module_dir).write_text(body.content, encoding="utf-8")
    return {"status": "saved", "source": "module"}


@router.get("/{project_id}/{section}/skills", response_model=list[SkillInfo])
async def list_skills(
    request: Request,
    project_id: str,
    section: str,
) -> list[SkillInfo]:
    """List all skills for a project section."""
    module_dir = _resolve_module_dir(request, project_id, section)
    return _list_skills(module_dir)


@router.post("/{project_id}/{section}/skills", response_model=SkillInfo, status_code=201)
async def create_skill(
    request: Request,
    project_id: str,
    section: str,
    skill: SkillCreate,
) -> SkillInfo:
    """Create a new skill file in a project section."""
    module_dir = _resolve_module_dir(request, project_id, section)
    skills_path = _skills_dir(module_dir)

    # Create skill as directory/SKILL.md (Claude Code compatible)
    skill_dir = skills_path / skill.name
    if skill_dir.exists():
        raise HTTPException(status_code=409, detail=f"Skill '{skill.name}' already exists")
    skill_dir.mkdir(parents=True, exist_ok=True)

    meta = {
        "name": skill.name,
        "description": skill.description,
        "roles": skill.roles,
        "tools": skill.tools,
        "triggers": skill.triggers,
        "version": skill.version,
    }
    file_path = skill_dir / "SKILL.md"
    file_path.write_text(_build_skill_content(meta, skill.body), encoding="utf-8")

    return SkillInfo(
        name=skill.name,
        description=skill.description,
        roles=skill.roles,
        tools=skill.tools,
        triggers=skill.triggers,
        version=skill.version,
        body=skill.body,
    )


@router.put("/{project_id}/{section}/skills/{name}", response_model=SkillInfo)
async def update_skill(
    request: Request,
    project_id: str,
    section: str,
    name: str,
    skill: SkillUpdate,
) -> SkillInfo:
    """Update an existing skill file."""
    module_dir = _resolve_module_dir(request, project_id, section)
    file_path = _skills_dir(module_dir) / f"{name}.md"

    if not file_path.exists():
        raise HTTPException(status_code=404, detail=f"Skill '{name}' not found")

    existing = _parse_skill_file(file_path)

    updated_description = (
        skill.description if skill.description is not None else existing.description
    )
    updated_roles = skill.roles if skill.roles is not None else existing.roles
    updated_tools = skill.tools if skill.tools is not None else existing.tools
    updated_triggers = skill.triggers if skill.triggers is not None else existing.triggers
    updated_version = skill.version if skill.version is not None else existing.version
    updated_body = skill.body if skill.body is not None else existing.body

    meta = {
        "name": name,
        "description": updated_description,
        "roles": updated_roles,
        "tools": updated_tools,
        "triggers": updated_triggers,
        "version": updated_version,
    }
    file_path.write_text(_build_skill_content(meta, updated_body), encoding="utf-8")

    return SkillInfo(
        name=name,
        description=updated_description,
        roles=updated_roles,
        tools=updated_tools,
        triggers=updated_triggers,
        version=updated_version,
        body=updated_body,
    )


@router.delete("/{project_id}/{section}/skills/{name}")
async def delete_skill(
    request: Request,
    project_id: str,
    section: str,
    name: str,
) -> dict[str, str]:
    """Delete a skill file."""
    module_dir = _resolve_module_dir(request, project_id, section)
    file_path = _skills_dir(module_dir) / f"{name}.md"

    if not file_path.exists():
        raise HTTPException(status_code=404, detail=f"Skill '{name}' not found")

    file_path.unlink()
    return {"status": "deleted", "name": name}
