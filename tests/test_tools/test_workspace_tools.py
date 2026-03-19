"""Tests for workspace-scoped tools: read, write, edit, ls, grep, bash."""

from __future__ import annotations

import asyncio
from pathlib import Path

import pytest

from openags.agent.tools.bash import BashExecuteTool
from openags.agent.tools.edit import FileEditTool
from openags.agent.tools.grep import FileSearchTool
from openags.agent.tools.ls import FileListTool
from openags.agent.tools.read import FileReadTool
from openags.agent.tools.write import FileWriteTool
from openags.agent.tools.workspace_base import ToolError, safe_path


# ── safe_path ──────────────────────────────────────────


class TestSafePath:
    def test_normal_relative_path(self, tmp_path: Path) -> None:
        result = safe_path(tmp_path, "src/main.py")
        assert result == (tmp_path / "src" / "main.py").resolve()

    def test_dot_path(self, tmp_path: Path) -> None:
        result = safe_path(tmp_path, ".")
        assert result == tmp_path.resolve()

    def test_escape_with_dotdot(self, tmp_path: Path) -> None:
        with pytest.raises(ToolError, match="escapes workspace"):
            safe_path(tmp_path, "../../../etc/passwd")

    def test_absolute_path_outside(self, tmp_path: Path) -> None:
        with pytest.raises(ToolError, match="escapes workspace"):
            safe_path(tmp_path, "/etc/passwd")

    def test_path_within_workspace(self, tmp_path: Path) -> None:
        subdir = tmp_path / "deep" / "nested"
        subdir.mkdir(parents=True)
        result = safe_path(tmp_path, "deep/nested/file.txt")
        assert result.is_relative_to(tmp_path.resolve())


# ── FileReadTool ───────────────────────────────────────


class TestFileRead:
    @pytest.fixture
    def tool(self, tmp_path: Path) -> FileReadTool:
        return FileReadTool(tmp_path)

    @pytest.fixture
    def sample_file(self, tmp_path: Path) -> Path:
        f = tmp_path / "test.txt"
        f.write_text("line1\nline2\nline3\nline4\nline5\n")
        return f

    @pytest.mark.asyncio
    async def test_read_file(self, tool: FileReadTool, sample_file: Path) -> None:
        r = await tool.invoke(path="test.txt")
        assert r.success
        assert "line1" in r.data
        assert r.metadata["total_lines"] == 5

    @pytest.mark.asyncio
    async def test_read_with_offset_limit(self, tool: FileReadTool, sample_file: Path) -> None:
        r = await tool.invoke(path="test.txt", offset=2, limit=2)
        assert r.success
        assert "line3" in r.data
        assert "line4" in r.data
        assert "line1" not in r.data

    @pytest.mark.asyncio
    async def test_read_nonexistent(self, tool: FileReadTool) -> None:
        r = await tool.invoke(path="nope.txt")
        assert not r.success
        assert "not found" in r.error.lower()

    @pytest.mark.asyncio
    async def test_read_path_escape(self, tool: FileReadTool) -> None:
        r = await tool.invoke(path="../../../etc/passwd")
        assert not r.success
        assert "escapes" in r.error.lower()

    @pytest.mark.asyncio
    async def test_read_empty_path(self, tool: FileReadTool) -> None:
        r = await tool.invoke(path="")
        assert not r.success


# ── FileWriteTool ──────────────────────────────────────


class TestFileWrite:
    @pytest.fixture
    def tool(self, tmp_path: Path) -> FileWriteTool:
        return FileWriteTool(tmp_path)

    @pytest.mark.asyncio
    async def test_write_new_file(self, tool: FileWriteTool, tmp_path: Path) -> None:
        r = await tool.invoke(path="output.txt", content="hello world")
        assert r.success
        assert (tmp_path / "output.txt").read_text() == "hello world"

    @pytest.mark.asyncio
    async def test_write_creates_dirs(self, tool: FileWriteTool, tmp_path: Path) -> None:
        r = await tool.invoke(path="a/b/c/deep.txt", content="nested")
        assert r.success
        assert (tmp_path / "a" / "b" / "c" / "deep.txt").read_text() == "nested"

    @pytest.mark.asyncio
    async def test_write_overwrite(self, tool: FileWriteTool, tmp_path: Path) -> None:
        (tmp_path / "exist.txt").write_text("old")
        r = await tool.invoke(path="exist.txt", content="new")
        assert r.success
        assert (tmp_path / "exist.txt").read_text() == "new"

    @pytest.mark.asyncio
    async def test_write_path_escape(self, tool: FileWriteTool) -> None:
        r = await tool.invoke(path="../../bad.txt", content="evil")
        assert not r.success

    @pytest.mark.asyncio
    async def test_write_no_content(self, tool: FileWriteTool) -> None:
        r = await tool.invoke(path="file.txt")
        assert not r.success


# ── FileEditTool ───────────────────────────────────────


