"""Tool protocol and registry — extensible foundation for all OpenAGS tools.

Design:
  - Tool is a Protocol: any object with matching methods works (no inheritance needed).
  - ToolRegistry discovers built-in tools and loads external tools from skills/MCP.
  - Tools are identified by a unique name and can declare their capabilities.

Extension points:
  - Skill .md files can reference tool names → SkillEngine injects them into agents.
  - MCP tools can be wrapped as Tool protocol objects via adapters (future).
"""

from __future__ import annotations

import logging
from pathlib import Path
from typing import Any, Protocol, runtime_checkable

from pydantic import BaseModel, Field

logger = logging.getLogger(__name__)


# ── Tool result ────────────────────────────────────────


class ToolResult(BaseModel):
    """Standardized return value from any tool invocation."""

    success: bool
    data: Any = None
    error: str | None = None
    metadata: dict[str, Any] = Field(default_factory=dict)


# ── Tool protocol ──────────────────────────────────────


@runtime_checkable
class Tool(Protocol):
    """Protocol every tool must satisfy.

    Built-in tools implement this directly.
    External tools (MCP, skill-defined) can be wrapped in an adapter.
    """

    @property
    def name(self) -> str:
        """Unique identifier (e.g. 'arxiv', 'semantic_scholar')."""
        ...

    @property
    def description(self) -> str:
        """Human-readable one-liner for LLM tool-use prompts."""
        ...

    async def invoke(self, **kwargs: Any) -> ToolResult:
        """Execute the tool with the given arguments."""
        ...

    def schema(self) -> dict[str, Any]:
        """JSON Schema describing accepted parameters (for LLM function calling)."""
        ...


# ── Tool registry ──────────────────────────────────────


class ToolRegistry:
    """Central registry for tool discovery.

    Usage:
        registry = ToolRegistry()
        registry.register(ArxivTool())
        registry.register(SemanticScholarTool())

        # Agents ask for tools by name or capability
        tool = registry.get("arxiv")
        all_search_tools = registry.search_tools()
    """

    def __init__(self) -> None:
        self._tools: dict[str, Tool] = {}

    def register(self, tool: Tool) -> None:
        if tool.name in self._tools:
            logger.warning("Overwriting tool: %s", tool.name)
        self._tools[tool.name] = tool
        logger.debug("Registered tool: %s", tool.name)

    def alias(self, old_name: str, new_name: str) -> None:
        """Register an alias so ``old_name`` resolves to the tool registered as ``new_name``."""
        tool = self._tools.get(new_name)
        if tool is not None:
            self._tools[old_name] = tool

    def unregister(self, name: str) -> None:
        self._tools.pop(name, None)

    def get(self, name: str) -> Tool | None:
        return self._tools.get(name)

    def list_all(self) -> list[Tool]:
        return list(self._tools.values())

    def list_names(self) -> list[str]:
        return list(self._tools.keys())

    def to_openai_tools(self) -> list[dict[str, Any]]:
        """Export all tools as OpenAI function-calling format (for LLM)."""
        result = []
        for tool in self._tools.values():
            result.append({
                "type": "function",
                "function": {
                    "name": tool.name,
                    "description": tool.description,
                    "parameters": tool.schema(),
                },
            })
        return result


def create_engine_registry(workspace: Path) -> ToolRegistry:
    """Create a generic agent-engine registry — no science tools.

    Includes: read, write, edit, ls, grep, bash + backward-compat aliases.
    For research projects, use ``openags.research.registry.create_research_registry``.
    """
    from openags.agent.tools.bash import BashExecuteTool
    from openags.agent.tools.edit import FileEditTool
    from openags.agent.tools.grep import FileSearchTool
    from openags.agent.tools.ls import FileListTool
    from openags.agent.tools.read import FileReadTool
    from openags.agent.tools.write import FileWriteTool

    registry = ToolRegistry()
    registry.register(FileReadTool(workspace))
    registry.register(FileWriteTool(workspace))
    registry.register(FileEditTool(workspace))
    registry.register(FileListTool(workspace))
    registry.register(FileSearchTool(workspace))
    registry.register(BashExecuteTool(workspace))

    # Backward-compat aliases
    registry.alias("file_read", "read")
    registry.alias("file_write", "write")
    registry.alias("file_edit", "edit")
    registry.alias("file_list", "ls")
    registry.alias("file_search", "grep")
    registry.alias("bash_execute", "bash")
    return registry
