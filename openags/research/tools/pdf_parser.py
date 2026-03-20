"""PDF parsing — extract text, metadata, and figures from academic papers.

Uses PyMuPDF (fitz) when available, falls back to basic text extraction.
Designed for integration with LiteratureAgent for auto-summary generation.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass, field
from pathlib import Path

logger = logging.getLogger(__name__)


@dataclass
class ParsedPaper:
    """Structured representation of a parsed PDF paper."""

    title: str = ""
    authors: list[str] = field(default_factory=list)
    abstract: str = ""
    full_text: str = ""
    sections: list[PaperSection] = field(default_factory=list)
    figures: list[PaperFigure] = field(default_factory=list)
    page_count: int = 0
    metadata: dict[str, str] = field(default_factory=dict)


@dataclass
class PaperSection:
    """A section of the paper with heading and content."""

    heading: str
    content: str
    level: int = 1  # 1 = top-level, 2 = subsection, etc.


@dataclass
class PaperFigure:
    """An extracted figure from the PDF."""

    page: int
    index: int
    width: int = 0
    height: int = 0
    image_path: str = ""  # Path where image was saved


def _check_pymupdf() -> bool:
    """Check if PyMuPDF is installed."""
    try:
        import fitz  # noqa: F401

        return True
    except ImportError:
        return False


HAS_PYMUPDF = _check_pymupdf()


class PDFParser:
    """Extract structured content from PDF files.

    Uses PyMuPDF for rich extraction (text, images, metadata).
    Gracefully degrades if PyMuPDF is not installed.
    """

    def __init__(self, output_dir: Path | None = None) -> None:
        self._output_dir = output_dir

    def parse(self, pdf_path: Path) -> ParsedPaper:
        """Parse a PDF file and return structured content."""
        if not pdf_path.exists():
            raise FileNotFoundError(f"PDF not found: {pdf_path}")

        if not HAS_PYMUPDF:
            logger.warning("PyMuPDF not installed. Install with: pip install pymupdf")
            return ParsedPaper(
                full_text=f"[PDF parsing unavailable — install pymupdf: {pdf_path.name}]",
            )

        return self._parse_with_pymupdf(pdf_path)

    def _parse_with_pymupdf(self, pdf_path: Path) -> ParsedPaper:
        """Full parsing using PyMuPDF."""
        import fitz

        doc = fitz.open(str(pdf_path))

        # Extract metadata
        meta = doc.metadata or {}
        title = meta.get("title", "") or ""
        author_str = meta.get("author", "") or ""
        authors = [a.strip() for a in author_str.split(",") if a.strip()]

        # Extract text page by page
        pages_text: list[str] = []
        for page in doc:
            pages_text.append(page.get_text("text"))

        full_text = "\n\n".join(pages_text)

        # Extract abstract (heuristic: text between "Abstract" and "Introduction")
        abstract = self._extract_abstract(full_text)

        # Extract sections (heuristic: lines that look like headings)
        sections = self._extract_sections(full_text)

        # Extract figures if output dir specified
        figures: list[PaperFigure] = []
        if self._output_dir:
            figures = self._extract_figures(doc, pdf_path.stem)

        paper = ParsedPaper(
            title=title,
            authors=authors,
            abstract=abstract,
            full_text=full_text,
            sections=sections,
            figures=figures,
            page_count=len(doc),
            metadata={k: str(v) for k, v in meta.items() if v},
        )

        doc.close()
        return paper

    @staticmethod
    def _extract_abstract(text: str) -> str:
        """Heuristic extraction of abstract section."""
        lower = text.lower()
        abs_start = lower.find("abstract")
        if abs_start == -1:
            return ""

        abs_start += len("abstract")
        # Skip whitespace and newlines after "abstract"
        while abs_start < len(text) and text[abs_start] in " \n\r\t.—:":
            abs_start += 1

        # Find the end — typically "Introduction", "1.", or double newline
        intro_markers = ["introduction", "\n1.", "\n1 "]
        abs_end = len(text)
        for marker in intro_markers:
            idx = lower.find(marker, abs_start)
            if idx != -1 and idx < abs_end:
                abs_end = idx

        # Cap at reasonable length
        abs_end = min(abs_end, abs_start + 3000)
        return text[abs_start:abs_end].strip()

    @staticmethod
    def _extract_sections(text: str) -> list[PaperSection]:
        """Heuristic section extraction based on formatting patterns."""
        import re

        sections: list[PaperSection] = []
        # Match numbered sections like "1. Introduction" or "2.1 Methods"
        pattern = re.compile(r"^(\d+(?:\.\d+)*)\s+([A-Z][^\n]{2,60})$", re.MULTILINE)
        matches = list(pattern.finditer(text))

        for i, match in enumerate(matches):
            heading = f"{match.group(1)} {match.group(2)}"
            level = heading.count(".") + 1
            start = match.end()
            end = matches[i + 1].start() if i + 1 < len(matches) else len(text)
            content = text[start:end].strip()

            # Cap section content
            if len(content) > 10000:
                content = content[:10000] + "..."

            sections.append(
                PaperSection(
                    heading=heading,
                    content=content,
                    level=level,
                )
            )

        return sections

    def _extract_figures(self, doc: object, stem: str) -> list[PaperFigure]:
        """Extract images from PDF pages."""
        import fitz

        if not isinstance(doc, fitz.Document):
            return []

        if not self._output_dir:
            return []

        fig_dir = self._output_dir / "figures"
        fig_dir.mkdir(parents=True, exist_ok=True)

        figures: list[PaperFigure] = []
        for page_num, page in enumerate(doc):
            image_list = page.get_images(full=True)
            for img_idx, img_info in enumerate(image_list):
                xref = img_info[0]
                try:
                    pix = fitz.Pixmap(doc, xref)
                    if pix.n - pix.alpha > 3:  # CMYK → RGB
                        pix = fitz.Pixmap(fitz.csRGB, pix)

                    img_path = fig_dir / f"{stem}_p{page_num + 1}_fig{img_idx + 1}.png"
                    pix.save(str(img_path))

                    figures.append(
                        PaperFigure(
                            page=page_num + 1,
                            index=img_idx + 1,
                            width=pix.width,
                            height=pix.height,
                            image_path=str(img_path),
                        )
                    )
                except Exception as e:
                    logger.debug("Failed to extract image p%d/%d: %s", page_num, img_idx, e)

        return figures

    def summarize(self, paper: ParsedPaper, max_chars: int = 2000) -> str:
        """Generate a structured summary of the parsed paper for LLM context."""
        parts: list[str] = []

        if paper.title:
            parts.append(f"# {paper.title}")
        if paper.authors:
            parts.append(f"**Authors**: {', '.join(paper.authors)}")
        if paper.abstract:
            parts.append(f"## Abstract\n{paper.abstract[:1000]}")
        if paper.sections:
            parts.append("## Sections")
            for sec in paper.sections:
                preview = sec.content[:200] + "..." if len(sec.content) > 200 else sec.content
                parts.append(f"### {sec.heading}\n{preview}")
        if paper.figures:
            parts.append(f"**Figures**: {len(paper.figures)} extracted")
        parts.append(f"**Pages**: {paper.page_count}")

        summary = "\n\n".join(parts)
        if len(summary) > max_chars:
            summary = summary[:max_chars] + "\n\n[truncated]"
        return summary
