"""Tests for skill engine and SOUL.md loading."""

from __future__ import annotations

from pathlib import Path

import pytest

from openags.agent.skills.engine import SkillEngine


# ── Fixtures ───────────────────────────────────────────


@pytest.fixture
def skill_dir(tmp_path: Path) -> Path:
    """Create a temp directory with sample skills."""
    d = tmp_path / "skills"
    d.mkdir()

    # Valid skill
    (d / "search_papers.md").write_text(
        "---\n"
        "name: search_papers\n"
        "description: Search for papers\n"
        "roles: [literature, coordinator]\n"
        "tools: [arxiv]\n"
        "triggers: [\"search papers\", \"find papers\"]\n"
        "version: \"1.0.0\"\n"
        "---\n"
        "## Instructions\nUse arxiv tool to search.\n"
    )

    # Another valid skill
    (d / "verify_refs.md").write_text(
        "---\n"
        "name: verify_refs\n"
        "description: Verify references\n"
        "roles: [reference, reviewer]\n"
        "tools: [semantic_scholar]\n"
        "triggers: [\"verify\", \"check references\", \"always\"]\n"
        "version: \"1.0.0\"\n"
        "---\n"
        "## Verification steps\nCheck each citation.\n"
    )

    # Invalid file (no frontmatter)
    (d / "readme.md").write_text("# This is just a readme\nNot a skill.")

    return d


@pytest.fixture
def engine(skill_dir: Path) -> SkillEngine:
    return SkillEngine(skill_dirs=[skill_dir])


# ── Loading tests ──────────────────────────────────────


class TestSkillLoading:
    def test_loads_valid_skills(self, engine: SkillEngine) -> None:
        assert engine.count() == 2

    def test_ignores_invalid_files(self, engine: SkillEngine) -> None:
        # readme.md has no frontmatter, should be skipped
        assert engine.get("readme") is None

    def test_get_by_name(self, engine: SkillEngine) -> None:
        skill = engine.get("search_papers")
        assert skill is not None
        assert skill.name == "search_papers"
        assert skill.description == "Search for papers"

    def test_get_content(self, engine: SkillEngine) -> None:
        content = engine.get_content("search_papers")
        assert content is not None
        assert "arxiv tool" in content

    def test_get_all(self, engine: SkillEngine) -> None:
        all_skills = engine.get_all()
        assert len(all_skills) == 2
        names = {s.name for s in all_skills}
        assert names == {"search_papers", "verify_refs"}

    def test_empty_dirs(self) -> None:
        engine = SkillEngine(skill_dirs=[])
        assert engine.count() == 0

    def test_nonexistent_dir(self, tmp_path: Path) -> None:
        engine = SkillEngine(skill_dirs=[tmp_path / "nonexistent"])
        assert engine.count() == 0


class TestSkillParsing:
    def test_parse_metadata(self, engine: SkillEngine) -> None:
        skill = engine.get("search_papers")
        assert skill is not None
        assert "literature" in skill.roles
        assert "coordinator" in skill.roles
        assert "arxiv" in skill.tools
        assert skill.version == "1.0.0"

    def test_parse_triggers(self, engine: SkillEngine) -> None:
        skill = engine.get("search_papers")
        assert skill is not None
        assert "search papers" in skill.triggers
        assert "find papers" in skill.triggers

    def test_source_path_set(self, engine: SkillEngine, skill_dir: Path) -> None:
        skill = engine.get("search_papers")
        assert skill is not None
        assert skill.source_path is not None
        assert skill.source_path.name == "search_papers.md"


class TestLoadSingle:
    def test_load_single_valid(self, tmp_path: Path) -> None:
        skill_file = tmp_path / "my_skill.md"
        skill_file.write_text(
            "---\n"
            "name: my_skill\n"
            "description: A test skill\n"
            "roles: [literature]\n"
            "---\n"
            "Body text\n"
        )

        engine = SkillEngine()
        meta = engine.load_single(skill_file)
        assert meta is not None
        assert meta.name == "my_skill"
        assert engine.count() == 1

    def test_load_single_invalid(self, tmp_path: Path) -> None:
        bad_file = tmp_path / "bad.md"
        bad_file.write_text("No frontmatter here")

        engine = SkillEngine()
        meta = engine.load_single(bad_file)
        assert meta is None
        assert engine.count() == 0


# ── Query tests ────────────────────────────────────────


