"""Research-project tool registry — adds science tools to the engine registry."""

from __future__ import annotations

from pathlib import Path

from openags.agent.tools.base import ToolRegistry, create_engine_registry


def create_research_registry(workspace: Path) -> ToolRegistry:
    """Create a full research-project registry — engine tools + science tools."""
    registry = create_engine_registry(workspace)

    from openags.research.tools.arxiv import ArxivTool
    from openags.research.tools.semantic_scholar import SemanticScholarTool

    registry.register(ArxivTool())
    registry.register(SemanticScholarTool())
    return registry
