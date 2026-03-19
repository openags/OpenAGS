"""Tests for RAG system: vector store and chunker."""

from __future__ import annotations

from pathlib import Path

import pytest

from openags.agent.rag.chunker import chunk_text
from openags.agent.rag.store import Document, LocalVectorStore


class TestChunker:
    def test_short_text_single_chunk(self) -> None:
        chunks = chunk_text("hello world", chunk_size=100)
        assert chunks == ["hello world"]

    def test_empty_text(self) -> None:
        assert chunk_text("") == []
        assert chunk_text("   ") == []

    def test_splits_long_text(self) -> None:
        text = " ".join(f"word{i}" for i in range(100))
        chunks = chunk_text(text, chunk_size=30, overlap=5)
        assert len(chunks) > 1
        # Each chunk should have ~30 words (except possibly the last)
        for chunk in chunks[:-1]:
            assert len(chunk.split()) == 30

    def test_overlap_present(self) -> None:
        text = " ".join(f"w{i}" for i in range(20))
        chunks = chunk_text(text, chunk_size=10, overlap=3)
        assert len(chunks) >= 2
        # Overlap: last 3 words of chunk 0 should be first 3 of chunk 1
        words_0 = chunks[0].split()
        words_1 = chunks[1].split()
        assert words_0[-3:] == words_1[:3]


class TestLocalVectorStore:
    @pytest.mark.asyncio
    async def test_add_and_count(self, tmp_path: Path) -> None:
        store = LocalVectorStore(tmp_path)
        n = await store.add([
            Document(id="d1", text="machine learning with neural networks"),
            Document(id="d2", text="protein folding prediction"),
        ])
        assert n == 2
        assert await store.count() == 2

    @pytest.mark.asyncio
    async def test_search_relevance(self, tmp_path: Path) -> None:
        store = LocalVectorStore(tmp_path)
        await store.add([
            Document(id="ml", text="deep learning neural network training optimization gradient descent"),
            Document(id="bio", text="protein folding structure prediction biology amino acids"),
            Document(id="math", text="linear algebra matrix multiplication eigenvalues"),
        ])
        results = await store.search("neural network deep learning", top_k=3)
        assert len(results) > 0
        # ML doc should rank first (most word overlap)
        assert results[0].document.id == "ml"
        assert results[0].score > 0

    @pytest.mark.asyncio
    async def test_search_empty_query(self, tmp_path: Path) -> None:
        store = LocalVectorStore(tmp_path)
        await store.add([Document(id="d1", text="some content")])
        results = await store.search("")
        assert results == []

    @pytest.mark.asyncio
    async def test_delete(self, tmp_path: Path) -> None:
        store = LocalVectorStore(tmp_path)
        await store.add([
            Document(id="d1", text="first document"),
            Document(id="d2", text="second document"),
        ])
        deleted = await store.delete(["d1"])
        assert deleted == 1
        assert await store.count() == 1

    @pytest.mark.asyncio
    async def test_persistence(self, tmp_path: Path) -> None:
        store1 = LocalVectorStore(tmp_path)
        await store1.add([Document(id="p1", text="persistent data here")])

        # Reload from disk
        store2 = LocalVectorStore(tmp_path)
        assert await store2.count() == 1
        results = await store2.search("persistent data")
        assert len(results) == 1
        assert results[0].document.id == "p1"

    @pytest.mark.asyncio
    async def test_metadata(self, tmp_path: Path) -> None:
        store = LocalVectorStore(tmp_path)
        await store.add([
            Document(id="p1", text="paper about transformers", metadata={"source": "arxiv", "year": "2024"}),
        ])
        results = await store.search("transformers")
        assert results[0].document.metadata["source"] == "arxiv"
