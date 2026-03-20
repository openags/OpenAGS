"""Session management — tracks conversation state within a project module.

Supports session resume, naming, and forking (Phase 8).
"""

from __future__ import annotations

import json
import uuid
from pathlib import Path

from openags.models import Message, RunMode, Session


class SessionManager:
    """Manages conversation sessions within a module directory.

    Sessions are stored as JSONL files in {module_dir}/sessions/.
    Each module (literature, manuscript, etc.) has its own sessions.
    """

    def __init__(self, module_dir: Path):
        self._sessions_dir = module_dir / "sessions"
        self._sessions_dir.mkdir(parents=True, exist_ok=True)

    def create(
        self,
        project_id: str,
        agent_role: str = "ags",
        mode: RunMode = RunMode.INTERACTIVE,
        name: str = "",
        agent_name: str = "",
    ) -> Session:
        """Create a new session."""
        session = Session(
            id=uuid.uuid4().hex[:12],
            project_id=project_id,
            agent_role=agent_role,
            agent_name=agent_name or agent_role,
            mode=mode,
            name=name,
        )
        self._save(session)
        return session

    def get(self, session_id: str) -> Session | None:
        path = self._sessions_dir / f"{session_id}.jsonl"
        if not path.exists():
            return None

        lines = path.read_text(encoding="utf-8").strip().splitlines()
        if not lines:
            return None

        # First line is session metadata
        meta = json.loads(lines[0])
        session = Session.model_validate(meta)

        # Remaining lines are messages
        for line in lines[1:]:
            msg = Message.model_validate(json.loads(line))
            session.messages.append(msg)

        return session

    def add_message(self, session_id: str, message: Message) -> None:
        path = self._sessions_dir / f"{session_id}.jsonl"
        with open(path, "a", encoding="utf-8") as f:
            f.write(message.model_dump_json() + "\n")

    def list_sessions(self, project_id: str) -> list[Session]:
        sessions: list[Session] = []
        for path in sorted(self._sessions_dir.glob("*.jsonl")):
            session = self.get(path.stem)
            if session and session.project_id == project_id:
                sessions.append(session)
        return sessions

    def delete(self, session_id: str) -> bool:
        """Delete a session file. Returns True if it existed."""
        path = self._sessions_dir / f"{session_id}.jsonl"
        if path.exists():
            path.unlink()
            return True
        return False

    # ── Phase 8: Session Resume ────────────────────────

    def get_latest(
        self,
        project_id: str,
        agent_name: str | None = None,
    ) -> Session | None:
        """Get the most recently created session.

        Optionally filter by agent_name.
        """
        latest: Session | None = None
        latest_time = None

        for path in self._sessions_dir.glob("*.jsonl"):
            session = self.get(path.stem)
            if session is None or session.project_id != project_id:
                continue
            if agent_name and session.agent_name != agent_name:
                continue
            if latest_time is None or session.created_at > latest_time:
                latest = session
                latest_time = session.created_at

        return latest

    def get_by_name(self, project_id: str, name: str) -> Session | None:
        """Find a session by its display name."""
        for path in self._sessions_dir.glob("*.jsonl"):
            session = self.get(path.stem)
            if session and session.project_id == project_id and session.name == name:
                return session
        return None

    def rename(self, session_id: str, name: str) -> bool:
        """Rename a session. Returns True if found and renamed."""
        session = self.get(session_id)
        if session is None:
            return False
        session.name = name
        # Rewrite metadata (first line)
        path = self._sessions_dir / f"{session_id}.jsonl"
        lines = path.read_text(encoding="utf-8").strip().splitlines()
        if not lines:
            return False
        meta = json.loads(lines[0])
        meta["name"] = name
        lines[0] = json.dumps(meta)
        path.write_text("\n".join(lines) + "\n", encoding="utf-8")
        return True

    def fork(self, session_id: str) -> Session | None:
        """Fork a session — create a new session with copied messages.

        The new session gets a new ID but retains all message history.
        """
        original = self.get(session_id)
        if original is None:
            return None

        new_session = Session(
            id=uuid.uuid4().hex[:12],
            project_id=original.project_id,
            agent_role=original.agent_role,
            agent_name=original.agent_name,
            mode=original.mode,
            name=f"{original.name} (fork)" if original.name else "",
        )

        # Save metadata + all messages from original
        path = self._sessions_dir / f"{new_session.id}.jsonl"
        meta = new_session.model_dump(mode="json", exclude={"messages"})
        lines = [json.dumps(meta)]
        for msg in original.messages:
            lines.append(msg.model_dump_json())
        path.write_text("\n".join(lines) + "\n", encoding="utf-8")

        return new_session

    def _save(self, session: Session) -> None:
        path = self._sessions_dir / f"{session.id}.jsonl"
        meta = session.model_dump(mode="json", exclude={"messages"})
        path.write_text(json.dumps(meta) + "\n", encoding="utf-8")
