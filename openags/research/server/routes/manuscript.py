"""Manuscript file management API routes — mini-Overleaf backend.

Provides file tree browsing, reading, writing, creating, deleting,
and LaTeX compilation for the manuscript/ subdirectory of a project.
"""

from __future__ import annotations

import asyncio
import logging
import re
import shutil
from pathlib import Path

from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel

from openags.agent.errors import ProjectError
from openags.research.project import ProjectManager

logger = logging.getLogger(__name__)

router = APIRouter()


# ── Request / response models ─────────────────────────


class FileEntry(BaseModel):
    """Single entry in the file tree."""

    name: str
    path: str  # relative to manuscript/
    is_dir: bool
    size: int = 0
    children: list[FileEntry] = []


class FileContent(BaseModel):
    path: str
    content: str
    size: int


class WriteFileRequest(BaseModel):
    path: str  # relative to manuscript/
    content: str


class CreateRequest(BaseModel):
    path: str  # relative to manuscript/
    is_dir: bool = False


class RenameRequest(BaseModel):
    old_path: str
    new_path: str


class CompileResult(BaseModel):
    success: bool
    pdf_path: str | None = None
    log: str = ""
    errors: list[str] = []


# ── Helpers ───────────────────────────────────────────


def _get_pm(request: Request) -> ProjectManager:
    return request.app.state.orchestrator.project_mgr


def _manuscript_dir(pm: ProjectManager, project_id: str) -> Path:
    """Resolve and validate the manuscript directory for a project."""
    try:
        project = pm.get(project_id)
    except ProjectError:
        raise HTTPException(status_code=404, detail=f"Project '{project_id}' not found")
    ms_dir = project.workspace / "manuscript"
    ms_dir.mkdir(parents=True, exist_ok=True)
    return ms_dir


def _safe_path(ms_dir: Path, rel_path: str) -> Path:
    """Resolve a relative path within manuscript dir, preventing traversal."""
    # Reject suspicious patterns
    if ".." in rel_path or rel_path.startswith("/"):
        raise HTTPException(status_code=400, detail="Invalid path")
    resolved = (ms_dir / rel_path).resolve()
    if not str(resolved).startswith(str(ms_dir.resolve())):
        raise HTTPException(status_code=400, detail="Path traversal not allowed")
    return resolved


# Directories/files to hide from the manuscript file browser
_HIDDEN_NAMES = {"agent", "sessions", ".build", ".versions", "memory.md"}


def _build_tree(directory: Path, base: Path) -> list[FileEntry]:
    """Recursively build a file tree relative to base, hiding non-writing items."""
    entries: list[FileEntry] = []
    if not directory.exists():
        return entries

    for item in sorted(directory.iterdir(), key=lambda p: (not p.is_dir(), p.name.lower())):
        if item.name in _HIDDEN_NAMES:
            continue
        rel = str(item.relative_to(base))
        if item.is_dir():
            children = _build_tree(item, base)
            entries.append(FileEntry(
                name=item.name,
                path=rel,
                is_dir=True,
                children=children,
            ))
        else:
            entries.append(FileEntry(
                name=item.name,
                path=rel,
                is_dir=False,
                size=item.stat().st_size,
            ))
    return entries


# ── Routes ────────────────────────────────────────────


@router.get("/{project_id}/tree", response_model=list[FileEntry])
async def get_file_tree(request: Request, project_id: str) -> list[FileEntry]:
    """Get the complete file tree under manuscript/."""
    ms_dir = _manuscript_dir(_get_pm(request), project_id)
    return _build_tree(ms_dir, ms_dir)


@router.get("/{project_id}/file")
async def read_file(request: Request, project_id: str, path: str) -> FileContent:
    """Read a file from manuscript/ by relative path."""
    ms_dir = _manuscript_dir(_get_pm(request), project_id)
    file_path = _safe_path(ms_dir, path)

    if not file_path.exists():
        raise HTTPException(status_code=404, detail=f"File not found: {path}")
    if file_path.is_dir():
        raise HTTPException(status_code=400, detail="Cannot read a directory")

    try:
        content = file_path.read_text(encoding="utf-8")
    except UnicodeDecodeError:
        raise HTTPException(status_code=400, detail="Binary file cannot be read as text")

    return FileContent(path=path, content=content, size=len(content))


