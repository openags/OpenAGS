"""Tests for the WebFetch tool."""

from __future__ import annotations

import pytest

from openags.agent.tools.fetch import WebFetchTool, _extract_text


class TestHTMLExtraction:
    def test_basic_text(self) -> None:
        html = "<html><body><p>Hello world</p></body></html>"
        assert "Hello world" in _extract_text(html)

    def test_strips_scripts(self) -> None:
        html = "<html><body><p>Content</p><script>alert('x')</script></body></html>"
        text = _extract_text(html)
        assert "Content" in text
        assert "alert" not in text

    def test_strips_styles(self) -> None:
        html = "<html><head><style>body{color:red}</style></head><body><p>Text</p></body></html>"
        text = _extract_text(html)
        assert "Text" in text
        assert "color" not in text

    def test_strips_nav(self) -> None:
        html = "<html><body><nav>Menu items</nav><main><p>Main content</p></main></body></html>"
        text = _extract_text(html)
        assert "Main content" in text
        assert "Menu items" not in text


class TestWebFetchTool:
    @pytest.fixture
    def tool(self) -> WebFetchTool:
        return WebFetchTool()

    def test_name(self, tool: WebFetchTool) -> None:
        assert tool.name == "fetch"

    def test_schema(self, tool: WebFetchTool) -> None:
        schema = tool.schema()
        assert "url" in schema["properties"]
        assert "url" in schema["required"]

    @pytest.mark.asyncio
    async def test_missing_url(self, tool: WebFetchTool) -> None:
        result = await tool.invoke()
        assert not result.success
        assert "required" in (result.error or "")

    @pytest.mark.asyncio
    async def test_invalid_url(self, tool: WebFetchTool) -> None:
        result = await tool.invoke(url="not-a-url")
        assert not result.success
        assert "http" in (result.error or "")

    @pytest.mark.asyncio
    async def test_unreachable(self, tool: WebFetchTool) -> None:
        result = await tool.invoke(url="http://localhost:1")
        assert not result.success
