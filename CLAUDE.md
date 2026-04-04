# OpenAGS Development Guidelines

## Project Overview

OpenAGS (Open Autonomous Generalist Scientist) is an autonomous research framework that covers the full scientific workflow: literature review, proposal, experiments, manuscript writing, and peer review. It supports multiple CLI agent backends (Claude Code SDK, Codex SDK, Cursor CLI, Gemini CLI) and runs as a desktop app or standalone server.

## Architecture

TypeScript monorepo with two main packages:

```
packages/
├── app/                # @openags/app — Server + research tools
│   └── src/
│       ├── server.ts       # Express + WebSocket server
│       ├── schemas.ts      # Zod schemas (data validation)
│       ├── providers/      # CLI agent integrations
│       ├── research/       # Project management, tools
│       ├── routes/         # REST API endpoints
│       ├── workflow/       # Workflow orchestration
│       └── messaging/      # Telegram, Discord, Feishu
│
└── desktop/            # @openags/desktop — Electron + React UI
    └── src/
        ├── main/           # Electron shell
        ├── renderer/       # React SPA
        └── preload/

cli/                    # Future: openags-cli (Rust)
skills/                 # SOUL.md / SKILL.md files (language-agnostic)
```

### Key Files

- `packages/app/src/schemas.ts` — Zod schemas (single source of truth for types)
- `packages/app/src/server.ts` — Express + WebSocket server
- `packages/app/src/config.ts` — YAML config loading
- `packages/app/src/errors.ts` — Error class hierarchy
- `packages/app/src/research/project.ts` — Project CRUD
- `packages/app/src/providers/*.ts` — CLI agent integrations

## Code Standards

### TypeScript

- **Node.js >= 20** required
- **ESM modules** — use `.js` extension in imports
- **Type hints everywhere** — all function signatures, all variables where non-obvious
- **Zod** for all data structures that cross module boundaries
- **ESLint + Prettier** for formatting and linting

### Naming

- Files: `kebab-case.ts`
- Classes: `PascalCase`
- Functions/methods: `camelCase`
- Constants: `UPPER_SNAKE_CASE`
- Private: prefix with `_` (single underscore)

### Imports

```typescript
// Node.js built-ins
import * as fs from 'fs'
import * as path from 'path'

// Third-party
import express from 'express'
import { z } from 'zod'

// Local — always use .js extension for ESM
import { ProjectSchema } from './schemas.js'
import { loadConfig } from './config.js'
```

## Security Rules

1. **API keys**: Never log or print raw keys. Redact in config endpoints.
2. **File paths**: Validate all user-provided paths are within `workspace_dir`. Use `path.resolve()` and check prefix.
3. **Project IDs**: Must match `^[a-z0-9][a-z0-9_-]{1,62}[a-z0-9]$`. Enforced by Zod.
4. **Shell commands**: Never construct commands from LLM output via string concatenation. Use argument arrays.
5. **Config files**: Write with `mode: 0o600` (user-only read/write).
6. **Docker sandbox**: Always use `--network=none` and `--memory` limits.
7. **CORS**: Only allow localhost origins.
8. **WebSocket**: Bind to `127.0.0.1` only.

## Error Handling

- All custom exceptions extend `OpenAGSError` (in `errors.ts`)
- HTTP routes: Convert errors to status code + JSON body
- **Never use bare `catch`** — always catch specific types or rethrow
- All external calls (LLM, API, subprocess) must have timeouts

## Testing

- **Framework**: Vitest
- **Temp projects**: Use `tmp` fixture for directories
- **Naming**: `*.test.ts`
- Run: `pnpm test`

## Git Workflow

- Branch naming: `feat/description`, `fix/description`, `refactor/description`
- Commit messages: imperative mood, concise. e.g., "Add citation verification", "Fix memory file locking"
- Keep commits atomic — one logical change per commit

## Common Commands

```bash
# Development
pnpm install                              # Install dependencies
pnpm --filter @openags/app dev            # Server dev mode
pnpm --filter @openags/desktop dev        # Desktop dev mode

# Building
pnpm build                                # Build all packages

# Linting
pnpm lint                                 # Lint all packages
pnpm format                               # Format all packages
pnpm typecheck                            # Type check

# Testing
pnpm test                                 # Run all tests
```

## Do NOT

- Do not add dependencies without justification. Prefer Node.js built-ins when possible.
- Do not use `child_process.exec()` with untrusted input.
- Do not store secrets in code, git, or logs.
- Do not use `any` type — use proper generics or `unknown`.
- Do not add comments that restate the code. Only comment non-obvious logic.
- Do not add unused parameters, imports, or dead code.