@router.put("/{project_id}/file")
async def write_file(request: Request, project_id: str, body: WriteFileRequest) -> FileContent:
    """Write (create or update) a file in manuscript/.

    Automatically creates a version snapshot before overwriting.
    """
    import shutil

    ms_dir = _manuscript_dir(_get_pm(request), project_id)
    file_path = _safe_path(ms_dir, body.path)

    # Auto-snapshot existing file before overwrite
    if file_path.exists() and file_path.is_file():
        ver_dir = _versions_dir(ms_dir, body.path)
        ver_dir.mkdir(parents=True, exist_ok=True)
        existing = sorted(ver_dir.glob("v*.txt"))
        next_ver = len(existing) + 1
        shutil.copy2(file_path, ver_dir / f"v{next_ver:04d}.txt")

    # Ensure parent directory exists
    file_path.parent.mkdir(parents=True, exist_ok=True)
    file_path.write_text(body.content, encoding="utf-8")

    return FileContent(path=body.path, content=body.content, size=len(body.content))


@router.post("/{project_id}/create")
async def create_entry(
    request: Request, project_id: str, body: CreateRequest,
) -> dict[str, str]:
    """Create a new file or directory in manuscript/."""
    ms_dir = _manuscript_dir(_get_pm(request), project_id)
    target = _safe_path(ms_dir, body.path)

    if target.exists():
        raise HTTPException(status_code=409, detail=f"Already exists: {body.path}")

    if body.is_dir:
        target.mkdir(parents=True, exist_ok=True)
    else:
        target.parent.mkdir(parents=True, exist_ok=True)
        target.touch()

    return {"status": "created", "path": body.path, "is_dir": str(body.is_dir)}


@router.post("/{project_id}/rename")
async def rename_entry(
    request: Request, project_id: str, body: RenameRequest,
) -> dict[str, str]:
    """Rename or move a file/directory within manuscript/."""
    ms_dir = _manuscript_dir(_get_pm(request), project_id)
    old = _safe_path(ms_dir, body.old_path)
    new = _safe_path(ms_dir, body.new_path)

    if not old.exists():
        raise HTTPException(status_code=404, detail=f"Not found: {body.old_path}")
    if new.exists():
        raise HTTPException(status_code=409, detail=f"Already exists: {body.new_path}")

    new.parent.mkdir(parents=True, exist_ok=True)
    old.rename(new)

    return {"status": "renamed", "old_path": body.old_path, "new_path": body.new_path}


@router.delete("/{project_id}/file")
async def delete_entry(
    request: Request, project_id: str, path: str,
) -> dict[str, str]:
    """Delete a file or directory from manuscript/."""
    ms_dir = _manuscript_dir(_get_pm(request), project_id)
    target = _safe_path(ms_dir, path)

    if not target.exists():
        raise HTTPException(status_code=404, detail=f"Not found: {path}")

    import shutil

    if target.is_dir():
        shutil.rmtree(target)
    else:
        target.unlink()

    return {"status": "deleted", "path": path}


def _get_latex_engine(pm: ProjectManager, project_id: str) -> str:
    """Read the configured LaTeX engine. Auto-detects tectonic if pdflatex is missing."""
    import shutil

    engine = "pdflatex"
    try:
        project = pm.get(project_id)
        config_path = project.workspace / ".openags" / "config.yaml"
        if config_path.exists():
            import yaml

            config = yaml.safe_load(config_path.read_text(encoding="utf-8")) or {}
            engine = config.get("latex_engine", "pdflatex")
    except Exception:
        pass

    # Auto-fallback: if configured engine not found, try tectonic
    if shutil.which(engine) is None and shutil.which("tectonic") is not None:
        return "tectonic"
    return engine


