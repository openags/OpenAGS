"""Tests for CitationVerifier — multi-layer citation verification."""

from __future__ import annotations

from unittest.mock import AsyncMock, patch

import pytest

from openags.models import Citation, VerifyResult
from openags.research.tools.citation_verify import CitationVerifier
from openags.research.tools.semantic_scholar import S2Paper


@pytest.fixture()
def verifier() -> CitationVerifier:
    return CitationVerifier(backend=None, timeout=20)


def test_title_similarity_identical(verifier: CitationVerifier) -> None:
    assert verifier._title_similarity("Hello World", "Hello World") == 1.0


def test_title_similarity_partial(verifier: CitationVerifier) -> None:
    score = verifier._title_similarity("deep learning for vision", "deep learning for NLP")
    # 3 shared words out of 5 union → 0.6
    assert 0.0 < score < 1.0


def test_title_similarity_empty_string(verifier: CitationVerifier) -> None:
    assert verifier._title_similarity("", "something") == 0.0


def test_title_similarity_both_empty(verifier: CitationVerifier) -> None:
    assert verifier._title_similarity("", "") == 0.0


@pytest.mark.asyncio()
async def test_verify_arxiv_not_found(verifier: CitationVerifier) -> None:
    citation = Citation(title="Some Paper", arxiv_id="9999.99999")
    with patch.object(verifier._arxiv, "fetch_by_id", new_callable=AsyncMock, return_value=None):
        result = await verifier.verify(citation)
    assert result.valid is False
    assert "arXiv" in result.reason


@pytest.mark.asyncio()
async def test_verify_doi_not_found(verifier: CitationVerifier) -> None:
    citation = Citation(title="Some Paper", doi="10.0000/fake")
    with patch.object(verifier, "_check_doi", new_callable=AsyncMock, return_value=False):
        result = await verifier.verify(citation)
    assert result.valid is False
    assert "DOI" in result.reason


@pytest.mark.asyncio()
async def test_verify_s2_not_found(verifier: CitationVerifier) -> None:
    citation = Citation(title="Completely Unknown Paper")
    with patch.object(verifier._s2, "search_by_title", new_callable=AsyncMock, return_value=None):
        result = await verifier.verify(citation)
    assert result.valid is False
    assert "Semantic Scholar" in result.reason


@pytest.mark.asyncio()
async def test_verify_title_mismatch(verifier: CitationVerifier) -> None:
    citation = Citation(title="Quantum Computing Advances")
    mismatched_paper = S2Paper(
        paper_id="abc123",
        title="Cooking Recipes for Beginners",
    )
    with patch.object(
        verifier._s2, "search_by_title", new_callable=AsyncMock, return_value=mismatched_paper,
    ):
        result = await verifier.verify(citation)
    assert result.valid is False
    assert "mismatch" in result.reason.lower()


@pytest.mark.asyncio()
async def test_verify_success(verifier: CitationVerifier) -> None:
    citation = Citation(title="Attention Is All You Need", authors=["Vaswani"], year=2017)
    matching_paper = S2Paper(
        paper_id="abc123",
        title="Attention Is All You Need",
        year=2017,
        doi="10.5555/example",
    )
    with patch.object(
        verifier._s2, "search_by_title", new_callable=AsyncMock, return_value=matching_paper,
    ):
        result = await verifier.verify(citation)
    assert result.valid is True
    assert result.confidence > 0.85
    assert result.verified_citation is not None
