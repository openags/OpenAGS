"""Runtime router — provides LLMBackend for OpenAGS builtin agent.

CLI agents (Claude Code, Codex, Gemini, Cursor) are managed by the
Desktop Node.js layer, not by Python. This router only handles builtin.
"""

from __future__ import annotations

import logging

from openags.agent.llm import LLMBackend
from openags.models import SystemConfig

logger = logging.getLogger(__name__)


class RuntimeRouter:
    """Provides the LLMBackend for OpenAGS's builtin agent."""

    def __init__(self, config: SystemConfig) -> None:
        self._config = config
        self._llm_backend: LLMBackend | None = None

    @property
    def runtime_type(self) -> str:
        return self._config.default_backend.type

    def get_llm_backend(self) -> LLMBackend:
        """Get the LLMBackend (litellm-based) for the builtin agent."""
        if self._llm_backend is None:
            cfg = self._config.default_backend
            self._llm_backend = LLMBackend(cfg)
            logger.info("Created LLMBackend: model=%s", cfg.model)
        return self._llm_backend


# Backward-compat alias
BackendRouter = RuntimeRouter