@router.post("/{project_id}/compile", response_model=CompileResult)
async def compile_latex(
    request: Request,
    project_id: str,
    path: str = "main.tex",
    engine: str | None = None,
) -> CompileResult:
    """Compile a LaTeX file to PDF.

    Supports pdflatex, xelatex, and lualatex engines.
    Runs twice (for references) in the manuscript directory.
    Returns the path to the generated PDF and any compilation errors.
    """
    pm = _get_pm(request)
    ms_dir = _manuscript_dir(pm, project_id)
    tex_path = _safe_path(ms_dir, path)

    if not tex_path.exists():
        raise HTTPException(status_code=404, detail=f"File not found: {path}")
    if not tex_path.suffix == ".tex":
        raise HTTPException(status_code=400, detail="Only .tex files can be compiled")

    # Determine LaTeX engine
    latex_engine = engine or _get_latex_engine(pm, project_id)
    valid_engines = ("pdflatex", "xelatex", "lualatex", "tectonic")
    if latex_engine not in valid_engines:
        raise HTTPException(status_code=400, detail=f"Unsupported engine: {latex_engine}")

    # Output directory for build artifacts
    build_dir = ms_dir / ".build"
    build_dir.mkdir(exist_ok=True)

    # Build command based on engine
    if latex_engine == "tectonic":
        # Tectonic handles multiple passes automatically
        cmd = [
            "tectonic",
            "-o", build_dir.as_posix(),
            "--keep-logs",
            tex_path.as_posix(),
        ]
    else:
        cmd = [
            latex_engine,
            "-interaction=nonstopmode",
            "-halt-on-error",
            f"-output-directory={build_dir.as_posix()}",
            tex_path.as_posix(),
        ]

    full_log = ""
    errors: list[str] = []

    # Ensure LaTeX binaries are in PATH (macOS BasicTeX / MacTeX)
    import os
    env = os.environ.copy()
    tex_paths = "/Library/TeX/texbin:/opt/miniconda3/bin"
    env["PATH"] = f"{tex_paths}:{env.get('PATH', '')}"

    # Tectonic runs once (handles passes internally), others run twice
    num_passes = 1 if latex_engine == "tectonic" else 2
    for pass_num in range(num_passes):
        try:
            proc = await asyncio.create_subprocess_exec(
                *cmd,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.STDOUT,
                cwd=str(ms_dir),
                env=env,
            )
            stdout, _ = await asyncio.wait_for(proc.communicate(), timeout=120)
            output = stdout.decode(errors="replace")
            full_log += f"\n--- Pass {pass_num + 1} ---\n{output}"

            if proc.returncode != 0 and pass_num == 1:
                # Extract error lines from log
                for line in output.splitlines():
                    if line.startswith("!") or "Error" in line:
                        errors.append(line.strip())
        except FileNotFoundError:
            import sys

            if sys.platform == "win32":
                install_hint = "Install MiKTeX or TeX Live for Windows"
            else:
                install_hint = "apt install texlive-latex-base texlive-xetex texlive-luatex"
            return CompileResult(
                success=False,
                log=f"{latex_engine} not found. {install_hint}",
                errors=[f"{latex_engine} not installed"],
            )
        except TimeoutError:
            return CompileResult(
                success=False,
                log="Compilation timed out (120s limit)",
                errors=["Compilation timed out"],
            )

    # Check for PDF output
    stem = tex_path.stem
    pdf_in_build = build_dir / f"{stem}.pdf"

    if pdf_in_build.exists():
        # Move PDF to manuscript root (shutil.move works cross-platform, handles existing files)
        pdf_out = ms_dir / f"{stem}.pdf"
        shutil.move(str(pdf_in_build), str(pdf_out))
        return CompileResult(
            success=True,
            pdf_path=f"{stem}.pdf",
            log=full_log[-2000:],  # Trim log
            errors=errors,
        )

    return CompileResult(
        success=False,
        log=full_log[-2000:],
        errors=errors or ["PDF not generated"],
    )


@router.get("/{project_id}/pdf/{filename}")
async def get_pdf(request: Request, project_id: str, filename: str) -> None:
    """Serve a compiled PDF file."""
    from fastapi.responses import FileResponse

    if not re.match(r"^[\w.-]+\.pdf$", filename):
        raise HTTPException(status_code=400, detail="Invalid filename")

    ms_dir = _manuscript_dir(_get_pm(request), project_id)
    pdf_path = _safe_path(ms_dir, filename)

    if not pdf_path.exists():
        raise HTTPException(status_code=404, detail="PDF not found")

    return FileResponse(str(pdf_path), media_type="application/pdf")  # type: ignore[return-value]


# ── Version History ──────────────────────────────────


class VersionEntry(BaseModel):
    """A snapshot of a file at a point in time."""

    version: int
    timestamp: str
    size: int
    path: str


class DiffResult(BaseModel):
    """Diff between two file versions."""

    path: str
    version_a: int
    version_b: int
    diff: str


def _versions_dir(ms_dir: Path, rel_path: str) -> Path:
    """Get the versions directory for a file."""
    safe_name = rel_path.replace("/", "__").replace("\\", "__")
    return ms_dir / ".versions" / safe_name


@router.post("/{project_id}/snapshot")
async def create_snapshot(
    request: Request,
    project_id: str,
    body: WriteFileRequest,
) -> VersionEntry:
    """Create a versioned snapshot of a file's current content."""
    import shutil
    from datetime import datetime

    ms_dir = _manuscript_dir(_get_pm(request), project_id)
    file_path = _safe_path(ms_dir, body.path)

    if not file_path.exists():
        raise HTTPException(status_code=404, detail=f"File not found: {body.path}")

    ver_dir = _versions_dir(ms_dir, body.path)
    ver_dir.mkdir(parents=True, exist_ok=True)

    # Determine next version number
    existing = sorted(ver_dir.glob("v*.txt"), key=lambda p: p.name)
    next_ver = len(existing) + 1

    # Save snapshot
    snapshot_path = ver_dir / f"v{next_ver:04d}.txt"
    shutil.copy2(file_path, snapshot_path)

    return VersionEntry(
        version=next_ver,
        timestamp=datetime.now().isoformat(timespec="seconds"),
        size=snapshot_path.stat().st_size,
        path=body.path,
    )


