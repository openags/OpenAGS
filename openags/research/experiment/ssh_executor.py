"""SSH remote sandbox — execute experiment code on remote servers via SSH."""

from __future__ import annotations

import asyncio
import logging
import shlex
from pathlib import Path

from openags.research.experiment.sandbox import ExecutionResult, Sandbox
from openags.models import RemoteServer

logger = logging.getLogger(__name__)


class SSHSandbox(Sandbox):
    """Execute commands on a remote server via SSH.

    Uses asyncio subprocess to call ssh/scp. Assumes key-based auth.
    """

    def __init__(
        self,
        server: RemoteServer,
        remote_dir: str = "/tmp/openags-experiments",
        timeout: int = 3600,
    ) -> None:
        self._server = server
        self._remote_dir = remote_dir
        self._timeout = timeout

    def _ssh_base_cmd(self) -> list[str]:
        """Build base SSH command with common options."""
        cmd = [
            "ssh",
            "-o", "StrictHostKeyChecking=no",
            "-o", "ConnectTimeout=10",
        ]
        if self._server.key_file:
            cmd.extend(["-i", str(self._server.key_file)])
        if self._server.port != 22:
            cmd.extend(["-p", str(self._server.port)])
        cmd.append(f"{self._server.user}@{self._server.host}")
        return cmd

    async def execute(self, command: str, env: dict[str, str] | None = None) -> ExecutionResult:
        """Execute a command on the remote server."""
        # Build remote command with environment and working directory
        env_prefix = ""
        if env:
            env_parts = [
                f"export {k}={shlex.quote(v)}" for k, v in env.items() if v
            ]
            if env_parts:
                env_prefix = " && ".join(env_parts) + " && "

        remote_cmd = (
            f"mkdir -p {self._remote_dir} && cd {self._remote_dir}"
            f" && {env_prefix}{command}"
        )
        full_cmd = [*self._ssh_base_cmd(), remote_cmd]

        try:
            proc = await asyncio.create_subprocess_exec(
                *full_cmd,
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

    async def upload(self, local_path: Path, remote_name: str | None = None) -> None:
        """Upload a file to the remote server."""
        target = remote_name or local_path.name
        remote_path = f"{self._server.user}@{self._server.host}:{self._remote_dir}/{target}"

        scp_cmd = ["scp", "-o", "StrictHostKeyChecking=no"]
        if self._server.key_file:
            scp_cmd.extend(["-i", str(self._server.key_file)])
        if self._server.port != 22:
            scp_cmd.extend(["-P", str(self._server.port)])
        scp_cmd.extend([str(local_path), remote_path])

        # Ensure remote dir exists first
        await self.execute(f"mkdir -p {self._remote_dir}")

        proc = await asyncio.create_subprocess_exec(
            *scp_cmd,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
        )
        _, stderr = await asyncio.wait_for(proc.communicate(), timeout=60)
        if proc.returncode != 0:
            raise RuntimeError(f"SCP failed: {stderr.decode(errors='replace')}")

    async def download(self, remote_name: str, local_path: Path) -> None:
        """Download a file from the remote server."""
        remote_path = f"{self._server.user}@{self._server.host}:{self._remote_dir}/{remote_name}"

        scp_cmd = ["scp", "-o", "StrictHostKeyChecking=no"]
        if self._server.key_file:
            scp_cmd.extend(["-i", str(self._server.key_file)])
        if self._server.port != 22:
            scp_cmd.extend(["-P", str(self._server.port)])
        scp_cmd.extend([remote_path, str(local_path)])

        proc = await asyncio.create_subprocess_exec(
            *scp_cmd,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
        )
        _, stderr = await asyncio.wait_for(proc.communicate(), timeout=60)
        if proc.returncode != 0:
            raise RuntimeError(f"SCP download failed: {stderr.decode(errors='replace')}")

    async def cleanup(self) -> None:
        """Remove the remote experiment directory."""
        try:
            await self.execute(f"rm -rf {self._remote_dir}")
        except Exception as e:
            logger.warning("Remote cleanup failed: %s", e)

    async def check_gpu(self) -> str:
        """Check GPU availability on the remote server."""
        nvidia_cmd = (
            "nvidia-smi --query-gpu=name,memory.free"
            " --format=csv,noheader 2>/dev/null || echo 'No GPU'"
        )
        result = await self.execute(nvidia_cmd)
        return result.stdout.strip()
