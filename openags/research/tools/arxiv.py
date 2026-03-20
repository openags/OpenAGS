"""arXiv search tool — built-in literature search via arXiv API.

Uses the Atom feed API (no extra dependencies needed).
Docs: https://info.arxiv.org/help/api/basics.html
"""

from __future__ import annotations

import logging
import xml.etree.ElementTree as ET
from typing import Any

import httpx
from pydantic import BaseModel

from openags.agent.tools.base import ToolResult

logger = logging.getLogger(__name__)

ARXIV_API = "https://export.arxiv.org/api/query"
ATOM_NS = "{http://www.w3.org/2005/Atom}"
ARXIV_NS = "{http://arxiv.org/schemas/atom}"


# ── Data models ────────────────────────────────────────


class ArxivPaper(BaseModel):
    arxiv_id: str
    title: str
    authors: list[str] = []
    abstract: str = ""
    published: str = ""
    updated: str = ""
    categories: list[str] = []
    doi: str | None = None
    pdf_url: str = ""
    comment: str | None = None


class ArxivSearchResult(BaseModel):
    papers: list[ArxivPaper] = []
    total_results: int = 0
    query: str = ""


# ── Low-level client ───────────────────────────────────


class ArxivClient:
    """Thin async wrapper around arXiv Atom API."""

    def __init__(self, timeout: int = 30) -> None:
        self._timeout = timeout

    async def search(
        self,
        query: str,
        max_results: int = 10,
        sort_by: str = "relevance",
        sort_order: str = "descending",
        start: int = 0,
    ) -> ArxivSearchResult:
        """Search arXiv papers by query string."""
        params = {
            "search_query": f"all:{query}",
            "start": str(start),
            "max_results": str(min(max_results, 50)),
            "sortBy": sort_by,
            "sortOrder": sort_order,
        }

        async with httpx.AsyncClient(timeout=self._timeout) as client:
            resp = await client.get(ARXIV_API, params=params)
            resp.raise_for_status()

        return self._parse_feed(resp.text, query)

    async def fetch_by_id(self, arxiv_id: str) -> ArxivPaper | None:
        """Fetch a single paper by arXiv ID (e.g. '2301.00001')."""
        clean_id = arxiv_id.replace("arXiv:", "").strip()
        params = {"id_list": clean_id}

        async with httpx.AsyncClient(timeout=self._timeout) as client:
            resp = await client.get(ARXIV_API, params=params)
            resp.raise_for_status()

        result = self._parse_feed(resp.text, clean_id)
        return result.papers[0] if result.papers else None

    def _parse_feed(self, xml_text: str, query: str) -> ArxivSearchResult:
        root = ET.fromstring(xml_text)

        total_el = root.find(f"{ARXIV_NS}totalResults")
        total = int(total_el.text) if total_el is not None and total_el.text else 0

        papers: list[ArxivPaper] = []
        for entry in root.findall(f"{ATOM_NS}entry"):
            paper = self._parse_entry(entry)
            if paper:
                papers.append(paper)

        return ArxivSearchResult(papers=papers, total_results=total, query=query)

    @staticmethod
    def _parse_entry(entry: ET.Element) -> ArxivPaper | None:
        id_el = entry.find(f"{ATOM_NS}id")
        title_el = entry.find(f"{ATOM_NS}title")
        if id_el is None or title_el is None:
            return None

        raw_id = (id_el.text or "").strip()
        arxiv_id = raw_id.rsplit("/", 1)[-1] if "/" in raw_id else raw_id

        authors = [
            (a.find(f"{ATOM_NS}name").text or "").strip()
            for a in entry.findall(f"{ATOM_NS}author")
            if a.find(f"{ATOM_NS}name") is not None
        ]

        abstract_el = entry.find(f"{ATOM_NS}summary")
        abstract = (abstract_el.text or "").strip() if abstract_el is not None else ""

        published_el = entry.find(f"{ATOM_NS}published")
        published = (published_el.text or "") if published_el is not None else ""

        updated_el = entry.find(f"{ATOM_NS}updated")
        updated = (updated_el.text or "") if updated_el is not None else ""

        categories = [
            c.get("term", "") for c in entry.findall(f"{ATOM_NS}category") if c.get("term")
        ]

        doi_el = entry.find(f"{ARXIV_NS}doi")
        doi = (doi_el.text or "").strip() if doi_el is not None else None

        pdf_url = ""
        for link in entry.findall(f"{ATOM_NS}link"):
            if link.get("title") == "pdf":
                pdf_url = link.get("href", "")
                break

        comment_el = entry.find(f"{ARXIV_NS}comment")
        comment = (comment_el.text or "").strip() if comment_el is not None else None

        return ArxivPaper(
            arxiv_id=arxiv_id,
            title=" ".join((title_el.text or "").split()),
            authors=authors,
            abstract=" ".join(abstract.split()),
            published=published,
            updated=updated,
            categories=categories,
            doi=doi,
            pdf_url=pdf_url,
            comment=comment,
        )


# ── Tool interface ─────────────────────────────────────


class ArxivTool:
    """arXiv search as an OpenAGS Tool (satisfies Tool protocol)."""

    _name = "arxiv"
    _description = (
        "Search academic papers on arXiv by query, returning titles, abstracts, and metadata."
    )

    def __init__(self, timeout: int = 30) -> None:
        self._client = ArxivClient(timeout=timeout)

    @property
    def name(self) -> str:
        return self._name

    @property
    def description(self) -> str:
        return self._description

    async def invoke(self, **kwargs: Any) -> ToolResult:
        query = kwargs.get("query", "")
        max_results = int(kwargs.get("max_results", 10))
        arxiv_id = kwargs.get("arxiv_id")

        if not query and not arxiv_id:
            return ToolResult(success=False, error="Either 'query' or 'arxiv_id' is required.")

        try:
            if arxiv_id:
                paper = await self._client.fetch_by_id(arxiv_id)
                if paper is None:
                    return ToolResult(success=False, error=f"arXiv ID '{arxiv_id}' not found.")
                return ToolResult(success=True, data=paper.model_dump())

            result = await self._client.search(query, max_results=max_results)
            return ToolResult(
                success=True,
                data={
                    "papers": [p.model_dump() for p in result.papers],
                    "total_results": result.total_results,
                    "query": result.query,
                },
                metadata={"source": "arxiv", "count": len(result.papers)},
            )
        except httpx.HTTPStatusError as e:
            return ToolResult(success=False, error=f"arXiv API error: {e.response.status_code}")
        except Exception as e:
            logger.error("ArxivTool error: %s", e)
            return ToolResult(success=False, error=str(e))

    def schema(self) -> dict[str, Any]:
        return {
            "type": "object",
            "properties": {
                "query": {
                    "type": "string",
                    "description": "Search query (e.g. 'transformer attention mechanism')",
                },
                "max_results": {
                    "type": "integer",
                    "description": "Max papers to return (1-50, default 10)",
                    "default": 10,
                },
                "arxiv_id": {
                    "type": "string",
                    "description": "Fetch a specific paper by arXiv ID (e.g. '2301.00001')",
                },
            },
            "required": [],
        }
