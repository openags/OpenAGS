"""Integration tests for per-project tool registry and agent tool wiring."""

from __future__ import annotations

from pathlib import Path

import pytest

from openags.research.registry import create_research_registry
from openags.agent.tools.base import create_engine_registry


class TestRegistry:
    def test_engine_registry_has_generic_tools(self, tmp_path: Path) -> None:
        reg = create_engine_registry(tmp_path)
        names = reg.list_names()
        assert "read" in names
        assert "write" in names
        assert "bash" in names
        # Engine registry must NOT contain science tools
        assert "arxiv" not in names
        assert "semantic_scholar" not in names

    def test_project_registry_has_all_tools(self, tmp_path: Path) -> None:
        reg = create_research_registry(tmp_path)
        names = reg.list_names()
        # New short names
        assert "read" in names
        assert "write" in names
        assert "edit" in names
        assert "ls" in names
        assert "grep" in names
        assert "bash" in names
        assert "arxiv" in names
        assert "semantic_scholar" in names
        # Backward-compat aliases
        assert "file_read" in names
        assert "file_write" in names
        assert "file_edit" in names
        assert "file_list" in names
        assert "file_search" in names
        assert "bash_execute" in names
        assert "fetch" in names
        # 9 real tools + 6 aliases = 15 entries
        assert len(names) == 15

    def test_different_projects_get_different_registries(self, tmp_path: Path) -> None:
        ws1 = tmp_path / "project1"
        ws2 = tmp_path / "project2"
        ws1.mkdir()
        ws2.mkdir()

        reg1 = create_research_registry(ws1)
        reg2 = create_research_registry(ws2)

        # They should be different objects
        assert reg1 is not reg2

        # But have the same tool names
        assert reg1.list_names() == reg2.list_names()

        # File tools should be bound to different workspaces
        read1 = reg1.get("read")
        read2 = reg2.get("read")
        assert read1._workspace == ws1
        assert read2._workspace == ws2

    def test_openai_tools_format(self, tmp_path: Path) -> None:
        reg = create_research_registry(tmp_path)
        tools = reg.to_openai_tools()
        assert len(tools) == 15  # 9 tools + 6 aliases
        for tool in tools:
            assert tool["type"] == "function"
            assert "name" in tool["function"]
            assert "description" in tool["function"]
            assert "parameters" in tool["function"]
            params = tool["function"]["parameters"]
            assert params["type"] == "object"
            assert "properties" in params


class TestAgentToolDeclarations:
    """Verify each agent declares the right tools."""

    def test_all_agents_declare_tools(self) -> None:
        from openags.agent.loop import Agent
        from openags.models import AgentConfig

        # Minimal stubs
        class B:
            async def execute(self, *a, **kw): pass
            async def execute_chat(self, *a, **kw): pass
            def stream_chat(self, *a, **kw): pass
            async def health_check(self): return True

        class M:
            project_dir = Path(".")
            def get_context(self, *a): return ""
            def update_memory(self, *a): pass
            def append_history(self, *a): pass

        b, m = B(), M()
        # In the new architecture, tools come from AgentConfig
        # Verify that Agent reads tools from config correctly
        test_tools = ["arxiv", "semantic_scholar", "read", "write"]
        config = AgentConfig(name="test-agent", tools=test_tools)
        agent = Agent(config=config, module_dir=Path("."), backend=b, memory=m)
        tools = set(agent._get_tool_names())
        for t in test_tools:
            assert t in tools, f"Agent missing configured tool: {t}"
