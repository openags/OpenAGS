"""4-layer citation verification — prevents LLM citation hallucinations.

Layer 1: arXiv ID existence check
Layer 2: DOI lookup via CrossRef (uses content negotiation, no API key needed)
Layer 3: Title fuzzy match via Semantic Scholar
Layer 4: LLM plausibility check (optional, requires backend)
"""

from __future__ import annotations

import logging
from typing import Any

import httpx

from openags.models import Citation, VerifyResult
from openags.research.tools.arxiv import ArxivClient
from openags.research.tools.semantic_scholar import SemanticScholarClient

logger = logging.getLogger(__name__)

CROSSREF_API = "https://api.crossref.org/works"


class CitationVerifier:
    """Multi-layer citation verification pipeline."""

    def __init__(self, backend: Any = None, timeout: int = 20) -> None:
        self._arxiv = ArxivClient(timeout=timeout)
        self._s2 = SemanticScholarClient(timeout=timeout)
        self._backend = backend
        self._timeout = timeout

    async def verify(self, citation: Citation) -> VerifyResult:
        """Run all applicable verification layers."""
        # Layer 1: arXiv ID → direct existence check
        if citation.arxiv_id:
            paper = await self._arxiv.fetch_by_id(citation.arxiv_id)
            if paper is None:
                return VerifyResult(valid=False, reason="arXiv ID does not exist")

        # Layer 2: DOI → CrossRef registration
        if citation.doi:
            doi_valid = await self._check_doi(citation.doi)
            if not doi_valid:
                return VerifyResult(valid=False, reason="DOI not found in CrossRef")

        # Layer 3: Title → Semantic Scholar fuzzy match
        s2_paper = await self._s2.search_by_title(citation.title)
        if s2_paper is None:
            return VerifyResult(
                valid=False,
                confidence=0.0,
                reason="Not found in Semantic Scholar",
            )

        similarity = self._title_similarity(citation.title, s2_paper.title)
        if similarity < 0.85:
            return VerifyResult(
                valid=False,
                confidence=similarity,
                reason=f"Title mismatch (similarity={similarity:.2f})",
            )

        # Layer 4: LLM plausibility (optional)
        confidence = min(1.0, similarity + 0.1)
        if self._backend:
            try:
                llm_score = await self._llm_relevance_check(citation)
                confidence = (similarity + llm_score) / 2
            except Exception as e:
                logger.warning("LLM relevance check failed: %s", e)

        # Build verified citation with S2 data
        verified = citation.model_copy(update={
            "doi": s2_paper.doi or citation.doi,
            "year": s2_paper.year or citation.year,
        })

        return VerifyResult(
            valid=True,
            confidence=confidence,
            reason="Verified via Semantic Scholar",
            verified_citation=verified,
        )

    async def _check_doi(self, doi: str) -> bool:
        """Check if DOI exists in CrossRef."""
        try:
            async with httpx.AsyncClient(timeout=self._timeout) as client:
                resp = await client.get(
                    f"{CROSSREF_API}/{doi}",
                    headers={"Accept": "application/json"},
                )
                return resp.status_code == 200
        except Exception:
            return False

    @staticmethod
    def _title_similarity(a: str, b: str) -> float:
        """Jaccard similarity on word sets — no extra dependencies."""
        sa = set(a.lower().split())
        sb = set(b.lower().split())
        if not sa or not sb:
            return 0.0
        return len(sa & sb) / len(sa | sb)

    async def _llm_relevance_check(self, citation: Citation) -> float:
        """Ask LLM to rate citation plausibility (0.0-1.0)."""
        prompt = (
            f"Rate the plausibility of this academic citation (0.0-1.0):\n"
            f"Title: {citation.title}\n"
            f"Authors: {', '.join(citation.authors)}\n"
            f"Year: {citation.year}\n"
            f"Reply with only a number."
        )
        response = await self._backend.execute(prompt, timeout=30)
        try:
            return max(0.0, min(1.0, float(response.content.strip())))
        except ValueError:
            return 0.5
