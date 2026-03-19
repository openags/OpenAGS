"""Git worktree manager — isolate parallel agent execution in separate worktrees."""

from __future__ import annotations

import asyncio
import logging
import uuid
from pathlib import Path

logger = logging.getLogger(__name__)


async def _run_git(args: list[str], cwd: Path | None = None) -> tuple[int, str, str]:
    """Run a git command and return (returncode, stdout, stderr)."""
    proc = await asyncio.create_subprocess_exec(
        "git",
        *args,
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.PIPE,
        cwd=str(cwd) if cwd else None,
    )
    stdout, stderr = await proc.communicate()
    return proc.returncode, stdout.decode().strip(), stderr.decode().strip()


class WorktreeManager:
    """Manage git worktrees for isolated agent execution."""

    def __init__(self, project_dir: Path) -> None:
        self._project_dir = project_dir
        self._worktrees_dir = project_dir / ".openags" / "worktrees"

    async def is_git_repo(self) -> bool:
        """Check if project directory is a git repository."""
        code, _, _ = await _run_git(["rev-parse", "--is-inside-work-tree"], self._project_dir)
        return code == 0

    async def create(self, agent_name: str) -> Path:
        """Create a temporary git worktree for an agent.

        Returns the worktree directory path.
        """
        if not await self.is_git_repo():
            raise RuntimeError(f"Not a git repository: {self._project_dir}")

        branch_id = uuid.uuid4().hex[:8]
        branch = f"openags/{agent_name}-{branch_id}"
        worktree_dir = self._worktrees_dir / f"{agent_name}-{branch_id}"
        self._worktrees_dir.mkdir(parents=True, exist_ok=True)

        code, out, err = await _run_git(
            ["worktree", "add", "-b", branch, str(worktree_dir)],
            self._project_dir,
        )
        if code != 0:
            raise RuntimeError(f"Failed to create worktree: {err}")

        logger.info("Created worktree at %s (branch: %s)", worktree_dir, branch)
        return worktree_dir

    async def cleanup(self, worktree_dir: Path) -> None:
        """Remove a worktree. Deletes branch if no changes were made."""
        if not worktree_dir.exists():
            return

        has_changes = await self._has_changes(worktree_dir)

        code, _, err = await _run_git(
            ["worktree", "remove", "--force", str(worktree_dir)],
            self._project_dir,
        )
        if code != 0:
            logger.warning("Failed to remove worktree %s: %s", worktree_dir, err)
            return

        if not has_changes:
            branch = worktree_dir.name
            await _run_git(["branch", "-D", f"openags/{branch}"], self._project_dir)
            logger.info("Cleaned up worktree and branch: %s", worktree_dir.name)
        else:
            logger.info("Kept branch with changes: %s", worktree_dir.name)

    async def cleanup_all(self) -> int:
        """Clean up all worktrees. Returns count of cleaned worktrees."""
        if not self._worktrees_dir.exists():
            return 0
        count = 0
        for d in self._worktrees_dir.iterdir():
            if d.is_dir():
                await self.cleanup(d)
                count += 1
        return count

    async def _has_changes(self, worktree_dir: Path) -> bool:
        """Check if worktree has uncommitted changes."""
        code, out, _ = await _run_git(["status", "--porcelain"], worktree_dir)
        return code == 0 and bool(out.strip())
