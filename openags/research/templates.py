"""Project template system — define initial directory structures for new projects.

Templates replace the hardcoded _PROJECT_SUBDIRS list, making project
structure extensible without code changes.
"""

from __future__ import annotations

import logging
from pathlib import Path

from pydantic import BaseModel

logger = logging.getLogger(__name__)


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
    """The default research project template — 7 modules."""
    return ProjectTemplate(
        name="research",
        description="Full research workflow: literature → proposal → experiments → manuscript → review",
        root_soul_frontmatter={
            "name": "coordinator",
            "description": "Research project coordinator / PI",
            "tools": [
                "check_progress", "dispatch_agent", "ask_user",
                "read", "ls", "grep", "bash", "sub_agent",
            ],
            "max_steps": 50,
            "done_strategy": "default",
        },
        root_soul_body=(
            "You are the research project coordinator (PI).\n\n"
            "## Project Context\n\n"
            "- Read `../CLAUDE.md` or `SOUL.md` in the root directory for the project overview\n"
            "- Read `memory.md` for the project's current progress and key findings\n"
            "- Each subdirectory (literature/, proposal/, experiments/, manuscript/, review/, references/) is an independent agent module\n"
            "- Read each module's `memory.md` to understand their progress\n\n"
            "## Workflow\n\n"
            "Use `check_progress` to see all modules' status, then `dispatch_agent` to assign tasks.\n"
            "Typical order: literature → proposal → experiments → manuscript → review.\n"
            "But adapt based on results — backtrack if needed.\n"
        ),
        modules=[
            ModuleTemplate(
                name="literature",
                soul_frontmatter={
                    "name": "literature",
                    "description": "Literature review and paper search",
                    "tools": [
                        "arxiv", "semantic_scholar",
                        "read", "write", "edit",
                        "ls", "grep", "sub_agent",
                    ],
                },
                soul_body=(
                    "You are a literature review specialist.\n\n"
                    "## Context Sources\n\n"
                    "- `../CLAUDE.md` — project overview and research topic\n"
                    "- `../memory.md` — project-level progress and key decisions\n"
                    "- `../uploads/` — papers uploaded by the user (PDF supported)\n\n"
                    "## Your Outputs\n\n"
                    "- Search results → `notes/search_results.md`\n"
                    "- Paper notes → `notes/{paper_id}.md`\n"
                    "- Literature review → `notes/literature_review.md`\n"
                    "- Update `memory.md` after each task with what you found\n"
                ),
                subdirs=["papers", "notes", "sessions", "skills"],
            ),
            ModuleTemplate(
                name="proposal",
                soul_frontmatter={
                    "name": "proposal",
                    "description": "Research proposal and hypothesis generation",
                    "tools": [
                        "read", "write", "edit",
                        "ls", "grep", "sub_agent",
                    ],
                },
                soul_body=(
                    "You are a research proposal specialist.\n\n"
                    "## Context Sources (read these first!)\n\n"
                    "- `../CLAUDE.md` — project overview\n"
                    "- `../literature/notes/` — search results and literature review\n"
                    "- `../literature/memory.md` — what the literature agent found\n\n"
                    "## Your Outputs\n\n"
                    "- Gap analysis → `ideas/gap_analysis.md`\n"
                    "- Research proposal → `ideas/proposal.md` (hypothesis, methodology, evaluation)\n"
                    "- Update `memory.md` after each task\n"
                ),
                subdirs=["ideas", "sessions", "skills"],
            ),
            ModuleTemplate(
                name="experiments",
                soul_frontmatter={
                    "name": "experiments",
                    "description": "Experiment design, execution, and analysis",
                    "tools": [
                        "read", "write", "edit", "ls",
                        "grep", "bash", "sub_agent",
                    ],
                },
                soul_body=(
                    "You are an experiment scientist.\n\n"
                    "## Context Sources (read these first!)\n\n"
                    "- `../proposal/ideas/proposal.md` — research hypothesis and methodology\n"
                    "- `../literature/notes/` — related work for baselines\n"
                    "- `../proposal/memory.md` — proposal decisions\n\n"
                    "## Your Outputs\n\n"
                    "- Experiment code → `code/`\n"
                    "- Raw data → `data/`\n"
                    "- Analysis report → `results/analysis.md`\n"
                    "- Figures → `results/*.png`\n"
                    "- Update `memory.md` after each task\n"
                ),
                subdirs=["code", "data", "results", "runs", "sessions", "skills"],
            ),
            ModuleTemplate(
                name="manuscript",
                soul_frontmatter={
                    "name": "manuscript",
                    "description": "Manuscript writing and LaTeX editing",
                    "tools": [
                        "read", "write", "edit",
                        "ls", "grep", "sub_agent",
                    ],
                },
                soul_body=(
                    "You are an academic writing specialist.\n\n"
                    "## Context Sources (read these before writing!)\n\n"
                    "- `../literature/notes/literature_review.md` — for Related Work section\n"
                    "- `../proposal/ideas/proposal.md` — for Introduction and Method sections\n"
                    "- `../experiments/results/analysis.md` — for Results and Discussion sections\n"
                    "- `../experiments/results/*.png` — figures to include\n"
                    "- `../experiments/data/` — raw data for tables\n"
                    "- `../references/` — BibTeX references\n\n"
                    "## Your Outputs\n\n"
                    "- Paper → `main.tex`\n"
                    "- Bibliography → `references.bib`\n"
                    "- Update `memory.md` after each task\n"
                ),
                subdirs=["drafts", "figures", "sessions", "skills"],
            ),
            ModuleTemplate(
                name="review",
                soul_frontmatter={
                    "name": "review",
                    "description": "Peer review and quality assessment",
                    "tools": [
                        "arxiv", "semantic_scholar",
                        "read", "write", "edit",
                        "ls", "grep", "sub_agent",
                    ],
                },
                soul_body=(
                    "You are a rigorous peer reviewer.\n\n"
                    "## Context Sources\n\n"
                    "- `../manuscript/main.tex` — the paper to review\n"
                    "- `../experiments/results/analysis.md` — verify claims against data\n"
                    "- `../literature/notes/` — check citation coverage\n"
                    "- `../proposal/ideas/proposal.md` — verify the paper addresses the research questions\n\n"
                    "## Your Outputs\n\n"
                    "- Review report → `reviews/review_report.md`\n"
                    "- Include: overall score, strengths, weaknesses, specific suggestions\n"
                    "- Update `memory.md` after each task\n"
                ),
                subdirs=["reviews", "responses", "sessions", "skills"],
            ),
            ModuleTemplate(
                name="references",
                soul_frontmatter={
                    "name": "references",
                    "description": "Citation management and verification",
                    "tools": [
                        "arxiv", "semantic_scholar",
                        "read", "write", "edit",
                        "ls", "grep", "sub_agent",
                    ],
                },
                soul_body=(
                    "You are a citation management specialist.\n\n"
                    "## Context Sources\n\n"
                    "- `../literature/notes/` — papers found during literature review\n"
                    "- `../manuscript/main.tex` — check all \\cite{} references\n"
                    "- `../manuscript/references.bib` — current bibliography\n\n"
                    "## Your Outputs\n\n"
                    "- Updated BibTeX → `../manuscript/references.bib`\n"
                    "- Citation report → `pdfs/citation_report.md`\n"
                    "- Update `memory.md` after each task\n"
                ),
                subdirs=["pdfs", "sessions", "skills"],
            ),
        ],
    )


