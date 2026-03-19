"""Tests for memory system."""

from __future__ import annotations

from openags.agent.memory import MemorySystem
from openags.models import Project


class TestMemorySystem:
    def test_empty_context(self, temp_project: Project) -> None:
        mem = MemorySystem(temp_project.workspace)
        ctx = mem.get_context()
        assert ctx == ""  # Empty memory + empty history

    def test_update_and_read_section(self, temp_project: Project) -> None:
        mem = MemorySystem(temp_project.workspace)
        mem.update_memory("findings", "Key finding: X outperforms Y")

        section = mem.read_memory_section("findings")
        assert section is not None
        assert "X outperforms Y" in section

    def test_update_existing_section(self, temp_project: Project) -> None:
        mem = MemorySystem(temp_project.workspace)
        mem.update_memory("status", "Phase 1 complete")
        mem.update_memory("status", "Phase 2 in progress")

        section = mem.read_memory_section("status")
        assert section is not None
        assert "Phase 2" in section
        assert "Phase 1" not in section

    def test_multiple_sections(self, temp_project: Project) -> None:
        mem = MemorySystem(temp_project.workspace)
        mem.update_memory("findings", "Finding A")
        mem.update_memory("methods", "Method B")

        assert "Finding A" in (mem.read_memory_section("findings") or "")
        assert "Method B" in (mem.read_memory_section("methods") or "")

    def test_append_history(self, temp_project: Project) -> None:
        mem = MemorySystem(temp_project.workspace)
        mem.append_history("test_event", "Some details here")

        ctx = mem.get_context()
        assert "test_event" in ctx
        assert "Some details" in ctx

    def test_history_is_append_only(self, temp_project: Project) -> None:
        mem = MemorySystem(temp_project.workspace)
        mem.append_history("event_1", "First")
        mem.append_history("event_2", "Second")

        ctx = mem.get_context()
        assert "event_1" in ctx
        assert "event_2" in ctx

    def test_context_includes_memory_and_history(self, temp_project: Project) -> None:
        mem = MemorySystem(temp_project.workspace)
        mem.update_memory("goal", "Publish at NeurIPS")
        mem.append_history("started", "Project initialized")

        ctx = mem.get_context()
        assert "Project Memory" in ctx
        assert "NeurIPS" in ctx
        assert "Recent History" in ctx
        assert "started" in ctx

    def test_needs_compression(self, temp_project: Project) -> None:
        mem = MemorySystem(temp_project.workspace)
        assert not mem.needs_compression()

        # Write many lines
        memory_path = temp_project.workspace / "memory.md"
        memory_path.write_text("\n".join([f"Line {i}" for i in range(300)]))
        assert mem.needs_compression()
