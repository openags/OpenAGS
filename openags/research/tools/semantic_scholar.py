"""Semantic Scholar search tool — academic paper search via S2 API.

Uses the free Semantic Scholar Academic Graph API.
Docs: https://api.semanticscholar.org/api-docs/
"""

from __future__ import annotations

import logging
from typing import Any

import httpx
from pydantic import BaseModel

from openags.agent.tools.base import ToolResult

logger = logging.getLogger(__name__)

S2_API = "https://api.semanticscholar.org/graph/v1"
S2_FIELDS = "paperId,title,abstract,authors,year,citationCount,referenceCount,venue,externalIds,url"


# ── Data models ────────────────────────────────────────


class S2Paper(BaseModel):
    paper_id: str
    title: str
    abstract: str | None = None
    authors: list[str] = []
    year: int | None = None
    citation_count: int = 0
    reference_count: int = 0
    venue: str | None = None
    doi: str | None = None
    arxiv_id: str | None = None
    url: str = ""


class S2SearchResult(BaseModel):
    papers: list[S2Paper] = []
    total: int = 0
    query: str = ""


# ── Low-level client ───────────────────────────────────


class SemanticScholarClient:
    """Thin async wrapper around Semantic Scholar API."""

    def __init__(self, api_key: str | None = None, timeout: int = 30) -> None:
        self._api_key = api_key
        self._timeout = timeout

    def _headers(self) -> dict[str, str]:
        h: dict[str, str] = {"Accept": "application/json"}
        if self._api_key:
            h["x-api-key"] = self._api_key
        return h

    async def search(
        self,
        query: str,
        max_results: int = 10,
        year: str | None = None,
        fields_of_study: list[str] | None = None,
    ) -> S2SearchResult:
        """Keyword search for papers."""
        params: dict[str, str] = {
            "query": query,
            "limit": str(min(max_results, 100)),
            "fields": S2_FIELDS,
        }
        if year:
            params["year"] = year
        if fields_of_study:
            params["fieldsOfStudy"] = ",".join(fields_of_study)

        async with httpx.AsyncClient(timeout=self._timeout) as client:
            resp = await client.get(
                f"{S2_API}/paper/search",
                params=params,
                headers=self._headers(),
            )
            resp.raise_for_status()

        data = resp.json()
        papers = [self._parse_paper(p) for p in data.get("data", [])]
        return S2SearchResult(
            papers=papers,
            total=data.get("total", len(papers)),
            query=query,
        )

    async def search_by_title(self, title: str) -> S2Paper | None:
        """Search by exact title — returns best match or None."""
        result = await self.search(title, max_results=3)
        if not result.papers:
            return None
        return result.papers[0]

    async def fetch_by_id(self, paper_id: str) -> S2Paper | None:
        """Fetch paper by S2 paperId, DOI, or arXiv ID.

        Supported ID formats:
          - S2 paperId: '649def34f8be52c8b66281af98ae884c09aef38b'
          - DOI: 'DOI:10.1234/...'
          - arXiv: 'ARXIV:2301.00001'
        """
        async with httpx.AsyncClient(timeout=self._timeout) as client:
            resp = await client.get(
                f"{S2_API}/paper/{paper_id}",
                params={"fields": S2_FIELDS},
                headers=self._headers(),
            )
            if resp.status_code == 404:
                return None
            resp.raise_for_status()

        return self._parse_paper(resp.json())

    async def get_references(
        self, paper_id: str, max_results: int = 50,
    ) -> list[S2Paper]:
        """Get papers referenced by a given paper."""
        async with httpx.AsyncClient(timeout=self._timeout) as client:
            resp = await client.get(
                f"{S2_API}/paper/{paper_id}/references",
                params={"fields": S2_FIELDS, "limit": str(min(max_results, 100))},
                headers=self._headers(),
            )
            resp.raise_for_status()

        data = resp.json()
        return [
            self._parse_paper(item["citedPaper"])
            for item in data.get("data", [])
            if item.get("citedPaper")
        ]

    async def get_citations(
        self, paper_id: str, max_results: int = 50,
    ) -> list[S2Paper]:
        """Get papers that cite a given paper."""
        async with httpx.AsyncClient(timeout=self._timeout) as client:
            resp = await client.get(
                f"{S2_API}/paper/{paper_id}/citations",
                params={"fields": S2_FIELDS, "limit": str(min(max_results, 100))},
                headers=self._headers(),
            )
            resp.raise_for_status()

        data = resp.json()
        return [
            self._parse_paper(item["citingPaper"])
            for item in data.get("data", [])
            if item.get("citingPaper")
        ]

    @staticmethod
    def _parse_paper(raw: dict[str, Any]) -> S2Paper:
        authors = [
            a.get("name", "")
            for a in raw.get("authors", [])
            if a.get("name")
        ]
        ext_ids = raw.get("externalIds") or {}
        return S2Paper(
            paper_id=raw.get("paperId", ""),
            title=raw.get("title", ""),
            abstract=raw.get("abstract"),
            authors=authors,
            year=raw.get("year"),
            citation_count=raw.get("citationCount", 0) or 0,
            reference_count=raw.get("referenceCount", 0) or 0,
            venue=raw.get("venue"),
            doi=ext_ids.get("DOI"),
            arxiv_id=ext_ids.get("ArXiv"),
            url=raw.get("url", ""),
        )


