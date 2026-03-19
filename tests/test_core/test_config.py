"""Tests for configuration management."""

from __future__ import annotations

from pathlib import Path

import yaml

from openags.research.config import load_config, reset_config, save_config
from openags.models import BackendType, SystemConfig


class TestConfig:
    def test_default_config(self) -> None:
        reset_config()
        cfg = load_config(path=Path("/nonexistent/config.yaml"))
        assert cfg.log_level == "INFO"
        assert cfg.default_backend.type == BackendType.BUILTIN

    def test_load_from_file(self, tmp_path: Path) -> None:
        config_path = tmp_path / "config.yaml"
        config_path.write_text(
            yaml.dump(
                {
                    "log_level": "DEBUG",
                    "default_backend": {"type": "builtin", "model": "gpt-4"},
                }
            )
        )

        reset_config()
        cfg = load_config(path=config_path)
        assert cfg.log_level == "DEBUG"
        assert cfg.default_backend.model == "gpt-4"

    def test_save_and_reload(self, tmp_path: Path) -> None:
        cfg = SystemConfig(
            workspace_dir=tmp_path,
            log_level="WARNING",
        )
        config_path = tmp_path / "config.yaml"
        save_config(cfg, path=config_path)

        assert config_path.exists()

        reset_config()
        loaded = load_config(path=config_path)
        assert loaded.log_level == "WARNING"
