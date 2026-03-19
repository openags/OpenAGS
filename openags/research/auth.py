"""User authentication: registration, login, token management."""

from __future__ import annotations

import hashlib
import json
import logging
import secrets
from datetime import datetime
from pathlib import Path

from openags.agent.errors import OpenAGSError
from openags.models import UserPublic

logger = logging.getLogger(__name__)


class AuthError(OpenAGSError):
    """Authentication or authorization failure."""


class UserManager:
    """File-backed user management with token auth."""

    def __init__(self, workspace_dir: Path) -> None:
        self._file = workspace_dir / "users.json"
        self._tokens_file = workspace_dir / "tokens.json"
        self._tokens: dict[str, str] = {}  # token → user_id
        self._users: dict[str, dict[str, str]] = {}  # username → user record
        self._load()
        self._load_tokens()

    # ── public API ────────────────────────────────────

    def register(
        self, username: str, password: str, display_name: str = ""
    ) -> tuple[UserPublic, str]:
        """Create a new user account.  Returns (user, token)."""
        username = username.strip().lower()
        if not username or len(username) < 2:
            raise AuthError("Username must be at least 2 characters")
        if username in self._users:
            raise AuthError(f"User '{username}' already exists")
        if len(password) < 4:
            raise AuthError("Password must be at least 4 characters")

        salt = secrets.token_hex(16)
        pw_hash = self._hash(password, salt)
        user_id = f"u-{secrets.token_hex(8)}"
        now = datetime.now().isoformat()

        record: dict[str, str] = {
            "id": user_id,
            "username": username,
            "display_name": display_name or username,
            "password_hash": pw_hash,
            "salt": salt,
            "created_at": now,
        }
        self._users[username] = record
        self._save()

        token = self._make_token(user_id)
        logger.info("Registered user '%s' (%s)", username, user_id)
        return self._to_public(record), token

    def login(self, username: str, password: str) -> tuple[UserPublic, str]:
        """Authenticate credentials.  Returns (user, token)."""
        username = username.strip().lower()
        record = self._users.get(username)
        if not record:
            raise AuthError("Invalid username or password")

        expected = self._hash(password, record["salt"])
        if expected != record["password_hash"]:
            raise AuthError("Invalid username or password")

        token = self._make_token(record["id"])
        return self._to_public(record), token

    def verify_token(self, token: str) -> UserPublic | None:
        """Return user for valid token, else None."""
        user_id = self._tokens.get(token)
        if not user_id:
            return None
        for rec in self._users.values():
            if rec["id"] == user_id:
                return self._to_public(rec)
        return None

    def logout(self, token: str) -> None:
        """Invalidate a token."""
        self._tokens.pop(token, None)
        self._save_tokens()

    # ── internal ──────────────────────────────────────

    @staticmethod
    def _hash(password: str, salt: str) -> str:
        return hashlib.pbkdf2_hmac("sha256", password.encode(), salt.encode(), 100_000).hex()

    def _make_token(self, user_id: str) -> str:
        token = secrets.token_urlsafe(32)
        self._tokens[token] = user_id
        self._save_tokens()
        return token

    @staticmethod
    def _to_public(record: dict[str, str]) -> UserPublic:
        return UserPublic(
            id=record["id"],
            username=record["username"],
            display_name=record.get("display_name", record["username"]),
            created_at=datetime.fromisoformat(record["created_at"]),
        )

    def _load(self) -> None:
        if not self._file.exists():
            return
        try:
            data = json.loads(self._file.read_text(encoding="utf-8"))
            self._users = data.get("users", {})
        except (json.JSONDecodeError, OSError):
            logger.warning("Failed to load users file, starting fresh")

    def _load_tokens(self) -> None:
        if not self._tokens_file.exists():
            return
        try:
            self._tokens = json.loads(self._tokens_file.read_text(encoding="utf-8"))
        except (json.JSONDecodeError, OSError):
            logger.warning("Failed to load tokens file")

    def _save_tokens(self) -> None:
        self._tokens_file.parent.mkdir(parents=True, exist_ok=True)
        self._tokens_file.write_text(
            json.dumps(self._tokens), encoding="utf-8"
        )
        try:
            self._tokens_file.chmod(0o600)
        except OSError:
            pass

    def _save(self) -> None:
        self._file.parent.mkdir(parents=True, exist_ok=True)
        self._file.write_text(
            json.dumps({"users": self._users}, indent=2, default=str),
            encoding="utf-8",
        )
        try:
            self._file.chmod(0o600)
        except OSError:
            pass