# ── Tool interface ─────────────────────────────────────


class SemanticScholarTool:
    """Semantic Scholar as an OpenAGS Tool (satisfies Tool protocol)."""

    _name = "semantic_scholar"
    _description = "Search academic papers via Semantic Scholar, with citation counts, references, and citation graphs."

    def __init__(self, api_key: str | None = None, timeout: int = 30) -> None:
        self._client = SemanticScholarClient(api_key=api_key, timeout=timeout)

    @property
    def name(self) -> str:
        return self._name

    @property
    def description(self) -> str:
        return self._description

    async def invoke(self, **kwargs: Any) -> ToolResult:
        action = kwargs.get("action", "search")
        query = kwargs.get("query", "")
        paper_id = kwargs.get("paper_id", "")
        max_results = int(kwargs.get("max_results", 10))
        year = kwargs.get("year")

        try:
            if action == "search":
                if not query:
                    return ToolResult(success=False, error="'query' is required for search.")
                result = await self._client.search(query, max_results=max_results, year=year)
                return ToolResult(
                    success=True,
                    data={
                        "papers": [p.model_dump() for p in result.papers],
                        "total": result.total,
                        "query": result.query,
                    },
                    metadata={"source": "semantic_scholar", "count": len(result.papers)},
                )

            elif action == "fetch":
                if not paper_id:
                    return ToolResult(success=False, error="'paper_id' is required for fetch.")
                paper = await self._client.fetch_by_id(paper_id)
                if paper is None:
                    return ToolResult(success=False, error=f"Paper '{paper_id}' not found.")
                return ToolResult(success=True, data=paper.model_dump())

            elif action == "references":
                if not paper_id:
                    return ToolResult(success=False, error="'paper_id' required for references.")
                refs = await self._client.get_references(paper_id, max_results=max_results)
                return ToolResult(
                    success=True,
                    data={"references": [p.model_dump() for p in refs]},
                    metadata={"count": len(refs)},
                )

            elif action == "citations":
                if not paper_id:
                    return ToolResult(success=False, error="'paper_id' required for citations.")
                cites = await self._client.get_citations(paper_id, max_results=max_results)
                return ToolResult(
                    success=True,
                    data={"citations": [p.model_dump() for p in cites]},
                    metadata={"count": len(cites)},
                )

            else:
                return ToolResult(
                    success=False,
                    error=f"Unknown action '{action}'. Use: search, fetch, references, citations.",
                )

        except httpx.HTTPStatusError as e:
            return ToolResult(success=False, error=f"S2 API error: {e.response.status_code}")
        except Exception as e:
            logger.error("SemanticScholarTool error: %s", e)
            return ToolResult(success=False, error=str(e))

    def schema(self) -> dict[str, Any]:
        return {
            "type": "object",
            "properties": {
                "action": {
                    "type": "string",
                    "enum": ["search", "fetch", "references", "citations"],
                    "description": "Action to perform (default: search)",
                    "default": "search",
                },
                "query": {
                    "type": "string",
                    "description": "Search query string",
                },
                "paper_id": {
                    "type": "string",
                    "description": "Paper ID (S2 ID, 'DOI:...', or 'ARXIV:...')",
                },
                "max_results": {
                    "type": "integer",
                    "description": "Max results to return (1-100, default 10)",
                    "default": 10,
                },
                "year": {
                    "type": "string",
                    "description": "Year filter (e.g. '2023', '2020-2024')",
                },
            },
            "required": [],
        }
