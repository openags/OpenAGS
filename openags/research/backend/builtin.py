"""Backward-compat alias — real implementation is in openags.agent.llm."""

from openags.agent.llm import LLMBackend as BuiltinBackend

__all__ = ["BuiltinBackend"]
