"""Shared test fixtures."""

from __future__ import annotations

from collections.abc import AsyncIterator
from pathlib import Path

import pytest

from openags.research.config import reset_config
from openags.research.project import ProjectManager
from openags.models import BackendResponse, Project, TokenUsage


class MockBackend:
    """Test backend that returns canned responses without calling any LLM."""

    def __init__(
        self,
        responses: list[str] | None = None,
        tool_calls_responses: list[list[dict[str, object]]] | None = None,
    ):
        self._responses = responses or ["Mock response from test backend."]
        self._tool_calls_responses = tool_calls_responses or []
        self._call_count = 0
        self.last_prompt: str = ""
        self.last_system: str = ""
        self.last_messages: list[dict[str, str]] = []
        self.last_tools: list[dict[str, object]] | None = None

    async def execute(
        self,
        prompt: str,
        system: str = "",
        tools: list[dict[str, object]] | None = None,
        working_dir: str | None = None,
        timeout: int | None = None,
    ) -> BackendResponse:
        self.last_prompt = prompt
        self.last_system = system
        self.last_tools = tools
        idx = min(self._call_count, len(self._responses) - 1)
        self._call_count += 1

        tool_calls: list[dict[str, object]] = []
        if self._tool_calls_responses and idx < len(self._tool_calls_responses):
            tool_calls = self._tool_calls_responses[idx]

        return BackendResponse(
            content=self._responses[idx],
            token_usage=TokenUsage(
                input_tokens=100,
                output_tokens=50,
                model="mock",
                cost_usd=0.001,
            ),
            tool_calls=tool_calls,
        )

    async def execute_chat(
        self,
        messages: list[dict[str, str]],
        system: str = "",
        tools: list[dict[str, object]] | None = None,
        timeout: int | None = None,
    ) -> BackendResponse:
        self.last_messages = messages
        self.last_tools = tools
        prompt = ""
        for msg in reversed(messages):
            if msg.get("role") == "user":
                prompt = msg.get("content", "")
                break
        return await self.execute(prompt, system=system, tools=tools, timeout=timeout)

    async def stream_chat(
        self,
        messages: list[dict[str, str]],
        system: str = "",
    ) -> AsyncIterator[str]:
        response = await self.execute_chat(messages, system=system)
        yield response.content

    async def health_check(self) -> bool:
        return True


@pytest.fixture
def mock_backend() -> MockBackend:
    return MockBackend()


@pytest.fixture
def temp_workspace(tmp_path: Path) -> Path:
    """Temporary workspace directory."""
    ws = tmp_path / "workspace"
    ws.mkdir()
    return ws


@pytest.fixture
def temp_project(temp_workspace: Path) -> Project:
    """Create a temporary project for testing."""
    pm = ProjectManager(temp_workspace)
    return pm.create("test-proj", "Test Project", "A test project")


@pytest.fixture(autouse=True)
def _reset_config() -> None:
    """Reset global config cache between tests."""
    reset_config()
