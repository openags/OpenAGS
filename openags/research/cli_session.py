"""CLI persistent session — interactive terminal for external CLI agents.

Instead of a single execute() call, this manages a persistent subprocess
that the user can interact with over multiple turns. Each message is sent
to stdin, and output is read from stdout.

Supports two modes:
  - Interactive: user sends messages, CLI responds (like a terminal)
  - One-shot: send a single task, wait for completion, return result
"""

from __future__ import annotations

import asyncio
import logging
import uuid
from pathlib import Path

from openags.agent.errors import BackendError
from openags.models import BackendConfig, BackendResponse, TokenUsage

logger = logging.getLogger(__name__)


class CLISession:
    """A persistent interactive session with an external CLI agent.

    Usage::

        session = CLISession(cli_name="claude", folder=Path("./literature"))
        await session.start()
        response = await session.send("search for transformer papers")
        response2 = await session.send("summarize the top 3")
        await session.stop()
    """

    def __init__(
        self,
        cli_name: str,
        folder: Path,
        build_command: list[str] | None = None,
        env: dict[str, str] | None = None,
        timeout: int = 300,
    ) -> None:
        self.id = str(uuid.uuid4())[:8]
        self._cli_name = cli_name
        self._folder = folder
        self._command = build_command or [cli_name]
        self._env = env
        self._timeout = timeout
        self._proc: asyncio.subprocess.Process | None = None
        self._history: list[dict[str, str]] = []

    @property
    def is_running(self) -> bool:
        return self._proc is not None and self._proc.returncode is None

    async def start(self) -> None:
        """Start the CLI subprocess."""
        if self.is_running:
            return

        try:
            self._proc = await asyncio.create_subprocess_exec(
                *self._command,
                stdin=asyncio.subprocess.PIPE,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE,
                cwd=str(self._folder),
                env=self._env,
            )
            logger.info("CLI session started: %s in %s (pid=%s)",
                        self._cli_name, self._folder, self._proc.pid)
        except FileNotFoundError:
            raise BackendError(
                f"{self._cli_name} CLI not found in PATH. Please install it first."
            )

    async def send(self, message: str) -> str:
        """Send a message to the CLI and read the response.

        For CLIs that don't support interactive stdin (most agent CLIs),
        this falls back to running a new subprocess per message.
        """
        self._history.append({"role": "user", "content": message})

        # Most CLI agents (claude --print, codex) don't support interactive stdin.
        # They take a prompt as argument and exit. So we run per-message.
        try:
            proc = await asyncio.create_subprocess_exec(
                *self._command, message,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE,
                cwd=str(self._folder),
                env=self._env,
            )
            stdout_bytes, stderr_bytes = await asyncio.wait_for(
                proc.communicate(),
                timeout=self._timeout,
            )
        except FileNotFoundError:
            raise BackendError(f"{self._cli_name} not found in PATH.")
        except TimeoutError:
            proc.kill()
            raise BackendError(f"{self._cli_name} timed out after {self._timeout}s")

        output = stdout_bytes.decode(errors="replace").strip()
        if not output and stderr_bytes:
            output = stderr_bytes.decode(errors="replace").strip()

        self._history.append({"role": "assistant", "content": output})
        return output

    async def send_streaming(self, message: str):
        """Send a message and yield output chunks as they arrive."""
        self._history.append({"role": "user", "content": message})

        try:
            proc = await asyncio.create_subprocess_exec(
                *self._command, message,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE,
                cwd=str(self._folder),
                env=self._env,
            )
        except FileNotFoundError:
            raise BackendError(f"{self._cli_name} not found in PATH.")

        full_output: list[str] = []
        assert proc.stdout is not None
        async for line in proc.stdout:
            text = line.decode(errors="replace")
            if text:
                full_output.append(text)
                yield text

        await proc.wait()
        self._history.append({"role": "assistant", "content": "".join(full_output)})

    @property
    def history(self) -> list[dict[str, str]]:
        """Full conversation history for this session."""
        return list(self._history)

    async def stop(self) -> None:
        """Stop the CLI subprocess if running."""
        if self._proc and self._proc.returncode is None:
            self._proc.terminate()
            try:
                await asyncio.wait_for(self._proc.wait(), timeout=5)
            except TimeoutError:
                self._proc.kill()
            logger.info("CLI session stopped: %s", self.id)
        self._proc = None


def create_cli_session(
    runtime_type: str,
    folder: Path,
    config: BackendConfig,
) -> CLISession:
    """Create a CLISession for a specific runtime type and folder.

    Automatically sets up the correct command and environment for each CLI.
    """
    import os
    import shutil

    if runtime_type == "claude_code":
        cmd = ["claude", "--print", "--output-format", "json"]
        model = config.model
        if model in {"claude-sonnet-4-6", "claude-opus-4-6", "claude-haiku-4-5"}:
            cmd.extend(["--model", model])
        cmd.append("-p")
        # Clean env to prevent nested session issues
        env = {k: v for k, v in os.environ.items() if not k.startswith("CLAUDE")}
    elif runtime_type == "codex":
        cmd = ["codex", "--quiet"]
        env = None
    elif runtime_type == "copilot":
        cmd = ["gh", "copilot", "suggest"]
        env = None
    elif runtime_type == "gemini_cli":
        cmd = ["gemini"]
        env = None
    else:
        raise BackendError(f"Unknown CLI runtime: {runtime_type}")

    # Verify CLI exists
    cli_name = cmd[0]
    if shutil.which(cli_name) is None:
        raise BackendError(f"{cli_name} not found in PATH. Please install it first.")

    return CLISession(
        cli_name=cli_name,
        folder=folder,
        build_command=cmd,
        env=env,
        timeout=config.timeout,
    )
