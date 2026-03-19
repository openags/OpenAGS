"""Tests for tool protocol, registry, and built-in tools."""

from __future__ import annotations

from pathlib import Path
from typing import Any

import pytest

from openags.agent.tools.base import Tool, ToolRegistry, ToolResult
from openags.research.registry import create_research_registry


# ── Fixtures ───────────────────────────────────────────


class DummyTool:
    """Minimal tool satisfying the Tool protocol."""

    _name = "dummy"
    _description = "A test tool"

    @property
    def name(self) -> str:
        return self._name

    @property
    def description(self) -> str:
        return self._description

    async def invoke(self, **kwargs: Any) -> ToolResult:
        return ToolResult(success=True, data={"echo": kwargs})

    def schema(self) -> dict[str, Any]:
        return {
            "type": "object",
            "properties": {"input": {"type": "string"}},
        }


class AnotherTool:
    _name = "another"
    _description = "Another test tool"

    @property
    def name(self) -> str:
        return self._name

    @property
    def description(self) -> str:
        return self._description

    async def invoke(self, **kwargs: Any) -> ToolResult:
        return ToolResult(success=True)

    def schema(self) -> dict[str, Any]:
        return {"type": "object", "properties": {}}


# ── Protocol tests ─────────────────────────────────────


class TestToolProtocol:
    def test_dummy_satisfies_protocol(self) -> None:
        tool = DummyTool()
        assert isinstance(tool, Tool)

    def test_protocol_attributes(self) -> None:
        tool = DummyTool()
        assert tool.name == "dummy"
        assert tool.description == "A test tool"
        assert isinstance(tool.schema(), dict)

    @pytest.mark.asyncio
    async def test_invoke_returns_tool_result(self) -> None:
        tool = DummyTool()
        result = await tool.invoke(input="hello")
        assert result.success
        assert result.data == {"echo": {"input": "hello"}}


# ── Registry tests ─────────────────────────────────────


class TestToolRegistry:
    def test_register_and_get(self) -> None:
        reg = ToolRegistry()
        tool = DummyTool()
        reg.register(tool)

        assert reg.get("dummy") is tool
        assert reg.get("nonexistent") is None

    def test_list_all(self) -> None:
        reg = ToolRegistry()
        reg.register(DummyTool())
        reg.register(AnotherTool())

        assert len(reg.list_all()) == 2
        assert set(reg.list_names()) == {"dummy", "another"}

    def test_unregister(self) -> None:
        reg = ToolRegistry()
        reg.register(DummyTool())
        reg.unregister("dummy")

        assert reg.get("dummy") is None
        assert len(reg.list_all()) == 0

    def test_overwrite_warning(self) -> None:
        reg = ToolRegistry()
        reg.register(DummyTool())
        reg.register(DummyTool())  # should overwrite without error
        assert len(reg.list_all()) == 1

    def test_to_openai_tools_format(self) -> None:
        reg = ToolRegistry()
        reg.register(DummyTool())

        tools = reg.to_openai_tools()
        assert len(tools) == 1
        assert tools[0]["type"] == "function"
        assert tools[0]["function"]["name"] == "dummy"
        assert "parameters" in tools[0]["function"]

    def test_default_registry_has_builtins(self) -> None:
        reg = create_research_registry(Path("."))
        names = reg.list_names()
        assert "arxiv" in names
        assert "semantic_scholar" in names


# ── ArxivTool unit tests (no network) ──────────────────


class TestArxivTool:
    @pytest.mark.asyncio
    async def test_missing_query_and_id(self) -> None:
        from openags.research.tools.arxiv import ArxivTool

        tool = ArxivTool()
        result = await tool.invoke()
        assert not result.success
        assert "required" in (result.error or "").lower()

    def test_schema_structure(self) -> None:
        from openags.research.tools.arxiv import ArxivTool

        tool = ArxivTool()
        schema = tool.schema()
        assert schema["type"] == "object"
        assert "query" in schema["properties"]
        assert "arxiv_id" in schema["properties"]
        assert "max_results" in schema["properties"]

    def test_arxiv_tool_is_tool(self) -> None:
        from openags.research.tools.arxiv import ArxivTool

        tool = ArxivTool()
        assert isinstance(tool, Tool)
        assert tool.name == "arxiv"


# ── ArxivClient XML parsing tests ──────────────────────


