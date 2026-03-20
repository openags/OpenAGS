"""Project management: CRUD + workspace directory structure."""

from __future__ import annotations

import logging
from datetime import datetime
from pathlib import Path

import yaml

from openags.agent.errors import ProjectError
from openags.models import Project

logger = logging.getLogger(__name__)


def discover_modules(project_dir: Path) -> list[str]:
    """Dynamically discover agent modules in a project directory.

    A subdirectory is a module if it contains SOUL.md, sessions/, or memory.md.
    Replaces the hardcoded SECTION_TO_DIR mapping.
    """
    if not project_dir.exists():
        return []
    modules: list[str] = []
    for child in sorted(project_dir.iterdir()):
        if not child.is_dir() or child.name.startswith("."):
            continue
        has_soul = (child / "SOUL.md").exists()
        has_sessions = (child / "sessions").is_dir()
        has_memory = (child / "memory.md").exists()
        if has_soul or has_sessions or has_memory:
            modules.append(child.name)
    return modules


class ProjectManager:
    """Manages project lifecycle and workspace directories.

    Projects can live in two places:
      1. Default: {workspace_dir}/projects/{project_id}/
      2. Custom:  any user-chosen directory, tracked via projects_index.yaml
    """

    def __init__(self, workspace_dir: Path):
        self._base = workspace_dir / "projects"
        self._base.mkdir(parents=True, exist_ok=True)
        self._index_path = workspace_dir / "projects_index.yaml"
        self._external: dict[str, str] = self._load_index()

    def _load_index(self) -> dict[str, str]:
        """Load the external projects index: {project_id: workspace_path}."""
        if not self._index_path.exists():
            return {}
        try:
            data = yaml.safe_load(self._index_path.read_text(encoding="utf-8"))
            return data if isinstance(data, dict) else {}
        except Exception:
            return {}

    def _save_index(self) -> None:
        """Persist the external projects index."""
        self._index_path.write_text(
            yaml.dump(self._external, allow_unicode=True, default_flow_style=False),
            encoding="utf-8",
        )

    def create(
        self,
        project_id: str,
        name: str,
        description: str = "",
        owner_id: str = "",
        workspace_dir: Path | None = None,
        template: str = "research",
    ) -> Project:
        """Create a new project with directory structure from template.

        Args:
            workspace_dir: Custom workspace path. If None, uses default
                           ({base}/projects/{project_id}).
            template: Project template name (research, minimal, data-science).
        """
        if workspace_dir is not None:
            project_dir = Path(workspace_dir).resolve()
        else:
            project_dir = self._base / project_id

        if project_dir.exists() and (project_dir / ".openags" / "meta.yaml").exists():
            raise ProjectError(f"Project '{project_id}' already exists at {project_dir}")

        project = Project(
            id=project_id,
            name=name,
            description=description,
            workspace=project_dir,
            owner_id=owner_id,
        )

        # Create base directories
        (project_dir / ".openags" / "sessions").mkdir(parents=True, exist_ok=True)

        # Apply template (creates module directories, SOUL.md files, etc.)
        from openags.research.templates import apply_template, load_template

        tpl = load_template(template)
        apply_template(tpl, project_dir)

        # Initialize metadata and project-level files
        self._save_meta(project)
        (project_dir / ".openags" / "history.md").touch()
        (project_dir / ".openags" / "plan.md").touch()

        # Scaffold default manuscript files (for research template)
        if template == "research":
            self._scaffold_manuscript(project_dir)

        # Track external projects in index
        if workspace_dir is not None:
            self._external[project_id] = str(project_dir)
            self._save_index()

        logger.info("Created project '%s' at %s (template=%s)", project_id, project_dir, template)
        return project

    def _resolve_project_dir(self, project_id: str) -> Path | None:
        """Find the workspace directory for a project ID."""
        # Check default location first
        default = self._base / project_id
        if (default / ".openags" / "meta.yaml").exists():
            return default
        # Check external index
        ext_path = self._external.get(project_id)
        if ext_path:
            p = Path(ext_path)
            if (p / ".openags" / "meta.yaml").exists():
                return p
        return None

    def get(self, project_id: str) -> Project:
        """Load a project by ID. Raises ProjectError if not found."""
        project_dir = self._resolve_project_dir(project_id)
        if project_dir is None:
            raise ProjectError(f"Project '{project_id}' not found")

        meta_path = project_dir / ".openags" / "meta.yaml"
        try:
            raw = yaml.safe_load(meta_path.read_text(encoding="utf-8"))
            return Project.model_validate(raw)
        except Exception as e:
            raise ProjectError(f"Failed to load project '{project_id}': {e}") from e

    def list_all(self) -> list[Project]:
        """List all projects (default + external), sorted by name."""
        seen: set[str] = set()
        projects: list[Project] = []

        # Default location projects
        if self._base.exists():
            for d in sorted(self._base.iterdir()):
                meta_path = d / ".openags" / "meta.yaml"
                if d.is_dir() and meta_path.exists():
                    try:
                        p = self.get(d.name)
                        projects.append(p)
                        seen.add(p.id)
                    except ProjectError:
                        logger.warning("Skipping corrupt project: %s", d.name)

        # External projects
        for pid, path_str in self._external.items():
            if pid in seen:
                continue
            try:
                p = self.get(pid)
                projects.append(p)
            except ProjectError:
                logger.warning("External project '%s' at %s not found", pid, path_str)

        projects.sort(key=lambda p: p.name.lower())
        return projects

    def update_stage(self, project_id: str, stage: str) -> Project:
        """Update a project's current stage."""
        project = self.get(project_id)
        project.stage = stage
        project.updated_at = datetime.now()
        self._save_meta(project)
        logger.info("Project '%s' stage → %s", project_id, stage)
        return project

    def delete(self, project_id: str) -> None:
        """Delete a project directory. This is irreversible."""
        project_dir = self._resolve_project_dir(project_id)
        if project_dir is None:
            raise ProjectError(f"Project '{project_id}' not found")

        import shutil

        shutil.rmtree(project_dir)

        # Remove from external index if present
        if project_id in self._external:
            del self._external[project_id]
            self._save_index()

        logger.info("Deleted project '%s'", project_id)

    def _scaffold_manuscript(self, project_dir: Path) -> None:
        """Create default main.tex and references.bib in the manuscript directory."""
        manuscript_dir = project_dir / "manuscript"
        main_tex = manuscript_dir / "main.tex"
        refs_bib = manuscript_dir / "references.bib"

        if not main_tex.exists():
            main_tex.write_text(
                r"""\documentclass[12pt,a4paper]{article}

\usepackage[utf8]{inputenc}
\usepackage[T1]{fontenc}
\usepackage{amsmath,amssymb}
\usepackage{graphicx}
\usepackage[colorlinks=true,linkcolor=blue,citecolor=blue]{hyperref}
\usepackage{natbib}
\usepackage{geometry}
\geometry{margin=1in}

\title{Your Paper Title}
\author{Author Name \\ Institution}
\date{\today}

\begin{document}

\maketitle

\begin{abstract}
Your abstract here.
\end{abstract}

\section{Introduction}
\label{sec:introduction}

Introduction text.

\section{Related Work}
\label{sec:related}

Related work discussion.

\section{Method}
\label{sec:method}

Methodology description.

\section{Experiments}
\label{sec:experiments}

Experimental setup and results.

\section{Conclusion}
\label{sec:conclusion}

Concluding remarks.

\bibliographystyle{plainnat}
\bibliography{references}

\end{document}
""",
                encoding="utf-8",
            )

        if not refs_bib.exists():
            refs_bib.write_text(
                r"""@article{example2024,
  title   = {An Example Paper Title},
  author  = {Last, First and Another, Author},
  journal = {Journal of Examples},
  year    = {2024},
  volume  = {1},
  pages   = {1--10},
}
""",
                encoding="utf-8",
            )

    def _save_meta(self, project: Project) -> None:
        meta_path = project.workspace / ".openags" / "meta.yaml"
        data = project.model_dump(mode="json")
        # Convert Path to string for YAML serialization
        data["workspace"] = str(data["workspace"])
        meta_path.write_text(
            yaml.dump(data, allow_unicode=True, default_flow_style=False),
            encoding="utf-8",
        )