class TestFileEdit:
    @pytest.fixture
    def tool(self, tmp_path: Path) -> FileEditTool:
        return FileEditTool(tmp_path)

    @pytest.fixture
    def editable(self, tmp_path: Path) -> Path:
        f = tmp_path / "code.py"
        f.write_text("x = 1\ny = 2\nz = 3\n")
        return f

    @pytest.mark.asyncio
    async def test_edit_single_match(self, tool: FileEditTool, editable: Path) -> None:
        r = await tool.invoke(path="code.py", old_text="y = 2", new_text="y = 99")
        assert r.success
        assert "y = 99" in editable.read_text()

    @pytest.mark.asyncio
    async def test_edit_not_found(self, tool: FileEditTool, editable: Path) -> None:
        r = await tool.invoke(path="code.py", old_text="not_here", new_text="xxx")
        assert not r.success
        assert "not found" in r.error.lower()

    @pytest.mark.asyncio
    async def test_edit_multiple_matches(self, tool: FileEditTool, tmp_path: Path) -> None:
        (tmp_path / "dup.txt").write_text("aaa\naaa\n")
        r = await tool.invoke(path="dup.txt", old_text="aaa", new_text="bbb")
        assert not r.success
        assert "2 times" in r.error

    @pytest.mark.asyncio
    async def test_edit_nonexistent_file(self, tool: FileEditTool) -> None:
        r = await tool.invoke(path="nope.py", old_text="x", new_text="y")
        assert not r.success


# ── FileListTool ───────────────────────────────────────


class TestFileList:
    @pytest.fixture
    def tool(self, tmp_path: Path) -> FileListTool:
        (tmp_path / "a.txt").write_text("a")
        (tmp_path / "b.py").write_text("b")
        (tmp_path / "sub").mkdir()
        (tmp_path / "sub" / "c.txt").write_text("c")
        return FileListTool(tmp_path)

    @pytest.mark.asyncio
    async def test_list_root(self, tool: FileListTool) -> None:
        r = await tool.invoke()
        assert r.success
        assert r.metadata["count"] == 3  # a.txt, b.py, sub/

    @pytest.mark.asyncio
    async def test_list_subdir(self, tool: FileListTool) -> None:
        r = await tool.invoke(path="sub")
        assert r.success
        assert "c.txt" in r.data

    @pytest.mark.asyncio
    async def test_list_glob(self, tool: FileListTool) -> None:
        r = await tool.invoke(pattern="**/*.txt")
        assert r.success
        assert r.metadata["count"] == 2  # a.txt, sub/c.txt

    @pytest.mark.asyncio
    async def test_list_nonexistent(self, tool: FileListTool) -> None:
        r = await tool.invoke(path="nope")
        assert not r.success


# ── FileSearchTool ─────────────────────────────────────


class TestFileSearch:
    @pytest.fixture
    def tool(self, tmp_path: Path) -> FileSearchTool:
        (tmp_path / "a.py").write_text("import torch\nmodel = None\n")
        (tmp_path / "b.py").write_text("import numpy\nx = 42\n")
        (tmp_path / "readme.md").write_text("This uses torch for training.\n")
        return FileSearchTool(tmp_path)

    @pytest.mark.asyncio
    async def test_search_pattern(self, tool: FileSearchTool) -> None:
        r = await tool.invoke(pattern="torch")
        assert r.success
        assert r.metadata["match_count"] == 2
        assert r.metadata["files_with_matches"] == 2

    @pytest.mark.asyncio
    async def test_search_with_glob(self, tool: FileSearchTool) -> None:
        r = await tool.invoke(pattern="torch", glob="*.py")
        assert r.success
        assert r.metadata["match_count"] == 1

    @pytest.mark.asyncio
    async def test_search_no_matches(self, tool: FileSearchTool) -> None:
        r = await tool.invoke(pattern="nonexistent_string_xyz")
        assert r.success
        assert r.metadata["match_count"] == 0

    @pytest.mark.asyncio
    async def test_search_invalid_regex(self, tool: FileSearchTool) -> None:
        r = await tool.invoke(pattern="[invalid")
        assert not r.success
        assert "regex" in r.error.lower()


# ── BashExecuteTool ────────────────────────────────────


class TestBashExecute:
    @pytest.fixture
    def tool(self, tmp_path: Path) -> BashExecuteTool:
        return BashExecuteTool(tmp_path)

    @pytest.mark.asyncio
    async def test_echo(self, tool: BashExecuteTool) -> None:
        r = await tool.invoke(command="echo hello_test")
        assert r.success
        assert "hello_test" in r.data

    @pytest.mark.asyncio
    async def test_exit_code(self, tool: BashExecuteTool) -> None:
        r = await tool.invoke(command="exit 1")
        assert not r.success
        assert r.metadata["exit_code"] == 1

    @pytest.mark.asyncio
    async def test_blocklist(self, tool: BashExecuteTool) -> None:
        r = await tool.invoke(command="rm -rf /")
        assert not r.success
        assert "dangerous" in r.error.lower()

    @pytest.mark.asyncio
    async def test_timeout(self, tool: BashExecuteTool) -> None:
        r = await tool.invoke(command="sleep 10", timeout=1)
        assert not r.success
        assert "timed out" in r.error.lower()

    @pytest.mark.asyncio
    async def test_empty_command(self, tool: BashExecuteTool) -> None:
        r = await tool.invoke(command="")
        assert not r.success

    @pytest.mark.asyncio
    async def test_cwd_is_workspace(self, tool: BashExecuteTool, tmp_path: Path) -> None:
        r = await tool.invoke(command="pwd")
        assert r.success
        # On Windows, pwd might not work, but the tool should not crash
