---
name: verify-citations
description: Verify academic citations against public databases
roles: [literature, reference, reviewer]
tools: [arxiv, semantic_scholar]
triggers: ["verify citations", "check references", "validate bibliography", "always"]
version: "1.0.0"
---

## Instructions

Before finalizing any output that contains citations:

1. Extract all cited papers from the text
2. For each citation, verify:
   - arXiv ID exists (if provided)
   - DOI resolves in CrossRef (if provided)
   - Title matches in Semantic Scholar (fuzzy match, threshold 0.85)
3. Flag unverifiable citations with ⚠️
4. Suggest corrections for near-matches
5. Generate a verification summary at the end
