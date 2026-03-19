# OpenAGS Development Guidelines

## Project Overview

OpenAGS (Open Autonomous Generalist Scientist) is an autonomous research framework that covers the full scientific workflow: literature review, proposal, experiments, manuscript writing, and peer review. It supports multiple Agent backends (Claude Code, Codex, Copilot CLI, built-in litellm agent) and runs as CLI, web server, or Electron desktop app.

## Architecture

See `docs/02_architecture_design.md` for the full architecture document.

### Layered Architecture (strict dependency direction: top → bottom)

```
Layer 4: API Gateway     → openags/server/
Layer 3: Application     → openags/core/ (orchestrator, project, session)
Layer 2: Domain          → openags/agents/, openags/skills/
Layer 1: Infrastructure  → openags/backend/, openags/tools/, openags/messaging/, openags/experiment/, openags/logging/
Layer 0: External        → LLM APIs, arXiv, Docker, SSH, OS
```

**Rules**:
- Never import from a higher layer. Layer 1 must NOT import from Layer 2/3/4.
- All cross-module data passes through `openags/models.py` (Pydantic models).
- Layer 2 defines Protocols (interfaces). Layer 1 provides implementations.

### Key Files

- `openags/models.py` — All Pydantic data models (single source of truth)
- `openags/core/config.py` — Configuration loading (YAML + env vars)
- `openags/core/orchestrator.py` — Central orchestrator (request → agent → result)
- `openags/backend/protocol.py` — Backend Protocol (interface all backends implement)
- `openags/agents/base.py` — BaseAgent class
- `openags/main.py` — CLI entry point (typer)
- `openags/server/app.py` — FastAPI application factory

## Code Standards

### Python

- **Python >= 3.11** required
- **Type hints everywhere** — all function signatures, all variables where non-obvious
- **Pydantic v2** for all data structures that cross module boundaries
- **`from __future__ import annotations`** at top of every file
- **ruff** for formatting and linting
- **mypy --strict** for type checking

### Naming

- Files: `snake_case.py`
- Classes: `PascalCase`
- Functions/methods: `snake_case`
- Constants: `UPPER_SNAKE_CASE`
- Private: prefix with `_` (single underscore)

### Imports

```python
# Standard library
from __future__ import annotations
import asyncio
from pathlib import Path

# Third-party
from pydantic import BaseModel
from fastapi import APIRouter

# Local — always use absolute imports
from openags.models import Project, AgentRole
from openags.core.config import load_config
```

## Security Rules

1. **API keys**: Always use `SecretStr` in Pydantic models. Never log or print raw keys.
2. **File paths**: Validate all user-provided paths are within `workspace_dir`. Use `Path.resolve()` and check prefix.
3. **Project IDs**: Must match `^[a-z0-9][a-z0-9_-]{1,62}[a-z0-9]$`. Enforced by Pydantic.
4. **Shell commands**: Never construct commands from LLM output via string concatenation. Use `subprocess` with argument lists.
5. **Config files**: Write with `chmod 0o600` (user-only read/write).
6. **Docker sandbox**: Always use `--network=none` and `--memory` limits.
7. **CORS**: Only allow localhost origins.
8. **WebSocket**: Bind to `127.0.0.1` only.

## Error Handling

- All custom exceptions inherit from `OpenAGSError` (defined in `openags/core/errors.py`)
- Layer 1: Catch external exceptions → raise `OpenAGSError` subclass
- Layer 2: Only raise `OpenAGSError` subclasses
- Layer 3: Catch and decide: retry / fallback / propagate
- Layer 4: Convert to HTTP status code + JSON error body
- **Never use bare `except:`** — always catch specific exceptions
- All external calls (LLM, API, subprocess) must have timeouts

## Testing

- **Framework**: pytest + pytest-asyncio
- **Mock Backend**: Use `MockBackend` from `tests/conftest.py` — never call real LLM in unit tests
- **Temp projects**: Use `tmp_path` fixture for project directories
- **Naming**: `test_{module}/test_{feature}.py::test_{scenario}`
- Run: `uv run pytest tests/ -v`

## Git Workflow

- Branch naming: `feat/description`, `fix/description`, `refactor/description`
- Commit messages: imperative mood, concise. e.g., "Add citation verification", "Fix memory file locking"
- Keep commits atomic — one logical change per commit

## Common Commands

```bash
# Development
uv sync                          # Install dependencies
uv run openags --help            # CLI help
uv run openags init my-project   # Create project
uv run openags chat -p my-project # Interactive chat
uv run openags serve             # Start API server

# Testing
uv run pytest tests/ -v          # Run all tests
uv run pytest tests/test_core/ -v # Run core tests only

# Linting
uv run ruff check openags/       # Lint
uv run ruff format openags/      # Format
uv run mypy openags/ --strict    # Type check

# Desktop (when implemented)
cd desktop && pnpm install && pnpm dev   # Dev mode
cd desktop && pnpm build                 # Build
```

## Do NOT

- Do not add dependencies without justification. Prefer stdlib when possible.
- Do not use `os.system()` or `subprocess.run(shell=True)` with untrusted input.
- Do not store secrets in code, git, or logs.
- Do not import from higher architectural layers.
- Do not create circular imports — if needed, move shared types to `models.py`.
- Do not use `Any` type — use proper generics or `object`.
- Do not add comments that restate the code. Only comment non-obvious logic.
- Do not add unused parameters, imports, or dead code.