@router.get("/{project_id}/versions")
async def list_versions(
    request: Request,
    project_id: str,
    path: str,
) -> list[VersionEntry]:
    """List all version snapshots for a file."""
    from datetime import datetime

    ms_dir = _manuscript_dir(_get_pm(request), project_id)
    _safe_path(ms_dir, path)  # validate

    ver_dir = _versions_dir(ms_dir, path)
    if not ver_dir.exists():
        return []

    entries: list[VersionEntry] = []
    for snap in sorted(ver_dir.glob("v*.txt")):
        ver_num = int(snap.stem[1:])
        stat = snap.stat()
        entries.append(VersionEntry(
            version=ver_num,
            timestamp=datetime.fromtimestamp(stat.st_mtime).isoformat(timespec="seconds"),
            size=stat.st_size,
            path=path,
        ))
    return entries


@router.get("/{project_id}/version-content")
async def get_version_content(
    request: Request,
    project_id: str,
    path: str,
    version: int,
) -> FileContent:
    """Get the content of a specific version snapshot."""
    ms_dir = _manuscript_dir(_get_pm(request), project_id)
    _safe_path(ms_dir, path)  # validate

    ver_dir = _versions_dir(ms_dir, path)
    snap_path = ver_dir / f"v{version:04d}.txt"
    if not snap_path.exists():
        raise HTTPException(status_code=404, detail=f"Version {version} not found")

    content = snap_path.read_text(encoding="utf-8")
    return FileContent(path=path, content=content, size=len(content))


@router.get("/{project_id}/diff")
async def diff_versions(
    request: Request,
    project_id: str,
    path: str,
    version_a: int,
    version_b: int,
) -> DiffResult:
    """Compute a unified diff between two versions of a file."""
    import difflib

    ms_dir = _manuscript_dir(_get_pm(request), project_id)
    _safe_path(ms_dir, path)  # validate

    ver_dir = _versions_dir(ms_dir, path)

    path_a = ver_dir / f"v{version_a:04d}.txt"
    path_b = ver_dir / f"v{version_b:04d}.txt"

    if not path_a.exists():
        raise HTTPException(status_code=404, detail=f"Version {version_a} not found")
    if not path_b.exists():
        raise HTTPException(status_code=404, detail=f"Version {version_b} not found")

    lines_a = path_a.read_text(encoding="utf-8").splitlines(keepends=True)
    lines_b = path_b.read_text(encoding="utf-8").splitlines(keepends=True)

    diff = "".join(difflib.unified_diff(
        lines_a, lines_b,
        fromfile=f"v{version_a}", tofile=f"v{version_b}",
    ))

    return DiffResult(
        path=path,
        version_a=version_a,
        version_b=version_b,
        diff=diff,
    )


# ── PDF Parsing ──────────────────────────────────────


class ParsedPaperResponse(BaseModel):
    """Summary of a parsed PDF paper."""

    title: str = ""
    authors: list[str] = []
    abstract: str = ""
    page_count: int = 0
    section_count: int = 0
    figure_count: int = 0
    summary: str = ""


@router.post("/{project_id}/parse-pdf")
async def parse_pdf(
    request: Request,
    project_id: str,
    path: str,
) -> ParsedPaperResponse:
    """Parse a PDF file in the manuscript directory and return structured content."""
    from openags.research.tools.pdf_parser import PDFParser

    ms_dir = _manuscript_dir(_get_pm(request), project_id)
    pdf_path = _safe_path(ms_dir, path)

    if not pdf_path.exists():
        raise HTTPException(status_code=404, detail=f"File not found: {path}")
    if pdf_path.suffix.lower() != ".pdf":
        raise HTTPException(status_code=400, detail="Only PDF files can be parsed")

    parser = PDFParser(output_dir=ms_dir)
    paper = parser.parse(pdf_path)
    summary = parser.summarize(paper)

    return ParsedPaperResponse(
        title=paper.title,
        authors=paper.authors,
        abstract=paper.abstract[:2000],
        page_count=paper.page_count,
        section_count=len(paper.sections),
        figure_count=len(paper.figures),
        summary=summary,
    )
