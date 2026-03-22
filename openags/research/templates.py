"""Project template system — define initial directory structures for new projects.

Templates replace the hardcoded _PROJECT_SUBDIRS list, making project
structure extensible without code changes.

SOUL body text is stored in .md files under openags/research/templates/{template_name}/
so you can edit them without touching Python code.
"""

from __future__ import annotations

import logging
from pathlib import Path

from pydantic import BaseModel

logger = logging.getLogger(__name__)

# Directory containing template .md files (sibling to this file)
_TEMPLATES_DIR = Path(__file__).parent / "templates"


def _load_soul_body(template_name: str, agent_name: str) -> str:
    """Load SOUL body text from templates/{agent_name}.md"""
    md_path = _TEMPLATES_DIR / f"{agent_name}.md"
    if md_path.exists():
        return md_path.read_text(encoding="utf-8").strip()
    return ""


class ModuleTemplate(BaseModel):
    """Template for a single agent module within a project."""

    name: str
    soul_frontmatter: dict[str, object] = {}
    soul_body: str = ""
    subdirs: list[str] = []
    default_files: dict[str, str] = {}  # relative_path → content


class ProjectTemplate(BaseModel):
    """Template defining a project's initial structure."""

    name: str
    description: str = ""
    root_soul_frontmatter: dict[str, object] = {}
    root_soul_body: str = ""
    modules: list[ModuleTemplate] = []


# ── Built-in templates ─────────────────────────────────


def _research_template() -> ProjectTemplate:
    """The default research project template — 8 modules."""
    return ProjectTemplate(
        name="research",
        description="Full research workflow: literature → proposal → experiments → manuscript",
        root_soul_frontmatter={
            "name": "ags",
            "description": "AGS autonomous research coordinator",
            "tools": [
                "check_progress",
                "dispatch_agent",
                "ask_user",
                "read",
                "write",
                "ls",
                "grep",
                "bash",
                "sub_agent",
            ],
            "max_steps": 50,
            "done_strategy": "tool_required",
            "min_steps": 3,
        },
        root_soul_body=_load_soul_body("research", "ags"),
        modules=[
            ModuleTemplate(
                name="pi",
                soul_frontmatter={
                    "name": "pi",
                    "description": "Research advisor and brainstorm partner",
                    "tools": ["read", "ls", "grep", "check_progress"],
                },
                soul_body=_load_soul_body("research", "pi"),
                subdirs=["sessions", "skills"],
            ),
            ModuleTemplate(
                name="literature",
                soul_frontmatter={
                    "name": "literature",
                    "description": "Literature review and paper search",
                    "tools": [
                        "arxiv",
                        "semantic_scholar",
                        "read",
                        "write",
                        "edit",
                        "ls",
                        "grep",
                        "sub_agent",
                    ],
                    "upstream_files": ["../chatroom.md"],
                },
                soul_body=_load_soul_body("research", "literature"),
                subdirs=["papers", "notes", "sessions", "skills"],
            ),
            ModuleTemplate(
                name="proposal",
                soul_frontmatter={
                    "name": "proposal",
                    "description": "Research proposal and hypothesis generation",
                    "tools": [
                        "read",
                        "write",
                        "edit",
                        "ls",
                        "grep",
                        "sub_agent",
                    ],
                    "upstream_files": ["../chatroom.md"],
                },
                soul_body=_load_soul_body("research", "proposal"),
                subdirs=["ideas", "figures", "sessions", "skills"],
            ),
            ModuleTemplate(
                name="experiments",
                soul_frontmatter={
                    "name": "experiments",
                    "description": "Experiment design, execution, and analysis",
                    "tools": [
                        "read",
                        "write",
                        "edit",
                        "ls",
                        "grep",
                        "bash",
                        "sub_agent",
                    ],
                    "upstream_files": ["../chatroom.md"],
                },
                soul_body=_load_soul_body("research", "experiments"),
                subdirs=["code", "data", "results", "runs", "sessions", "skills"],
            ),
            ModuleTemplate(
                name="manuscript",
                soul_frontmatter={
                    "name": "manuscript",
                    "description": "Manuscript writing and LaTeX editing",
                    "tools": [
                        "read",
                        "write",
                        "edit",
                        "ls",
                        "grep",
                        "sub_agent",
                    ],
                    "upstream_files": ["../chatroom.md"],
                },
                soul_body=_load_soul_body("research", "manuscript"),
                subdirs=["figures", "sessions", "skills"],
            ),
            ModuleTemplate(
                name="review",
                soul_frontmatter={
                    "name": "review",
                    "description": "Peer review and quality assessment",
                    "tools": [
                        "arxiv",
                        "semantic_scholar",
                        "read",
                        "write",
                        "edit",
                        "ls",
                        "grep",
                        "sub_agent",
                    ],
                    "upstream_files": ["../chatroom.md"],
                },
                soul_body=_load_soul_body("research", "review"),
                subdirs=["reviews", "responses", "sessions", "skills"],
            ),
            ModuleTemplate(
                name="references",
                soul_frontmatter={
                    "name": "references",
                    "description": "Citation management and verification",
                    "tools": [
                        "arxiv",
                        "semantic_scholar",
                        "read",
                        "write",
                        "edit",
                        "ls",
                        "grep",
                        "sub_agent",
                    ],
                },
                soul_body=_load_soul_body("research", "references"),
                subdirs=["pdfs", "sessions", "skills"],
            ),
        ],
    )


