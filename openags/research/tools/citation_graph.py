r"""Citation graph — extract and visualize citation relationships.

Parses BibTeX files and LaTeX \cite{} references to build a citation network.
"""

from __future__ import annotations

import re
from pathlib import Path


def extract_citations_from_tex(tex_path: Path) -> list[str]:
    r"""Extract all \cite{key} references from a LaTeX file."""
    if not tex_path.exists():
        return []
    text = tex_path.read_text(encoding="utf-8")
    # Match \cite{key1, key2}, \citep{key}, \citet{key}, etc.
    pattern = r"\\cite[pt]?\{([^}]+)\}"
    keys: list[str] = []
    for match in re.finditer(pattern, text):
        for key in match.group(1).split(","):
            k = key.strip()
            if k:
                keys.append(k)
    return list(dict.fromkeys(keys))  # deduplicate preserving order


def parse_bibtex(bib_path: Path) -> dict[str, dict[str, str]]:
    """Parse a BibTeX file into a dict of {key: {title, author, year, ...}}."""
    if not bib_path.exists():
        return {}
    text = bib_path.read_text(encoding="utf-8")
    entries: dict[str, dict[str, str]] = {}

    # Simple regex parser (handles most common cases)
    entry_pattern = re.compile(r"@\w+\{([^,]+),\s*(.*?)\n\}", re.DOTALL)
    field_pattern = re.compile(r"(\w+)\s*=\s*\{([^}]*)\}")

    for match in entry_pattern.finditer(text):
        key = match.group(1).strip()
        body = match.group(2)
        fields: dict[str, str] = {}
        for field_match in field_pattern.finditer(body):
            fields[field_match.group(1).lower()] = field_match.group(2).strip()
        entries[key] = fields

    return entries


def build_citation_graph(project_workspace: Path) -> dict:
    """Build a citation graph for a project.

    Returns:
        {
            "nodes": [{"id": "key", "title": "...", "author": "...", "year": "..."}],
            "edges": [{"source": "main.tex", "target": "key"}],
            "uncited": ["key1", ...],  # in bib but not cited
            "unresolved": ["key2", ...],  # cited but not in bib
        }
    """
    ms_dir = project_workspace / "manuscript"
    tex_path = ms_dir / "main.tex"
    bib_path = ms_dir / "references.bib"

    cited_keys = extract_citations_from_tex(tex_path)
    bib_entries = parse_bibtex(bib_path)

    nodes = []
    for key, fields in bib_entries.items():
        nodes.append(
            {
                "id": key,
                "title": fields.get("title", ""),
                "author": fields.get("author", ""),
                "year": fields.get("year", ""),
                "cited": key in cited_keys,
            }
        )

    edges = [{"source": "main.tex", "target": k} for k in cited_keys if k in bib_entries]
    uncited = [k for k in bib_entries if k not in cited_keys]
    unresolved = [k for k in cited_keys if k not in bib_entries]

    return {
        "nodes": nodes,
        "edges": edges,
        "uncited": uncited,
        "unresolved": unresolved,
        "total_citations": len(cited_keys),
        "total_references": len(bib_entries),
    }
