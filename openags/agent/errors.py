"""Unified exception hierarchy for OpenAGS."""

from __future__ import annotations


class OpenAGSError(Exception):
    """Base exception for all OpenAGS errors."""


class ConfigError(OpenAGSError):
    """Configuration errors (missing file, validation failure, etc.)."""


class ProjectError(OpenAGSError):
    """Project operation errors (not found, already exists, invalid state)."""


class BackendError(OpenAGSError):
    """Backend call errors (timeout, auth failure, API error)."""


class AgentError(OpenAGSError):
    """Agent execution errors."""


class ExperimentError(OpenAGSError):
    """Experiment execution errors (sandbox failure, GPU unavailable)."""


class VerificationError(OpenAGSError):
    """Citation verification errors (API unavailable)."""


class BudgetExceededError(OpenAGSError):
    """Token budget exceeded."""