class TestSkillQuery:
    def test_get_for_role(self, engine: SkillEngine) -> None:
        lit_skills = engine.get_for_role("literature")
        assert len(lit_skills) == 1
        assert lit_skills[0].name == "search_papers"

    def test_get_for_role_reviewer(self, engine: SkillEngine) -> None:
        rev_skills = engine.get_for_role("reviewer")
        assert len(rev_skills) == 1
        assert rev_skills[0].name == "verify_refs"

    def test_get_for_role_no_match(self, engine: SkillEngine) -> None:
        exp_skills = engine.get_for_role("experimenter")
        assert exp_skills == []

    def test_match_trigger(self, engine: SkillEngine) -> None:
        matched = engine.match_trigger("I want to search papers about transformers")
        assert len(matched) == 1
        assert matched[0].name == "search_papers"

    def test_match_trigger_multiple(self, engine: SkillEngine) -> None:
        # "verify" matches verify_refs, "find papers" matches search_papers
        matched = engine.match_trigger("verify and find papers")
        names = {m.name for m in matched}
        assert names == {"search_papers", "verify_refs"}

    def test_match_trigger_no_match(self, engine: SkillEngine) -> None:
        matched = engine.match_trigger("run experiment with GPU")
        assert matched == []

    def test_match_trigger_case_insensitive(self, engine: SkillEngine) -> None:
        matched = engine.match_trigger("SEARCH PAPERS about AI")
        assert len(matched) == 1

    def test_get_always_skills(self, engine: SkillEngine) -> None:
        # verify_refs has "always" trigger and role=reviewer
        always = engine.get_always_skills("reviewer")
        assert len(always) == 1
        assert always[0].name == "verify_refs"

    def test_get_always_skills_no_match(self, engine: SkillEngine) -> None:
        # literature has no "always" skills
        always = engine.get_always_skills("literature")
        assert always == []


# ── Prompt injection tests ─────────────────────────────


class TestPromptInjection:
    def test_build_prompt_with_trigger(self, engine: SkillEngine) -> None:
        prompt = engine.build_prompt_injection(
            "literature",
            "search papers about transformers",
        )
        assert "search_papers" in prompt
        assert "arxiv tool" in prompt

    def test_build_prompt_empty(self, engine: SkillEngine) -> None:
        prompt = engine.build_prompt_injection("experimenter")
        assert prompt == ""

    def test_build_prompt_always_skills(self, engine: SkillEngine) -> None:
        prompt = engine.build_prompt_injection("reviewer")
        assert "verify_refs" in prompt
        assert "Verification steps" in prompt

    def test_build_prompt_no_duplicates(self, engine: SkillEngine) -> None:
        # verify_refs should appear only once even if matched by trigger + always
        prompt = engine.build_prompt_injection(
            "reviewer",
            "verify citations please",
        )
        count = prompt.count("verify_refs")
        assert count == 1


# ── Management tests ───────────────────────────────────


class TestSkillManagement:
    def test_remove_skill(self, engine: SkillEngine) -> None:
        assert engine.remove("search_papers")
        assert engine.get("search_papers") is None
        assert engine.get_content("search_papers") is None
        assert engine.count() == 1

    def test_remove_nonexistent(self, engine: SkillEngine) -> None:
        assert not engine.remove("nonexistent")
        assert engine.count() == 2


# ── SOUL.md loading tests ──────────────────────────────


class TestSOULTemplates:
    """Test that the project's SOUL.md files exist and are loadable."""

    @pytest.fixture
    def soul_dir(self) -> Path:
        return Path(__file__).parent.parent.parent / "skills" / "agents"

    @pytest.mark.parametrize("role", [
        "literature", "coordinator", "proposer",
        "experimenter", "writer", "reviewer", "reference",
    ])
    def test_soul_exists(self, soul_dir: Path, role: str) -> None:
        soul_path = soul_dir / role / "SOUL.md"
        assert soul_path.exists(), f"Missing SOUL.md for {role}"
        content = soul_path.read_text()
        assert len(content) > 100
        assert "{{role}}" in content
        assert "{{max_steps}}" in content

    @pytest.mark.parametrize("role", [
        "literature", "coordinator", "proposer",
        "experimenter", "writer", "reviewer", "reference",
    ])
    def test_soul_has_capabilities(self, soul_dir: Path, role: str) -> None:
        content = (soul_dir / role / "SOUL.md").read_text()
        assert "##" in content  # has at least one section header


# ── Core skill loading tests ───────────────────────────


class TestCoreSkills:
    @pytest.fixture
    def skills_dir(self) -> Path:
        return Path(__file__).parent.parent.parent / "skills"

    def test_core_skills_loadable(self, skills_dir: Path) -> None:
        engine = SkillEngine(skill_dirs=[skills_dir])
        assert engine.count() >= 2

    def test_search_papers_skill(self, skills_dir: Path) -> None:
        engine = SkillEngine(skill_dirs=[skills_dir])
        skill = engine.get("search-papers")
        assert skill is not None
        assert "literature" in skill.roles

    def test_verify_citations_skill(self, skills_dir: Path) -> None:
        engine = SkillEngine(skill_dirs=[skills_dir])
        skill = engine.get("verify-citations")
        assert skill is not None
        assert "reviewer" in skill.roles
