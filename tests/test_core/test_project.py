"""Tests for project management."""

from __future__ import annotations

from pathlib import Path

import pytest

from openags.agent.errors import ProjectError
from openags.research.project import ProjectManager


class TestProjectManager:
    def test_create_project(self, temp_workspace: Path) -> None:
        pm = ProjectManager(temp_workspace)
        project = pm.create("test-proj", "Test Project", "description")

        assert project.id == "test-proj"
        assert project.name == "Test Project"
        assert project.stage == "idle"
        assert project.workspace.exists()

        # Check standard directories were created
        assert (project.workspace / "literature" / "papers").is_dir()
        assert (project.workspace / "experiments" / "code").is_dir()
        assert (project.workspace / "manuscript" / "drafts").is_dir()
        assert (project.workspace / "literature" / "memory.md").exists()
        assert (project.workspace / ".openags" / "history.md").exists()

    def test_create_duplicate_raises(self, temp_workspace: Path) -> None:
        pm = ProjectManager(temp_workspace)
        pm.create("test-proj", "Test")

        with pytest.raises(ProjectError, match="already exists"):
            pm.create("test-proj", "Test Again")

    def test_get_project(self, temp_workspace: Path) -> None:
        pm = ProjectManager(temp_workspace)
        pm.create("test-proj", "Test Project")

        loaded = pm.get("test-proj")
        assert loaded.id == "test-proj"
        assert loaded.name == "Test Project"

    def test_get_nonexistent_raises(self, temp_workspace: Path) -> None:
        pm = ProjectManager(temp_workspace)
        with pytest.raises(ProjectError, match="not found"):
            pm.get("nonexistent")

    def test_list_all(self, temp_workspace: Path) -> None:
        pm = ProjectManager(temp_workspace)
        pm.create("alpha", "Alpha")
        pm.create("beta", "Beta")

        projects = pm.list_all()
        assert len(projects) == 2
        assert projects[0].id == "alpha"
        assert projects[1].id == "beta"

    def test_update_stage(self, temp_workspace: Path) -> None:
        pm = ProjectManager(temp_workspace)
        pm.create("test-proj", "Test")

        updated = pm.update_stage("test-proj", "literature")
        assert updated.stage == "literature"

        # Verify persistence
        reloaded = pm.get("test-proj")
        assert reloaded.stage == "literature"

    def test_delete_project(self, temp_workspace: Path) -> None:
        pm = ProjectManager(temp_workspace)
        project = pm.create("to-delete", "Delete Me")
        assert project.workspace.exists()

        pm.delete("to-delete")
        assert not project.workspace.exists()

    def test_delete_nonexistent_raises(self, temp_workspace: Path) -> None:
        pm = ProjectManager(temp_workspace)
        with pytest.raises(ProjectError, match="not found"):
            pm.delete("ghost")
