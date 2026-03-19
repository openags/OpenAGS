"""Integration tests for the Orchestrator."""

from __future__ import annotations

from pathlib import Path
from unittest.mock import patch

import pytest

from openags.agent.errors import ProjectError
from openags.research.orchestrator import Orchestrator
from openags.models import (
    AgentResult,
    BackendResponse,
    StepResult,
    SystemConfig,
    TokenUsage,
)

from tests.conftest import MockBackend


def _make_orchestrator(workspace: Path, mock_backend: MockBackend) -> Orchestrator:
    """Create an Orchestrator with a MockBackend injected via RuntimeRouter patch."""
    config = SystemConfig(workspace_dir=workspace)

    with patch("openags.research.orchestrator.RuntimeRouter") as router_cls:
        router_instance = router_cls.return_value
        router_instance.runtime_type = "builtin"
        router_instance.get_llm_backend.return_value = mock_backend
        orch = Orchestrator(config)

    return orch


@pytest.fixture
def workspace(tmp_path: Path) -> Path:
    ws = tmp_path / "workspace"
    ws.mkdir()
    return ws


@pytest.fixture
def orchestrator(workspace: Path, mock_backend: MockBackend) -> Orchestrator:
    orch = _make_orchestrator(workspace, mock_backend)
    # Pre-create a project for tests that need one
    orch.project_mgr.create("test-proj", "Test Project", "A test project")
    return orch


# ── run_agent ────────────────────────────────────────────


@pytest.mark.asyncio
async def test_run_agent_returns_result(orchestrator: Orchestrator) -> None:
    result = await orchestrator.run_agent(
        project_id="test-proj",
        agent_name="literature",
        task="Summarize recent advances in quantum computing.",
    )

    assert isinstance(result, AgentResult)
    assert result.success is True
    assert result.output != ""
    assert result.duration_seconds >= 0.0
    assert result.token_usage.input_tokens >= 0


# ── step_agent ───────────────────────────────────────────


@pytest.mark.asyncio
async def test_step_agent_returns_step(orchestrator: Orchestrator) -> None:
    result = await orchestrator.step_agent(
        project_id="test-proj",
        agent_name="proposal",
        task="Propose a new hypothesis for dark matter detection.",
    )

    assert isinstance(result, StepResult)
    assert result.content != ""
    assert result.error is None


# ── run_pipeline ─────────────────────────────────────────


@pytest.mark.asyncio
async def test_run_pipeline_multiple_stages(orchestrator: Orchestrator) -> None:
    results = await orchestrator.run_pipeline(
        project_id="test-proj",
        task="Study protein folding mechanisms.",
    )

    # Pipeline now returns a single coordinator result
    assert len(results) >= 1
    assert all(isinstance(r, AgentResult) for r in results)
    assert all(r.success for r in results)


# ── chat ─────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_chat_returns_response(orchestrator: Orchestrator) -> None:
    messages = [{"role": "user", "content": "What is the current status of my project?"}]

    response = await orchestrator.chat(
        project_id="test-proj",
        agent_name="coordinator",
        messages=messages,
    )

    assert isinstance(response, BackendResponse)
    assert response.content != ""
    assert response.token_usage.model == "mock"


# ── get_token_summary ────────────────────────────────────


@pytest.mark.asyncio
async def test_get_token_summary(orchestrator: Orchestrator) -> None:
    # Run an agent to generate token usage records
    await orchestrator.run_agent(
        project_id="test-proj",
        agent_name="literature",
        task="Quick survey.",
    )

    summary = orchestrator.get_token_summary("test-proj")

    assert "input_tokens" in summary
    assert "output_tokens" in summary
    assert "cost_usd" in summary
    assert "calls" in summary
    assert summary["calls"] >= 1
    assert summary["input_tokens"] > 0


# ── project not found ────────────────────────────────────


@pytest.mark.asyncio
async def test_run_agent_project_not_found(orchestrator: Orchestrator) -> None:
    with pytest.raises(ProjectError):
        await orchestrator.run_agent(
            project_id="nonexistent-project",
            agent_name="literature",
            task="This should fail.",
        )
