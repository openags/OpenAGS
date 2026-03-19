---
name: search-papers
description: Search for academic papers using arXiv and Semantic Scholar
roles: [literature, coordinator]
tools: [arxiv, semantic_scholar]
triggers: ["search papers", "find papers", "literature search", "arxiv", "semantic scholar"]
allowed-tools: Bash(curl *), Read, Write, Grep
version: "1.0.0"
---

## Instructions

When the user asks to search for academic papers:

1. Use the `arxiv` tool to search arXiv for relevant preprints
2. Use the `semantic_scholar` tool to find peer-reviewed papers with citation data
3. Combine results, removing duplicates (match by title similarity)
4. Sort by relevance, then by citation count
5. Present results as a structured list with:
   - Title, Authors, Year
   - Venue (if peer-reviewed)
   - Citation count
   - arXiv/DOI links
   - Brief abstract summary (1-2 sentences)
