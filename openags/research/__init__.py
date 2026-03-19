"""openags.research — science project management layer.

This subpackage contains research-specific logic that sits on top of the
generic ``openags`` agent engine.  It provides:

- **Orchestrator** — routes requests to agents within a research project
- **ProjectManager** — CRUD for research projects with templates
- **Server** — FastAPI application with project/session/experiment routes
- **Science Tools** — arXiv, Semantic Scholar, citation verification, etc.

Users who only want the generic agent engine can use ``openags.agent``
without importing anything from this subpackage.
"""

from __future__ import annotations

from openags.research.orchestrator import Orchestrator
from openags.research.project import ProjectManager, discover_modules

__all__ = ["Orchestrator", "ProjectManager", "discover_modules"]
