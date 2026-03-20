"""openags.rag — Retrieval-Augmented Generation for agent memory.

Provides a VectorStore protocol, document chunking, and a retrieval
integration that agents can use to query project knowledge bases.
"""

from __future__ import annotations

from openags.agent.rag.chunker import chunk_text
from openags.agent.rag.store import LocalVectorStore, VectorStore

__all__ = ["LocalVectorStore", "VectorStore", "chunk_text"]
