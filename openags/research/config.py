"""Configuration loading and saving."""

from __future__ import annotations

import logging
from pathlib import Path

import yaml

from openags.agent.errors import ConfigError
from openags.models import SystemConfig

logger = logging.getLogger(__name__)

_CONFIG_FILENAME = "config.yaml"
_config: SystemConfig | None = None


def _default_config_path() -> Path:
    return Path.home() / ".openags" / _CONFIG_FILENAME


def load_config(path: Path | None = None) -> SystemConfig:
    """Load configuration. Priority: explicit path > default path > defaults.

    Validates all values via Pydantic. Raises ConfigError on invalid config.
    """
    global _config
    if _config is not None:
        return _config

    config_path = path or _default_config_path()

    if config_path.exists():
        try:
            raw = yaml.safe_load(config_path.read_text(encoding="utf-8"))
            if raw is None:
                raw = {}
            _config = SystemConfig.model_validate(raw)
        except Exception as e:
            raise ConfigError(f"Failed to load config from {config_path}: {e}") from e
    else:
        _config = SystemConfig()

    # Ensure workspace directory exists
    _config.workspace_dir.mkdir(parents=True, exist_ok=True)

    logger.info("Config loaded: workspace=%s", _config.workspace_dir)
    return _config


def save_config(config: SystemConfig, path: Path | None = None) -> None:
    """Save configuration to YAML file with restricted permissions."""
    config_path = path or _default_config_path()
    config_path.parent.mkdir(parents=True, exist_ok=True)

    data = config.model_dump(mode="json", exclude_none=True)
    # Convert SecretStr fields to plain text for local storage
    if config.default_backend.api_key is not None:
        data.setdefault("default_backend", {})["api_key"] = (
            config.default_backend.api_key.get_secret_value()
        )

    config_path.write_text(
        yaml.dump(data, allow_unicode=True, default_flow_style=False),
        encoding="utf-8",
    )
    # Restrict file permissions: owner read/write only
    try:
        config_path.chmod(0o600)
    except OSError:
        pass  # Windows doesn't support chmod the same way


def reset_config() -> None:
    """Reset cached config (useful for testing)."""
    global _config
    _config = None


def set_config_value(key: str, value: str, path: Path | None = None) -> SystemConfig:
    """Set a single config value by dotted key path and save.

    Examples:
        set_config_value("default_backend.model", "deepseek/deepseek-chat")
        set_config_value("log_level", "DEBUG")
        set_config_value("default_backend.api_key", "sk-xxx")
    """
    load_config(path)
    config_path = path or _default_config_path()

    # Load raw YAML to preserve structure
    if config_path.exists():
        raw = yaml.safe_load(config_path.read_text(encoding="utf-8")) or {}
    else:
        raw = {}

    # Set nested key
    keys = key.split(".")
    target = raw
    for k in keys[:-1]:
        if k not in target or not isinstance(target[k], dict):
            target[k] = {}
        target = target[k]

    # Auto-convert types
    if value.lower() in ("true", "false"):
        target[keys[-1]] = value.lower() == "true"
    elif value.isdigit():
        target[keys[-1]] = int(value)
    else:
        try:
            target[keys[-1]] = float(value)
        except ValueError:
            target[keys[-1]] = value

    # Validate by constructing SystemConfig
    try:
        new_config = SystemConfig.model_validate(raw)
    except Exception as e:
        raise ConfigError(f"Invalid config value '{key}={value}': {e}") from e

    # Save
    config_path.parent.mkdir(parents=True, exist_ok=True)
    config_path.write_text(
        yaml.dump(raw, allow_unicode=True, default_flow_style=False),
        encoding="utf-8",
    )
    try:
        config_path.chmod(0o600)
    except OSError:
        pass

    # Reset cache so next load picks up changes
    reset_config()
    return new_config
