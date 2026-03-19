"""Tests for user authentication (UserManager)."""

from __future__ import annotations

from pathlib import Path

import pytest

from openags.research.auth import AuthError, UserManager


class TestUserManager:
    def test_register_success(self, tmp_path: Path) -> None:
        mgr = UserManager(tmp_path)
        user, token = mgr.register("alice", "secret1234", "Alice A.")

        assert user.username == "alice"
        assert user.display_name == "Alice A."
        assert user.id.startswith("u-")
        assert isinstance(token, str)
        assert len(token) > 0

    def test_register_duplicate_raises(self, tmp_path: Path) -> None:
        mgr = UserManager(tmp_path)
        mgr.register("alice", "secret1234")

        with pytest.raises(AuthError, match="already exists"):
            mgr.register("alice", "otherpass")

    def test_register_short_username_raises(self, tmp_path: Path) -> None:
        mgr = UserManager(tmp_path)

        with pytest.raises(AuthError, match="at least 2 characters"):
            mgr.register("a", "secret1234")

    def test_register_short_password_raises(self, tmp_path: Path) -> None:
        mgr = UserManager(tmp_path)

        with pytest.raises(AuthError, match="at least 4 characters"):
            mgr.register("alice", "ab")

    def test_login_success(self, tmp_path: Path) -> None:
        mgr = UserManager(tmp_path)
        reg_user, _ = mgr.register("bob", "password1")

        login_user, token = mgr.login("bob", "password1")
        assert login_user.username == "bob"
        assert login_user.id == reg_user.id
        assert isinstance(token, str)

    def test_login_wrong_password_raises(self, tmp_path: Path) -> None:
        mgr = UserManager(tmp_path)
        mgr.register("bob", "password1")

        with pytest.raises(AuthError, match="Invalid username or password"):
            mgr.login("bob", "wrongpass")

    def test_login_nonexistent_user_raises(self, tmp_path: Path) -> None:
        mgr = UserManager(tmp_path)

        with pytest.raises(AuthError, match="Invalid username or password"):
            mgr.login("ghost", "whatever")

    def test_verify_token_valid(self, tmp_path: Path) -> None:
        mgr = UserManager(tmp_path)
        user, token = mgr.register("carol", "pass1234")

        verified = mgr.verify_token(token)
        assert verified is not None
        assert verified.username == "carol"
        assert verified.id == user.id

    def test_verify_token_invalid_returns_none(self, tmp_path: Path) -> None:
        mgr = UserManager(tmp_path)

        result = mgr.verify_token("totally-bogus-token")
        assert result is None

    def test_logout_invalidates_token(self, tmp_path: Path) -> None:
        mgr = UserManager(tmp_path)
        _, token = mgr.register("dave", "pass1234")

        assert mgr.verify_token(token) is not None
        mgr.logout(token)
        assert mgr.verify_token(token) is None

    def test_persistence_across_instances(self, tmp_path: Path) -> None:
        mgr1 = UserManager(tmp_path)
        mgr1.register("eve", "pass1234", "Eve E.")

        mgr2 = UserManager(tmp_path)
        user, token = mgr2.login("eve", "pass1234")
        assert user.username == "eve"
        assert user.display_name == "Eve E."
