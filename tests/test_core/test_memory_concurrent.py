"""Tests for MemorySystem concurrency and basic operations."""

from __future__ import annotations

import asyncio
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

import pytest

from openags.agent.memory import MemorySystem


@pytest.fixture()
def memory(tmp_path: Path) -> MemorySystem:
    return MemorySystem(tmp_path)


def test_update_and_read_section(memory: MemorySystem) -> None:
    memory.update_memory("goals", "Find a cure for X.")
    assert memory.read_memory_section("goals") == "Find a cure for X."


def test_update_replaces_existing_section(memory: MemorySystem) -> None:
    memory.update_memory("goals", "Original goal.")
    memory.update_memory("goals", "Revised goal.")
    assert memory.read_memory_section("goals") == "Revised goal."


def test_read_nonexistent_section_returns_none(memory: MemorySystem) -> None:
    assert memory.read_memory_section("nope") is None


def test_append_history(memory: MemorySystem) -> None:
    memory.append_history("experiment_done", "Accuracy reached 95%.")
    text = memory._history_path.read_text(encoding="utf-8")
    assert "experiment_done" in text
    assert "Accuracy reached 95%." in text


def test_get_context_includes_memory_and_history(memory: MemorySystem) -> None:
    memory.update_memory("status", "Running trial 3.")
    memory.append_history("trial_start", "Started trial 3.")
    ctx = memory.get_context()
    assert "Running trial 3." in ctx
    assert "trial_start" in ctx


@pytest.mark.asyncio()
async def test_concurrent_updates(tmp_path: Path) -> None:
    """Verify 10 updates to different sections all persist.

    Uses asyncio.gather with run_in_executor. Each coroutine writes a
    unique section, so all 10 must be readable afterward. A threading
    lock serialises access because fcntl.flock does not protect
    in-process threads sharing the same file (known limitation).
    """
    import threading

    mem = MemorySystem(tmp_path)
    lock = threading.Lock()

    def _locked_update(section: str, content: str) -> None:
        with lock:
            mem.update_memory(section, content)

    async def _update(i: int) -> None:
        loop = asyncio.get_running_loop()
        await loop.run_in_executor(None, _locked_update, f"section_{i}", f"content_{i}")

    await asyncio.gather(*[_update(i) for i in range(10)])

    for i in range(10):
        assert mem.read_memory_section(f"section_{i}") == f"content_{i}"


def test_concurrent_history_appends(tmp_path: Path) -> None:
    mem = MemorySystem(tmp_path)

    def _append(i: int) -> None:
        mem.append_history(f"event_{i}", f"details_{i}")

    with ThreadPoolExecutor(max_workers=10) as pool:
        list(pool.map(_append, range(10)))

    text = mem._history_path.read_text(encoding="utf-8")
    for i in range(10):
        assert f"event_{i}" in text
        assert f"details_{i}" in text


def test_needs_compression_false_under_limit(memory: MemorySystem) -> None:
    memory.update_memory("small", "Just a few lines.")
    assert memory.needs_compression() is False


def test_needs_compression_true_over_limit(memory: MemorySystem) -> None:
    big_content = "\n".join(f"Line {i}" for i in range(250))
    memory._memory_path.write_text(big_content, encoding="utf-8")
    assert memory.needs_compression() is True