class TestArxivParsing:
    def test_parse_feed(self) -> None:
        from openags.research.tools.arxiv import ArxivClient

        xml_response = """<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns="http://www.w3.org/2005/Atom"
      xmlns:arxiv="http://arxiv.org/schemas/atom">
  <arxiv:totalResults>1</arxiv:totalResults>
  <entry>
    <id>http://arxiv.org/abs/2301.00001v1</id>
    <title>Test Paper Title</title>
    <summary>This is a test abstract.</summary>
    <author><name>Alice Smith</name></author>
    <author><name>Bob Jones</name></author>
    <published>2023-01-01T00:00:00Z</published>
    <updated>2023-01-02T00:00:00Z</updated>
    <category term="cs.AI"/>
    <category term="cs.CL"/>
    <arxiv:doi>10.1234/test</arxiv:doi>
    <link title="pdf" href="http://arxiv.org/pdf/2301.00001v1"/>
    <arxiv:comment>10 pages, 5 figures</arxiv:comment>
  </entry>
</feed>"""

        client = ArxivClient()
        result = client._parse_feed(xml_response, "test")

        assert result.total_results == 1
        assert len(result.papers) == 1

        paper = result.papers[0]
        assert paper.arxiv_id == "2301.00001v1"
        assert paper.title == "Test Paper Title"
        assert paper.authors == ["Alice Smith", "Bob Jones"]
        assert paper.abstract == "This is a test abstract."
        assert paper.doi == "10.1234/test"
        assert paper.pdf_url == "http://arxiv.org/pdf/2301.00001v1"
        assert paper.comment == "10 pages, 5 figures"
        assert "cs.AI" in paper.categories

    def test_parse_empty_feed(self) -> None:
        from openags.research.tools.arxiv import ArxivClient

        xml_response = """<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns="http://www.w3.org/2005/Atom"
      xmlns:arxiv="http://arxiv.org/schemas/atom">
  <arxiv:totalResults>0</arxiv:totalResults>
</feed>"""

        client = ArxivClient()
        result = client._parse_feed(xml_response, "empty")
        assert result.total_results == 0
        assert result.papers == []


# ── SemanticScholarTool unit tests (no network) ────────


class TestSemanticScholarTool:
    @pytest.mark.asyncio
    async def test_search_missing_query(self) -> None:
        from openags.research.tools.semantic_scholar import SemanticScholarTool

        tool = SemanticScholarTool()
        result = await tool.invoke(action="search")
        assert not result.success
        assert "required" in (result.error or "").lower()

    @pytest.mark.asyncio
    async def test_fetch_missing_paper_id(self) -> None:
        from openags.research.tools.semantic_scholar import SemanticScholarTool

        tool = SemanticScholarTool()
        result = await tool.invoke(action="fetch")
        assert not result.success

    @pytest.mark.asyncio
    async def test_unknown_action(self) -> None:
        from openags.research.tools.semantic_scholar import SemanticScholarTool

        tool = SemanticScholarTool()
        result = await tool.invoke(action="unknown_action")
        assert not result.success
        assert "unknown" in (result.error or "").lower()

    def test_schema_structure(self) -> None:
        from openags.research.tools.semantic_scholar import SemanticScholarTool

        tool = SemanticScholarTool()
        schema = tool.schema()
        assert schema["type"] == "object"
        assert "action" in schema["properties"]
        assert "query" in schema["properties"]
        assert "paper_id" in schema["properties"]

    def test_s2_tool_is_tool(self) -> None:
        from openags.research.tools.semantic_scholar import SemanticScholarTool

        tool = SemanticScholarTool()
        assert isinstance(tool, Tool)
        assert tool.name == "semantic_scholar"


# ── S2 JSON parsing tests ─────────────────────────────


class TestS2Parsing:
    def test_parse_paper(self) -> None:
        from openags.research.tools.semantic_scholar import SemanticScholarClient

        raw = {
            "paperId": "abc123",
            "title": "Attention Is All You Need",
            "abstract": "We propose a new architecture...",
            "authors": [
                {"name": "Ashish Vaswani"},
                {"name": "Noam Shazeer"},
            ],
            "year": 2017,
            "citationCount": 90000,
            "referenceCount": 40,
            "venue": "NeurIPS",
            "externalIds": {"DOI": "10.5555/3295222.3295349", "ArXiv": "1706.03762"},
            "url": "https://www.semanticscholar.org/paper/abc123",
        }

        paper = SemanticScholarClient._parse_paper(raw)
        assert paper.paper_id == "abc123"
        assert paper.title == "Attention Is All You Need"
        assert len(paper.authors) == 2
        assert paper.year == 2017
        assert paper.citation_count == 90000
        assert paper.doi == "10.5555/3295222.3295349"
        assert paper.arxiv_id == "1706.03762"

    def test_parse_paper_minimal(self) -> None:
        from openags.research.tools.semantic_scholar import SemanticScholarClient

        raw = {"paperId": "xyz", "title": "Some Paper"}
        paper = SemanticScholarClient._parse_paper(raw)
        assert paper.paper_id == "xyz"
        assert paper.title == "Some Paper"
        assert paper.authors == []
        assert paper.citation_count == 0


# ── CitationVerifier unit tests ────────────────────────


class TestCitationVerifier:
    def test_title_similarity(self) -> None:
        from openags.research.tools.citation_verify import CitationVerifier

        sim = CitationVerifier._title_similarity(
            "Attention Is All You Need",
            "Attention Is All You Need",
        )
        assert sim == 1.0

    def test_title_similarity_partial(self) -> None:
        from openags.research.tools.citation_verify import CitationVerifier

        sim = CitationVerifier._title_similarity(
            "Attention Is All You Need",
            "Attention Is Not What You Need",
        )
        assert 0.4 < sim < 0.9

    def test_title_similarity_empty(self) -> None:
        from openags.research.tools.citation_verify import CitationVerifier

        assert CitationVerifier._title_similarity("", "something") == 0.0
        assert CitationVerifier._title_similarity("something", "") == 0.0

    def test_tool_result_model(self) -> None:
        r = ToolResult(success=True, data={"key": "value"})
        assert r.success
        assert r.data == {"key": "value"}
        assert r.error is None

    def test_tool_result_error(self) -> None:
        r = ToolResult(success=False, error="something broke")
        assert not r.success
        assert r.error == "something broke"
