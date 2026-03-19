"""Shared task list for Agent Teams — JSONL-based with file locking."""

from __future__ import annotations

import json
import logging
import platform
import uuid
from datetime import datetime
from io import TextIOWrapper
from pathlib import Path

from pydantic import BaseModel, Field

logger = logging.getLogger(__name__)


class TaskItem(BaseModel):
    """A single task in the shared task list."""
    id: str = Field(default_factory=lambda: uuid.uuid4().hex[:12])
    description: str
    assigned_to: str | None = None
    status: str = "pending"  # pending | in_progress | completed
    result: str = ""
    depends_on: list[str] = []
    created_at: datetime = Field(default_factory=datetime.now)
    completed_at: datetime | None = None


def _lock(f: TextIOWrapper) -> None:
    if platform.system() != "Windows":
        import fcntl
        fcntl.flock(f, fcntl.LOCK_EX)


def _unlock(f: TextIOWrapper) -> None:
    if platform.system() != "Windows":
        import fcntl
        fcntl.flock(f, fcntl.LOCK_UN)


class TaskList:
    """Project-level shared task list with file-locked JSONL persistence."""

    def __init__(self, project_dir: Path) -> None:
        self._path = project_dir / ".openags" / "tasks.jsonl"
        self._path.parent.mkdir(parents=True, exist_ok=True)

    def add(self, description: str, assigned_to: str | None = None, depends_on: list[str] | None = None) -> TaskItem:
        """Add a new task."""
        task = TaskItem(
            description=description,
            assigned_to=assigned_to,
            depends_on=depends_on or [],
        )
        self._append(task)
        logger.info("Task added: %s (assigned=%s)", task.id, assigned_to)
        return task

    def claim(self, agent_name: str) -> TaskItem | None:
        """Claim the next available pending task for an agent.

        Only claims tasks with no unresolved dependencies.
        Uses file locking to prevent race conditions.
        """
        tasks = self._load_all()
        completed_ids = {t.id for t in tasks if t.status == "completed"}

        for task in tasks:
            if task.status != "pending":
                continue
            if task.assigned_to and task.assigned_to != agent_name:
                continue
            if task.depends_on and not all(d in completed_ids for d in task.depends_on):
                continue
            task.status = "in_progress"
            task.assigned_to = agent_name
            self._save_all(tasks)
            logger.info("Task %s claimed by %s", task.id, agent_name)
            return task
        return None

    def complete(self, task_id: str, result: str = "") -> bool:
        """Mark a task as completed."""
        tasks = self._load_all()
        for task in tasks:
            if task.id == task_id:
                task.status = "completed"
                task.result = result
                task.completed_at = datetime.now()
                self._save_all(tasks)
                logger.info("Task %s completed", task_id)
                return True
        return False

    def list_all(self) -> list[TaskItem]:
        """List all tasks."""
        return self._load_all()

    def list_pending(self) -> list[TaskItem]:
        """List pending tasks."""
        return [t for t in self._load_all() if t.status == "pending"]

    def _load_all(self) -> list[TaskItem]:
        if not self._path.exists():
            return []
        tasks: list[TaskItem] = []
        for line in self._path.read_text(encoding="utf-8").strip().splitlines():
            if line.strip():
                tasks.append(TaskItem.model_validate(json.loads(line)))
        return tasks

    def _save_all(self, tasks: list[TaskItem]) -> None:
        with open(self._path, "w", encoding="utf-8") as f:
            _lock(f)
            try:
                for task in tasks:
                    f.write(task.model_dump_json() + "\n")
            finally:
                _unlock(f)

    def _append(self, task: TaskItem) -> None:
        with open(self._path, "a", encoding="utf-8") as f:
            _lock(f)
            try:
                f.write(task.model_dump_json() + "\n")
            finally:
                _unlock(f)