def _minimal_template() -> ProjectTemplate:
    """Minimal project — just a coordinator."""
    return ProjectTemplate(
        name="minimal",
        description="Minimal project with only a root coordinator agent",
        root_soul_frontmatter={
            "name": "coordinator",
            "tools": [
                "read", "write", "edit", "ls",
                "grep", "bash", "sub_agent", "ask_user",
            ],
            "max_steps": 30,
            "done_strategy": "coordinator",
        },
        modules=[],
    )


def _data_science_template() -> ProjectTemplate:
    """Data science project template."""
    return ProjectTemplate(
        name="data-science",
        description="Data science workflow: collection → analysis → visualization → report",
        root_soul_frontmatter={
            "name": "coordinator",
            "tools": [
                "check_progress", "dispatch_agent", "ask_user",
                "read", "ls", "grep", "bash", "sub_agent",
            ],
            "max_steps": 40,
            "done_strategy": "coordinator",
        },
        modules=[
            ModuleTemplate(
                name="data_collection",
                soul_frontmatter={
                    "name": "data_collection",
                    "description": "Data acquisition and preprocessing",
                    "tools": [
                        "read", "write", "edit", "ls",
                        "grep", "bash", "sub_agent",
                    ],
                },
                subdirs=["raw", "processed", "sessions", "skills"],
            ),
            ModuleTemplate(
                name="analysis",
                soul_frontmatter={
                    "name": "analysis",
                    "description": "Statistical analysis and modeling",
                    "tools": [
                        "read", "write", "edit", "ls",
                        "grep", "bash", "sub_agent",
                    ],
                },
                subdirs=["notebooks", "results", "sessions", "skills"],
            ),
            ModuleTemplate(
                name="visualization",
                soul_frontmatter={
                    "name": "visualization",
                    "description": "Data visualization and figure creation",
                    "tools": [
                        "read", "write", "edit", "ls",
                        "grep", "bash", "sub_agent",
                    ],
                },
                subdirs=["figures", "sessions", "skills"],
            ),
            ModuleTemplate(
                name="report",
                soul_frontmatter={
                    "name": "report",
                    "description": "Report writing and documentation",
                    "tools": [
                        "read", "write", "edit",
                        "ls", "grep", "sub_agent",
                    ],
                },
                subdirs=["drafts", "sessions", "skills"],
            ),
        ],
    )


_TEMPLATES: dict[str, ProjectTemplate] = {}


def _ensure_loaded() -> None:
    if not _TEMPLATES:
        for factory in (_research_template, _minimal_template, _data_science_template):
            tpl = factory()
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

    # Sync: generate CLAUDE.md / AGENTS.md / GEMINI.md for each module (not root)
    # Root CLAUDE.md is project-level info, not coordinator's role
    from openags.research.adapter import prepare_folder_for_cli

    for runtime in ("claude_code", "codex", "gemini_cli"):
        for mod in template.modules:
            prepare_folder_for_cli(project_dir / mod.name, runtime)
