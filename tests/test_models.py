"""Tests for Pydantic data models."""

from __future__ import annotations

from pathlib import Path

import pytest
from pydantic import ValidationError

from openags.models import (
    BackendConfig,
    BackendType,
    Project,
    SystemConfig,
    TokenUsage,
)


class TestProject:
    def test_valid_project_id(self) -> None:
        p = Project(id="my-project", name="Test", workspace=Path("/tmp/test"))
        assert p.id == "my-project"
        assert p.stage == "idle"

    def test_invalid_project_id_uppercase(self) -> None:
        with pytest.raises(ValidationError):
            Project(id="MyProject", name="Test", workspace=Path("/tmp/test"))

    def test_invalid_project_id_special_chars(self) -> None:
        with pytest.raises(ValidationError):
            Project(id="my project!", name="Test", workspace=Path("/tmp/test"))

    def test_invalid_project_id_too_short(self) -> None:
        with pytest.raises(ValidationError):
            Project(id="a", name="Test", workspace=Path("/tmp/test"))


class TestBackendConfig:
    def test_defaults(self) -> None:
        cfg = BackendConfig()
        assert cfg.type == BackendType.BUILTIN
        assert cfg.timeout == 300
        assert cfg.max_retries == 3

    def test_timeout_bounds(self) -> None:
        with pytest.raises(ValidationError):
            BackendConfig(timeout=5)  # Below minimum of 10

        with pytest.raises(ValidationError):
            BackendConfig(timeout=5000)  # Above maximum of 3600


class TestTokenUsage:
    def test_defaults(self) -> None:
        t = TokenUsage()
        assert t.input_tokens == 0
        assert t.cost_usd == 0.0

    def test_values(self) -> None:
        t = TokenUsage(input_tokens=100, output_tokens=50, model="test", cost_usd=0.01)
        assert t.input_tokens == 100
        assert t.model == "test"


class TestSystemConfig:
    def test_defaults(self) -> None:
        cfg = SystemConfig()
        assert cfg.log_level == "INFO"
        assert cfg.experiment_max_fix_attempts == 5

    def test_invalid_log_level(self) -> None:
        with pytest.raises(ValidationError):
            SystemConfig(log_level="TRACE")
