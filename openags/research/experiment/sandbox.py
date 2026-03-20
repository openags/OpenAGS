"""Sandbox execution — isolated environments for running experiment code.

Supports:
  - LocalSandbox: subprocess execution (default, no setup needed)
  - DockerSandbox: Docker container execution (isolated, optional)
  - RemoteSandbox: placeholder for SSH-based remote execution (future)
"""

from __future__ import annotations

import asyncio
import logging
import os
from abc import ABC, abstractmethod
from dataclasses import dataclass
from pathlib import Path

from openags.models import SandboxMode

logger = logging.getLogger(__name__)


@dataclass
class ExecutionResult:
    """Result of a sandbox command execution."""

    returncode: int
    stdout: str
    stderr: str


class Sandbox(ABC):
    """Abstract sandbox — all execution environments implement this."""

    @abstractmethod
    async def execute(self, command: str, env: dict[str, str] | None = None) -> ExecutionResult: ...

    @abstractmethod
    async def cleanup(self) -> None: ...


# ── Local sandbox ──────────────────────────────────────


class LocalSandbox(Sandbox):
    """Run commands as local subprocesses in a working directory."""

    def __init__(self, working_dir: Path, timeout: int) -> None:
        self._cwd = working_dir
        self._timeout = timeout

    async def execute(self, command: str, env: dict[str, str] | None = None) -> ExecutionResult:
        merged_env = {**os.environ, **(env or {})}
        # Remove empty values to avoid CUDA issues
        merged_env = {k: v for k, v in merged_env.items() if v}

        try:
            proc = await asyncio.create_subprocess_shell(
                command,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE,
                cwd=self._cwd,
                env=merged_env,
            )
            stdout, stderr = await asyncio.wait_for(
                proc.communicate(),
                timeout=self._timeout,
            )
            return ExecutionResult(
                returncode=proc.returncode or 0,
                stdout=stdout.decode(errors="replace"),
                stderr=stderr.decode(errors="replace"),
            )
        except TimeoutError:
            proc.kill()
            await proc.communicate()
            raise

    async def cleanup(self) -> None:
        pass


# ── Docker sandbox ─────────────────────────────────────


class DockerSandbox(Sandbox):
    """Run commands in a Docker container with resource limits.

    Security: network disabled, memory/CPU capped, only working dir mounted.
    """

    def __init__(
        self,
        working_dir: Path,
        timeout: int,
        image: str = "python:3.11-slim",
        memory: str = "4g",
        cpus: str = "2",
    ) -> None:
        self._cwd = working_dir
        self._timeout = timeout
        self._image = image
        self._memory = memory
        self._cpus = cpus
        self._container_id: str | None = None

    async def execute(self, command: str, env: dict[str, str] | None = None) -> ExecutionResult:
        env_args: list[str] = []
        for k, v in (env or {}).items():
            if v:
                env_args.extend(["-e", f"{k}={v}"])

        docker_cmd = [
            "docker",
            "run",
            "--rm",
            "--network=none",
            f"--memory={self._memory}",
            f"--cpus={self._cpus}",
            "-v",
            f"{self._cwd}:/workspace:rw",
            "-w",
            "/workspace",
            *env_args,
            self._image,
            "sh",
            "-c",
            command,
        ]

        try:
            proc = await asyncio.create_subprocess_exec(
                *docker_cmd,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE,
            )
            stdout, stderr = await asyncio.wait_for(
                proc.communicate(),
                timeout=self._timeout,
            )
            return ExecutionResult(
                returncode=proc.returncode or 0,
                stdout=stdout.decode(errors="replace"),
                stderr=stderr.decode(errors="replace"),
            )
        except TimeoutError:
            proc.kill()
            await proc.communicate()
            raise

    async def cleanup(self) -> None:
        if self._container_id:
            try:
                proc = await asyncio.create_subprocess_exec(
                    "docker",
                    "kill",
                    self._container_id,
                    stdout=asyncio.subprocess.DEVNULL,
                    stderr=asyncio.subprocess.DEVNULL,
                )
                await proc.communicate()
            except Exception:
                pass


# ── Factory ────────────────────────────────────────────


class SandboxFactory:
    """Creates sandbox instances based on configured mode."""

    def __init__(self, mode: SandboxMode = SandboxMode.LOCAL) -> None:
        self._mode = mode

    async def create(
        self,
        working_dir: Path,
        timeout: int = 3600,
        **kwargs: str,
    ) -> Sandbox:
        if self._mode == SandboxMode.DOCKER:
            return DockerSandbox(working_dir, timeout, **kwargs)
        if self._mode == SandboxMode.REMOTE:
            from openags.models import RemoteServer
            from openags.research.experiment.ssh_executor import SSHSandbox

            server = kwargs.get("server")  # type: ignore[assignment]
            if isinstance(server, RemoteServer):
                return SSHSandbox(server, timeout=timeout)  # type: ignore[return-value]
            raise ValueError("Remote sandbox requires a 'server' (RemoteServer) kwarg")
        return LocalSandbox(working_dir, timeout)
