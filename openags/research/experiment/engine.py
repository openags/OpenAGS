"""Experiment execution engine with self-healing auto-fix.

Flow:
  1. Run experiment code in sandbox
  2. If it fails, ask the LLM backend to analyze error and fix code
  3. Retry up to max_fix_attempts
  4. Return ExperimentResult with success/failure, attempts, duration
"""

from __future__ import annotations

import logging
import time

from openags.agent.backend import Backend
from openags.research.experiment.sandbox import SandboxFactory
from openags.models import Experiment, ExperimentResult, SandboxMode

logger = logging.getLogger(__name__)


class ExperimentEngine:
    """Run experiments with automatic error detection and self-healing."""

    def __init__(
        self,
        backend: Backend,
        sandbox_mode: SandboxMode = SandboxMode.LOCAL,
        max_fix_attempts: int = 5,
        on_output: object | None = None,
    ) -> None:
        self._backend = backend
        self._sandbox_factory = SandboxFactory(sandbox_mode)
        self._max_fix = max_fix_attempts
        # Optional callback: on_output(stream: str, text: str) where stream is 'stdout'|'stderr'|'status'
        self._on_output = on_output

    async def run(self, experiment: Experiment) -> ExperimentResult:
        """Execute an experiment with auto-fix loop."""
        start = time.monotonic()
        last_error: str | None = None
        attempt = 0

        for attempt in range(1, self._max_fix + 1):
            logger.info(
                "Experiment '%s' attempt %d/%d",
                experiment.name, attempt, self._max_fix,
            )

            sandbox = await self._sandbox_factory.create(
                working_dir=experiment.code_path.parent,
                timeout=experiment.timeout,
            )

            try:
                self._emit("status", f"[Attempt {attempt}/{self._max_fix}] Running {experiment.code_path.name}...")

                result = await sandbox.execute(
                    command=f"python {experiment.code_path.name}",
                    env={"CUDA_VISIBLE_DEVICES": self._gpu_env(experiment)},
                )

                # Stream output
                if result.stdout:
                    self._emit("stdout", result.stdout)
                if result.stderr:
                    self._emit("stderr", result.stderr)

                if result.returncode == 0:
                    self._emit("status", f"[Success] Completed in {time.monotonic() - start:.1f}s")
                    return ExperimentResult(
                        success=True,
                        data={"stdout": result.stdout, "stderr": result.stderr},
                        attempts=attempt,
                        duration_seconds=time.monotonic() - start,
                    )

                last_error = result.stderr or f"Exit code {result.returncode}"
                self._emit("status", f"[Failed] Attempt {attempt}: {last_error[:100]}")
                logger.warning(
                    "Experiment '%s' failed (attempt %d): %s",
                    experiment.name, attempt, last_error[:200],
                )

            except TimeoutError:
                last_error = f"Timeout after {experiment.timeout}s"
                logger.warning("Experiment '%s' timed out", experiment.name)
            finally:
                await sandbox.cleanup()

            # Self-healing: ask LLM to analyze and fix the code
            if attempt < self._max_fix:
                fixed = await self._auto_fix(experiment, last_error or "", attempt)
                if not fixed:
                    logger.info("Auto-fix could not produce a fix; stopping retries.")
                    break

        return ExperimentResult(
            success=False,
            error=last_error,
            attempts=attempt,
            duration_seconds=time.monotonic() - start,
        )

    async def _auto_fix(
        self, experiment: Experiment, error: str, attempt: int,
    ) -> bool:
        """Ask LLM to fix the code. Returns True if code was modified."""
        if not experiment.code_path.exists():
            return False

        code = experiment.code_path.read_text(encoding="utf-8")
        prompt = (
            f"The following experiment code failed (attempt {attempt}).\n\n"
            f"## Code\n```python\n{code}\n```\n\n"
            f"## Error\n```\n{error}\n```\n\n"
            f"Fix the code. Return ONLY the complete fixed Python code, "
            f"wrapped in ```python``` fences."
        )

        try:
            response = await self._backend.execute(prompt, timeout=120)
            fixed_code = self._extract_code(response.content)
            if fixed_code and fixed_code != code:
                experiment.code_path.write_text(fixed_code, encoding="utf-8")
                logger.info("Auto-fix applied (attempt %d)", attempt)
                return True
        except Exception as e:
            logger.error("Auto-fix failed: %s", e)

        return False

    @staticmethod
    def _extract_code(text: str) -> str | None:
        """Extract Python code from markdown fences and validate syntax."""
        marker = "```python"
        if marker not in text:
            return None
        start = text.index(marker) + len(marker)
        try:
            end = text.index("```", start)
        except ValueError:
            return None
        code = text[start:end].strip()
        if not code:
            return None
        # Validate that extracted code is syntactically valid Python
        try:
            compile(code, "<auto-fix>", "exec")
        except SyntaxError:
            logger.warning("Auto-fix produced invalid Python syntax, discarding")
            return None
        return code

    def _emit(self, stream: str, text: str) -> None:
        """Emit output to the callback if registered."""
        if self._on_output is not None:
            try:
                self._on_output(stream, text)  # type: ignore[operator]
            except Exception:
                pass

    @staticmethod
    def _gpu_env(experiment: Experiment) -> str:
        """Build CUDA_VISIBLE_DEVICES string."""
        if experiment.gpu_count == 0:
            return ""
        return ",".join(str(i) for i in range(experiment.gpu_count))
