"""Tests for base agent."""

from __future__ import annotations

from collections.abc import AsyncIterator
from pathlib import Path

import pytest

from openags.agent.loop import Agent
from openags.agent.memory import MemorySystem
from openags.models import AgentConfig, BackendResponse, Project
from tests.conftest import MockBackend


def _make_agent(
    name: str,
    backend: MockBackend,
    memory: MemorySystem,
    module_dir: Path | None = None,
) -> Agent:
    """Helper to create an Agent with an AgentConfig."""
    config = AgentConfig(name=name)
    return Agent(
        config=config,
        module_dir=module_dir or memory._module_dir,
        backend=backend,
        memory=memory,
    )


class TestBaseAgent:
    @pytest.mark.asyncio
    async def test_agent_run_success(
        self, mock_backend: MockBackend, temp_project: Project
    ) -> None:
        # Use a response long enough for Agent._is_done (> 50 chars)
        long_response = "A " * 150 + "literature review complete."
        backend = MockBackend(responses=[long_response])
        memory = MemorySystem(temp_project.workspace)
        agent = _make_agent("literature", backend, memory)

        result = await agent.run("Find papers about transformers")

        assert result.success
        assert "literature review complete" in result.output
        assert result.token_usage.input_tokens == 100
        assert result.duration_seconds > 0

    @pytest.mark.asyncio
    async def test_agent_records_history(
        self, mock_backend: MockBackend, temp_project: Project
    ) -> None:
        long_response = "A " * 150 + "literature review complete."
        backend = MockBackend(responses=[long_response])
        memory = MemorySystem(temp_project.workspace)
        agent = _make_agent("literature", backend, memory)

        await agent.run("Find papers")

        ctx = memory.get_context()
        assert "literature:completed" in ctx

    @pytest.mark.asyncio
    async def test_agent_injects_context(
        self, mock_backend: MockBackend, temp_project: Project
    ) -> None:
        memory = MemorySystem(temp_project.workspace)
        memory.update_memory("focus", "Protein folding")

        agent = _make_agent("coordinator", mock_backend, memory)
        await agent.run("What should I do next?")

        assert "Protein folding" in mock_backend.last_prompt

    @pytest.mark.asyncio
    async def test_agent_role(self, mock_backend: MockBackend, temp_project: Project) -> None:
        memory = MemorySystem(temp_project.workspace)
        agent = _make_agent("literature", mock_backend, memory)
        assert agent.role == "literature"

    @pytest.mark.asyncio
    async def test_agent_handles_backend_error(self, temp_project: Project) -> None:
        class FailingBackend(MockBackend):
            async def execute(
                self,
                prompt: str,
                system: str = "",
                tools: list[dict[str, object]] | None = None,
                working_dir: str | None = None,
                timeout: int | None = None,
            ) -> BackendResponse:
                raise RuntimeError("Connection failed")

            async def execute_chat(
                self,
                messages: list[dict[str, str]],
                system: str = "",
                tools: list[dict[str, object]] | None = None,
                timeout: int | None = None,
            ) -> BackendResponse:
                raise RuntimeError("Connection failed")

            async def stream_chat(
                self,
                messages: list[dict[str, str]],
                system: str = "",
            ) -> AsyncIterator[str]:
                raise RuntimeError("Connection failed")
                yield

        memory = MemorySystem(temp_project.workspace)
        agent = _make_agent("literature", FailingBackend(), memory)

        result = await agent.run("Find papers")

        assert not result.success
        assert "Connection failed" in (result.error or "")
