"""BashExecute tool — run shell commands in the project workspace."""

from __future__ import annotations

import asyncio
import logging
from pathlib import Path
from typing import Any

from openags.agent.tools.base import ToolResult

logger = logging.getLogger(__name__)

MAX_OUTPUT_CHARS = 50_000
MAX_TIMEOUT = 600

# Commands that should never be executed
_DANGEROUS_PATTERNS = frozenset({
    "rm -rf /",
    "rm -rf /*",
    "mkfs",
    "dd if=",
    ":(){",
    "> /dev/sd",
    "> /dev/nv",
    "chmod -R 777 /",
    "shutdown",
    "reboot",
    "init 0",
    "init 6",
})


class BashExecuteTool:
    """Execute shell commands in the project workspace (satisfies Tool protocol).

    Security: commands run with cwd=workspace, have a timeout, and are checked
    against a blocklist of dangerous patterns.
    """

    _name = "bash"
    _description = "Run a shell command in the project workspace directory. Returns stdout and stderr."

    def __init__(self, workspace: Path) -> None:
        self._workspace = workspace

    @property
    def name(self) -> str:
        return self._name

    @property
    def description(self) -> str:
        return self._description

    async def invoke(self, **kwargs: Any) -> ToolResult:
        command = kwargs.get("command", "")
        timeout = min(int(kwargs.get("timeout", 120)), MAX_TIMEOUT)

        if not command:
            return ToolResult(success=False, error="'command' is required.")

        # Safety check
        cmd_lower = command.lower()
        for pattern in _DANGEROUS_PATTERNS:
            if pattern in cmd_lower:
                return ToolResult(
                    success=False,
                    error=f"Dangerous command blocked: contains '{pattern}'",
                )

        try:
            proc = await asyncio.create_subprocess_shell(
                command,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE,
                cwd=str(self._workspace),
            )
            try:
                stdout_bytes, stderr_bytes = await asyncio.wait_for(
                    proc.communicate(),
                    timeout=timeout,
                )
            except TimeoutError:
                proc.kill()
                await proc.wait()
                return ToolResult(
                    success=False,
                    error=f"Command timed out after {timeout}s",
                    metadata={"command": command[:200]},
                )

            stdout = stdout_bytes.decode(errors="replace").strip()
            stderr = stderr_bytes.decode(errors="replace").strip()
            output = stdout
            if stderr:
                output = f"{stdout}\n[stderr]\n{stderr}" if stdout else stderr

            if not output:
                output = "(no output)"
            elif len(output) > MAX_OUTPUT_CHARS:
                output = output[:MAX_OUTPUT_CHARS] + f"\n... (truncated at {MAX_OUTPUT_CHARS} chars)"

            return ToolResult(
                success=proc.returncode == 0,
                data=output,
                error=f"Exit code {proc.returncode}" if proc.returncode != 0 else None,
                metadata={
                    "command": command[:200],
                    "exit_code": proc.returncode,
                },
            )
        except Exception as e:
            logger.error("BashExecuteTool error: %s", e)
            return ToolResult(success=False, error=str(e))

    def schema(self) -> dict[str, Any]:
        return {
            "type": "object",
            "properties": {
                "command": {
                    "type": "string",
                    "description": "Shell command to execute in the project workspace",
                },
                "timeout": {
                    "type": "integer",
                    "description": "Timeout in seconds (default 120, max 600)",
                    "default": 120,
                },
            },
            "required": ["command"],
        }
