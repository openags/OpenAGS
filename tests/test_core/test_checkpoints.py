"""Tests for the checkpoint system."""

from __future__ import annotations

import json
from pathlib import Path
from unittest.mock import patch, MagicMock

import pytest


class TestCheckpointWrite:
    def test_checkpoint_creates_directory(self, tmp_path: Path) -> None:
        """Checkpoint dir is created if it doesn't exist."""
        from openags.research.orchestrator import Orchestrator
        from openags.models import SystemConfig, AgentResult, TokenUsage, Project

        config = SystemConfig(workspace_dir=tmp_path)
        project = Project(
            id="test-proj",
            name="Test",
            workspace=tmp_path / "projects" / "test-proj",
        )
        project.workspace.mkdir(parents=True, exist_ok=True)

        with patch("openags.research.orchestrator.RuntimeRouter"):
            orch = Orchestrator(config)

        result = AgentResult(
            success=True,
            output="done",
            token_usage=TokenUsage(input_tokens=10, output_tokens=5, model="test"),
            duration_seconds=1.5,
        )

        orch._write_checkpoint(project, "literature", "search papers", result)

        checkpoint_dir = project.workspace / ".openags" / "checkpoints"
        assert checkpoint_dir.exists()

        # Agent checkpoint file
        agent_file = checkpoint_dir / "literature.json"
        assert agent_file.exists()
        data = json.loads(agent_file.read_text())
        assert data["agent"] == "literature"
        assert data["success"] is True

        # Log file
        log_file = checkpoint_dir / "log.jsonl"
        assert log_file.exists()
        lines = log_file.read_text().strip().split("\n")
        assert len(lines) == 1
        entry = json.loads(lines[0])
        assert entry["agent"] == "literature"

    def test_checkpoint_appends_to_log(self, tmp_path: Path) -> None:
        """Multiple checkpoints append to log.jsonl."""
        from openags.research.orchestrator import Orchestrator
        from openags.models import SystemConfig, AgentResult, TokenUsage, Project

        config = SystemConfig(workspace_dir=tmp_path)
        project = Project(
            id="test-proj",
            name="Test",
            workspace=tmp_path / "projects" / "test-proj",
        )
        project.workspace.mkdir(parents=True, exist_ok=True)

        with patch("openags.research.orchestrator.RuntimeRouter"):
            orch = Orchestrator(config)

        for agent in ["literature", "proposal", "experiments"]:
            result = AgentResult(
                success=True, output="ok",
                token_usage=TokenUsage(model="test"),
                duration_seconds=0.5,
            )
            orch._write_checkpoint(project, agent, "task", result)

        log_file = project.workspace / ".openags" / "checkpoints" / "log.jsonl"
        lines = log_file.read_text().strip().split("\n")
        assert len(lines) == 3