_TEMPLATES: dict[str, ProjectTemplate] = {}


def _ensure_loaded() -> None:
    if not _TEMPLATES:
        tpl = _research_template()
        _TEMPLATES[tpl.name] = tpl


def load_template(name: str) -> ProjectTemplate:
    """Load a project template by name. Raises ValueError if not found."""
    _ensure_loaded()
    tpl = _TEMPLATES.get(name)
    if tpl is None:
        available = ", ".join(_TEMPLATES.keys())
        raise ValueError(f"Unknown template '{name}'. Available: {available}")
    return tpl


def list_templates() -> list[ProjectTemplate]:
    """List all available project templates."""
    _ensure_loaded()
    return list(_TEMPLATES.values())


def apply_template(template: ProjectTemplate, project_dir: Path) -> None:
    """Apply a project template to create directory structure and SOUL.md files."""
    from openags.agent.soul import write_soul
    from openags.models import AgentConfig

    # Create root SOUL.md if frontmatter is provided
    if template.root_soul_frontmatter:
        root_config = AgentConfig(**template.root_soul_frontmatter)
        root_soul = project_dir / "SOUL.md"
        if not root_soul.exists() and template.root_soul_body:
            write_soul(root_soul, root_config, template.root_soul_body)

    # Create chatroom.md (append-only inter-agent communication log)
    chatroom_path = project_dir / "chatroom.md"
    if not chatroom_path.exists():
        chatroom_path.write_text(
            "# Chatroom\n\nAppend-only inter-agent communication log.\n\n",
            encoding="utf-8",
        )

    # Create each module
    for mod in template.modules:
        mod_dir = project_dir / mod.name
        mod_dir.mkdir(parents=True, exist_ok=True)

        # Create subdirectories
        for sub in mod.subdirs:
            (mod_dir / sub).mkdir(parents=True, exist_ok=True)

        # Create module memory
        (mod_dir / "memory.md").touch(exist_ok=True)

        # Create SOUL.md with frontmatter if provided
        if mod.soul_frontmatter:
            soul_path = mod_dir / "SOUL.md"
            if not soul_path.exists():
                config = AgentConfig(**mod.soul_frontmatter)
                write_soul(soul_path, config, mod.soul_body)

        # Create default files
        for rel_path, content in mod.default_files.items():
            file_path = mod_dir / rel_path
            if not file_path.exists():
                file_path.parent.mkdir(parents=True, exist_ok=True)
                file_path.write_text(content, encoding="utf-8")

    # Sync: generate CLAUDE.md / AGENTS.md / GEMINI.md for root + all modules
    from openags.research.adapter import prepare_folder_for_cli

    for runtime in ("claude_code", "codex", "gemini_cli"):
        # Root agent (AGS) gets CLI config files too
        prepare_folder_for_cli(project_dir, runtime)
        for mod in template.modules:
            prepare_folder_for_cli(project_dir / mod.name, runtime)
