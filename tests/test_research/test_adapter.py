"""Tests for the runtime adapter — SOUL.md → CLAUDE.md conversion."""

from __future__ import annotations

from pathlib import Path

from openags.research.adapter import (
    generate_claude_md,
    generate_agents_md,
    prepare_folder_for_cli,
    _build_combined_prompt,
    _read_skills,
    _read_soul,
)


def _make_folder(tmp_path: Path) -> Path:
    """Create a test folder with SOUL.md, skills, and memory."""
    folder = tmp_path / "literature"
    folder.mkdir()

    # SOUL.md
    (folder / "SOUL.md").write_text(
        "---\n"
        "name: literature\n"
        "description: Literature review agent\n"
        "tools: [arxiv, read, write]\n"
        "---\n\n"
        "You are a **literature review specialist**.\n"
        "Search for papers and write comprehensive reviews.\n",
        encoding="utf-8",
    )

    # Skills
    skills_dir = folder / "skills"
    skills_dir.mkdir()
    (skills_dir / "search.md").write_text(
        "---\n"
        "name: search_arxiv\n"
        "triggers: [search, find papers]\n"
        "---\n\n"
        "When searching for papers, always include:\n"
        "- Year range\n"
        "- Key authors\n",
        encoding="utf-8",
    )

    # Memory
    (folder / "memory.md").write_text(
        "<!-- section:status -->\n"
        "Found 5 papers on transformers.\n"
        "<!-- /section:status -->\n",
        encoding="utf-8",
    )

    return folder


class TestReadSoul:
    def test_reads_body(self, tmp_path: Path) -> None:
        folder = _make_folder(tmp_path)
        body = _read_soul(folder)
        assert "literature review specialist" in body

    def test_missing_soul(self, tmp_path: Path) -> None:
        folder = tmp_path / "empty"
        folder.mkdir()
        assert _read_soul(folder) == ""


class TestReadSkills:
    def test_reads_skill_bodies(self, tmp_path: Path) -> None:
        folder = _make_folder(tmp_path)
        skills = _read_skills(folder)
        assert len(skills) == 1
        assert "Year range" in skills[0]
        # Frontmatter should be stripped
        assert "triggers" not in skills[0]

    def test_no_skills_dir(self, tmp_path: Path) -> None:
        folder = tmp_path / "empty"
        folder.mkdir()
        assert _read_skills(folder) == []


class TestBuildCombinedPrompt:
    def test_combines_all_sources(self, tmp_path: Path) -> None:
        folder = _make_folder(tmp_path)
        prompt = _build_combined_prompt(folder)

        assert "literature review specialist" in prompt  # SOUL.md
        assert "Year range" in prompt  # skills
        assert "Found 5 papers" in prompt  # memory


class TestGenerateClaudeMd:
    def test_creates_file(self, tmp_path: Path) -> None:
        folder = _make_folder(tmp_path)
        path = generate_claude_md(folder)

        assert path == folder / "CLAUDE.md"
        assert path.exists()

        content = path.read_text(encoding="utf-8")
        assert "literature review specialist" in content
        assert "Year range" in content
        assert "Found 5 papers" in content

    def test_empty_folder(self, tmp_path: Path) -> None:
        folder = tmp_path / "empty"
        folder.mkdir()
        path = generate_claude_md(folder)

        assert path.exists()
        content = path.read_text(encoding="utf-8")
        assert "empty" in content  # fallback mentions folder name


class TestGenerateAgentsMd:
    def test_creates_file(self, tmp_path: Path) -> None:
        folder = _make_folder(tmp_path)
        path = generate_agents_md(folder)

        assert path == folder / "AGENTS.md"
        assert path.exists()
        assert "literature review specialist" in path.read_text(encoding="utf-8")


class TestPrepareFolder:
    def test_claude_code(self, tmp_path: Path) -> None:
        folder = _make_folder(tmp_path)
        path = prepare_folder_for_cli(folder, "claude_code")
        assert path is not None
        assert path.name == "CLAUDE.md"

    def test_codex(self, tmp_path: Path) -> None:
        folder = _make_folder(tmp_path)
        path = prepare_folder_for_cli(folder, "codex")
        assert path is not None
        assert path.name == "AGENTS.md"

    def test_unknown_runtime(self, tmp_path: Path) -> None:
        folder = _make_folder(tmp_path)
        result = prepare_folder_for_cli(folder, "unknown_cli")
        assert result is None
