"""Vector store protocol and local implementation.

The ``VectorStore`` protocol defines the interface.  ``LocalVectorStore``
provides a simple in-process implementation using cosine similarity over
bag-of-words TF vectors (no external dependencies).  For production use,
swap in a ChromaDB or FAISS adapter that satisfies the same protocol.
"""

from __future__ import annotations

import json
import logging
import math
from collections import Counter
from pathlib import Path
from typing import Protocol, runtime_checkable

from pydantic import BaseModel

logger = logging.getLogger(__name__)


class Document(BaseModel):
    """A stored document with its text and metadata."""

    id: str
    text: str
    metadata: dict[str, str] = {}


class SearchResult(BaseModel):
    """A single retrieval result."""

    document: Document
    score: float


@runtime_checkable
class VectorStore(Protocol):
    """Protocol for vector storage backends."""

    async def add(self, documents: list[Document]) -> int:
        """Add documents. Returns number added."""
        ...

    async def search(self, query: str, top_k: int = 5) -> list[SearchResult]:
        """Semantic search. Returns top_k results sorted by relevance."""
        ...

    async def delete(self, doc_ids: list[str]) -> int:
        """Delete documents by ID. Returns number deleted."""
        ...

    async def count(self) -> int:
        """Total number of stored documents."""
        ...


def _tokenize(text: str) -> list[str]:
    """Simple whitespace + lowercase tokenizer."""
    return [w.lower().strip(".,;:!?\"'()[]{}") for w in text.split() if len(w) > 1]


def _tf_vector(tokens: list[str]) -> dict[str, float]:
    """Term-frequency vector."""
    counts = Counter(tokens)
    total = sum(counts.values())
    if total == 0:
        return {}
    return {t: c / total for t, c in counts.items()}


def _cosine(a: dict[str, float], b: dict[str, float]) -> float:
    """Cosine similarity between two sparse vectors."""
    keys = set(a) & set(b)
    if not keys:
        return 0.0
    dot = sum(a[k] * b[k] for k in keys)
    mag_a = math.sqrt(sum(v * v for v in a.values()))
    mag_b = math.sqrt(sum(v * v for v in b.values()))
    if mag_a == 0 or mag_b == 0:
        return 0.0
    return dot / (mag_a * mag_b)


class LocalVectorStore:
    """In-process vector store using TF cosine similarity.

    Good enough for small knowledge bases (< 10K docs).  For larger
    corpora, use a ChromaDB or FAISS adapter instead.

    Persists to a JSON file at ``{store_dir}/vectors.json``.
    """

    def __init__(self, store_dir: Path) -> None:
        self._store_dir = store_dir
        self._store_dir.mkdir(parents=True, exist_ok=True)
        self._path = store_dir / "vectors.json"
        self._docs: dict[str, Document] = {}
        self._vectors: dict[str, dict[str, float]] = {}
        self._load()

    def _load(self) -> None:
        if not self._path.exists():
            return
        try:
            data = json.loads(self._path.read_text(encoding="utf-8"))
            for item in data:
                doc = Document(**item)
                self._docs[doc.id] = doc
                self._vectors[doc.id] = _tf_vector(_tokenize(doc.text))
        except Exception as e:
            logger.warning("Failed to load vector store: %s", e)

    def _save(self) -> None:
        data = [doc.model_dump() for doc in self._docs.values()]
        self._path.write_text(json.dumps(data, ensure_ascii=False), encoding="utf-8")

    async def add(self, documents: list[Document]) -> int:
        added = 0
        for doc in documents:
            self._docs[doc.id] = doc
            self._vectors[doc.id] = _tf_vector(_tokenize(doc.text))
            added += 1
        self._save()
        return added

    async def search(self, query: str, top_k: int = 5) -> list[SearchResult]:
        q_vec = _tf_vector(_tokenize(query))
        if not q_vec:
            return []

        scored: list[tuple[str, float]] = []
        for doc_id, vec in self._vectors.items():
            score = _cosine(q_vec, vec)
            if score > 0:
                scored.append((doc_id, score))

        scored.sort(key=lambda x: x[1], reverse=True)
        return [
            SearchResult(document=self._docs[doc_id], score=score)
            for doc_id, score in scored[:top_k]
        ]

    async def delete(self, doc_ids: list[str]) -> int:
        deleted = 0
        for doc_id in doc_ids:
            if doc_id in self._docs:
                del self._docs[doc_id]
                del self._vectors[doc_id]
                deleted += 1
        if deleted:
            self._save()
        return deleted

    async def count(self) -> int:
        return len(self._docs)
