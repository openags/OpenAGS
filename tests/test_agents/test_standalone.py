"""Tests proving Agent can run standalone without Orchestrator or ProjectManager."""

from __future__ import annotations

from pathlib import Path

import pytest

from openags.agent.loop import Agent
from openags.agent.memory import MemorySystem
from openags.models import AgentConfig
from openags.agent.tools.base import create_engine_registry
from tests.conftest import MockBackend


@pytest.mark.asyncio
async def test_agent_standalone(tmp_path: Path) -> None:
    """Agent can run without Orchestrator or ProjectManager."""
    long_response = "A " * 150 + "standalone agent completed the task successfully."
    backend = MockBackend(responses=[long_response])
    config = AgentConfig(name="test-agent", tools=["read"])
    memory = MemorySystem(tmp_path)
    registry = create_engine_registry(tmp_path)
    agent = Agent(
        config=config,
        module_dir=tmp_path,
        backend=backend,
        memory=memory,
        tool_registry=registry,
    )

    result = await agent.loop("list files in workspace")

    assert result.success
    assert "standalone agent completed" in result.output
    assert result.duration_seconds > 0


@pytest.mark.asyncio
async def test_agent_standalone_no_tools(tmp_path: Path) -> None:
    """Agent can run standalone without any tool registry."""
    long_response = "A " * 150 + "no-tools agent completed."
    backend = MockBackend(responses=[long_response])
    config = AgentConfig(name="simple-agent")
    memory = MemorySystem(tmp_path)
    agent = Agent(
        config=config,
        module_dir=tmp_path,
        backend=backend,
        memory=memory,
    )

    result = await agent.loop("do something")

    assert result.success
    assert "no-tools agent completed" in result.output


@pytest.mark.asyncio
async def test_agent_standalone_memory_works(tmp_path: Path) -> None:
    """Standalone agent's memory system works without project_dir."""
    long_response = "A " * 150 + "memory test done."
    backend = MockBackend(responses=[long_response])
    config = AgentConfig(name="mem-agent")
    memory = MemorySystem(tmp_path)
    agent = Agent(
        config=config,
        module_dir=tmp_path,
        backend=backend,
        memory=memory,
    )

    await agent.loop("test memory")

    # Memory should have recorded history
    ctx = memory.get_context()
    assert "mem-agent:completed" in ctx


def test_import_from_public_api() -> None:
    """The openags.agent public API re-exports work."""
    from openags.agent import Agent, AgentDiscovery, parse_soul, write_soul

    assert Agent is not None
    assert AgentDiscovery is not None
    assert callable(parse_soul)
    assert callable(write_soul)


def test_memory_project_dir_fallback(tmp_path: Path) -> None:
    """MemorySystem.project_dir falls back to module_dir when not set."""
    memory = MemorySystem(tmp_path)
    assert memory.project_dir == tmp_path


def test_memory_project_dir_explicit(tmp_path: Path) -> None:
    """MemorySystem.project_dir returns explicit project_dir when set."""
    module_dir = tmp_path / "submodule"
    module_dir.mkdir()
    memory = MemorySystem(module_dir, project_dir=tmp_path)
    assert memory.project_dir == tmp_path
    assert memory._module_dir == module_dir
