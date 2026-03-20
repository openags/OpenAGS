<div align="center">

# OpenAGS

**Open Autonomous Generalist Scientist**

An open-source framework for fully autonomous scientific research — from literature review to manuscript writing.

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Python 3.11+](https://img.shields.io/badge/Python-3.11+-3776ab.svg)](https://python.org)
[![Node.js 18+](https://img.shields.io/badge/Node.js-18+-339933.svg)](https://nodejs.org)

[Getting Started](#quick-start) &bull; [Architecture](#architecture) &bull; [Documentation](docs/architecture.md) &bull; [Citation](#citation)

English | [中文](docs/i18n/README_ZH.md) | [日本語](docs/i18n/README_JA.md) | [Français](docs/i18n/README_FR.md) | [Deutsch](docs/i18n/README_DE.md) | [العربية](docs/i18n/README_AR.md)

</div>

---

OpenAGS orchestrates a team of AI agents that collaborate across the full research lifecycle — literature review, hypothesis generation, experiments, manuscript writing, and peer review. One framework, end-to-end, fully autonomous.

<div align="center">
  <img src="docs/images/OpenAGS-Desktop1.jpg" alt="OpenAGS Desktop">
  <br>
  <sub>OpenAGS Desktop — Multi-agent research workspace with integrated LaTeX editor</sub>
</div>

<br>

<div align="center">
  <img src="docs/images/ags_framework.jpg" alt="AGS Framework">
  <br>
  <sub>Autonomous Generalist Scientist — Framework and Vision</sub>
</div>

---

## Quick Start

### Prerequisites

| Dependency | Version | Required For |
|------------|---------|-------------|
| Python | >= 3.11 | Backend |
| [uv](https://docs.astral.sh/uv/) | latest | Python package manager |
| Node.js | >= 18 | UI (Desktop / Browser) |
| pnpm | >= 8 | UI (Desktop / Browser) |
| TeX Live / BasicTeX | any | LaTeX compilation (optional) |

### Install

```bash
git clone https://github.com/openags/OpenAGS.git
cd OpenAGS
uv sync
```

Configure your LLM provider:

```bash
# DeepSeek (recommended for cost efficiency)
uv run openags config default_backend.model deepseek/deepseek-chat
uv run openags config default_backend.api_key sk-your-key

# Or: OpenAI, Anthropic, Google, Ollama, OpenRouter, etc.
```

### Launch

```bash
# Desktop app (Electron)
cd desktop && pnpm install && pnpm dev

# Browser mode (no Electron required)
cd desktop && pnpm build && pnpm serve    # → http://localhost:3001

# CLI only
uv run openags init my-project --name "My Research"
uv run openags chat my-project
```

The desktop app starts the Python backend automatically.

---

## Architecture

```
┌────────────────────────────────────────────────────────────────┐
│  React UI (browser + Electron)                                  │
│  Chat │ Terminal (xterm.js) │ Manuscript Editor │ Settings       │
└──────────────────────┬─────────────────────────────────────────┘
                       │ WebSocket + HTTP
┌──────────────────────▼─────────────────────────────────────────┐
│  Node.js Server (Express)                                       │
│  /chat  → Claude SDK, Codex SDK, Cursor CLI, Gemini CLI         │
│  /shell → PTY Terminal (node-pty)                                │
│  /api/* → Proxy to Python backend                                │
└──────────────────────┬─────────────────────────────────────────┘
                       │ HTTP
┌──────────────────────▼─────────────────────────────────────────┐
│  Python Backend (FastAPI)                                        │
│  Orchestrator → Agent Loop → Skills → Tools → Memory             │
│  Projects, Sessions, Experiments, Manuscript, GPU, Config         │
└──────────────────────┬─────────────────────────────────────────┘
                       │
┌──────────────────────▼─────────────────────────────────────────┐
│  External Services                                               │
│  LLM APIs │ arXiv │ Semantic Scholar │ Docker │ SSH │ OS          │
└────────────────────────────────────────────────────────────────┘
```

## Project Structure

```
OpenAGS/
│
├── openags/                       # Python package
│   ├── agent/                     # Agent engine (standalone, zero dependency on research/)
│   │   ├── loop.py                #   Agent class — step() / loop()
│   │   ├── llm.py                 #   LLM transport (litellm)
│   │   ├── memory.py              #   Dual-layer memory (memory.md + history.md)
│   │   ├── session.py             #   Session persistence (JSONL)
│   │   ├── soul.py                #   SOUL.md parser
│   │   ├── skills/                #   Skill engine (SKILL.md, Claude Code compatible)
│   │   └── tools/                 #   Tool registry (read, write, bash, sub_agent, mcp, ...)
│   │
│   ├── research/                  # Research application layer
│   │   ├── orchestrator.py        #   Central orchestrator (builtin agent only)
│   │   ├── adapter.py             #   SOUL.md → CLAUDE.md / AGENTS.md sync
│   │   ├── project.py             #   Project CRUD
│   │   ├── templates.py           #   Project templates (with upstream dependency prompts)
│   │   ├── config.py              #   Config loading / saving
│   │   ├── backend/               #   RuntimeRouter (builtin LLMBackend)
│   │   ├── experiment/            #   Sandbox (Local / Docker / SSH) + auto-fix engine
│   │   ├── server/routes/         #   FastAPI routes (15 route modules)
│   │   ├── tools/                 #   Research tools (arXiv, Semantic Scholar, GPU, ...)
│   │   └── messaging/             #   IM notifications (Telegram, Discord, Feishu)
│   │
│   ├── models.py                  # Shared Pydantic models
│   └── main.py                    # CLI entry point (Typer)
│
├── desktop/                       # Node.js server + React frontend
│   ├── src/main/
│   │   ├── server.ts              #   Express + WebSocket (PTY, Chat, API proxy)
│   │   ├── index.ts               #   Entry point (--serve for browser, or Electron)
│   │   ├── python-backend.ts      #   Python backend lifecycle
│   │   └── providers/             #   CLI agent integrations
│   │       ├── claude-sdk.ts      #     @anthropic-ai/claude-agent-sdk
│   │       ├── codex-sdk.ts       #     @openai/codex-sdk
│   │       ├── cursor-cli.ts      #     subprocess + stream-json
│   │       ├── gemini-cli.ts      #     subprocess + stream-json + session ID mapping
│   │       └── adapter.ts         #     Config sync + skill symlinks
│   │
│   └── src/renderer/              # React UI (shared by browser + Electron)
│       ├── pages/
│       │   ├── Project.tsx        #   Main workspace (Chat + Terminal + Manuscript)
│       │   ├── Settings.tsx       #   Backend, API keys, Compute & Servers
│       │   └── Dashboard.tsx      #   Project overview
│       ├── components/
│       │   ├── TerminalPanel.tsx   #   Embedded terminal (xterm.js + WebSocket)
│       │   ├── ManuscriptEditor.tsx#   LaTeX editor + PDF compiler
│       │   └── ProjectConfig.tsx  #   Per-project settings (compute, GPU, timeout)
│       └── services/
│           ├── api.ts             #   REST client (relative URLs, proxied)
│           ├── ws.ts              #   WebSocket client
│           └── chat_threads.ts    #   Chat persistence (localStorage + providerSessionId)
│
├── skills/                        # Skill definitions (SKILL.md format)
│   ├── search-papers/SKILL.md     #   Paper search skill
│   ├── verify-citations/SKILL.md  #   Citation verification
│   ├── research-workflow/SKILL.md #   Research pipeline
│   └── agents/                    #   Default agent SOUL.md templates
│
├── tests/                         # pytest test suite (330+ tests)
├── docs/                          # Architecture docs + images
└── pyproject.toml                 # Python project metadata
```

---

## Configuration

Stored at `~/.openags/config.yaml`:

```yaml
default_backend:
  type: builtin                    # builtin | claude_code | codex | gemini_cli
  model: deepseek/deepseek-chat    # any LiteLLM model
  api_key: sk-xxx
  timeout: 300

experiment_sandbox: local          # local | docker | remote
remote_servers:
  - name: gpu-server
    host: 10.0.1.50
    user: research
    key_file: ~/.ssh/id_rsa
    gpus: [0, 1, 2, 3]
```

All settings are also configurable from the UI (Settings page + Project Config).

## Supported Providers

<details>
<summary><b>LLM Providers (via LiteLLM — 100+ supported)</b></summary>

| Provider | Models | Prefix |
|----------|--------|--------|
| DeepSeek | `deepseek/deepseek-chat`, `deepseek/deepseek-reasoner` | `deepseek/` |
| OpenAI | `gpt-4o`, `gpt-4o-mini`, `o3-mini` | — |
| Anthropic | `claude-sonnet-4-6`, `claude-opus-4-6` | — |
| Google | `gemini-2.5-pro`, `gemini-2.0-flash` | — |
| OpenRouter | `openrouter/auto` | `openrouter/` |
| Ollama | `ollama/llama3`, `ollama/qwen2` | `ollama/` |

</details>

<details>
<summary><b>CLI Agent Backends (via Node.js SDK/subprocess)</b></summary>

| Backend | Integration | Session Resume |
|---------|------------|----------------|
| Claude Code | `@anthropic-ai/claude-agent-sdk` | `--resume sessionId` |
| Codex | `@openai/codex-sdk` | `codex resume sessionId` |
| Cursor | subprocess + `stream-json` | `--resume=sessionId` |
| Gemini CLI | subprocess + `stream-json` | `--resume cliSessionId` |

</details>

---

## Development

```bash
# Python
uv sync                              # install dependencies
uv run pytest tests/ -v              # run tests (330+)
uv run ruff check openags/           # lint
uv run ruff format openags/          # format

# Desktop
cd desktop
pnpm install && pnpm dev             # dev mode with hot-reload
pnpm build                           # production build
```

---

## Star History

<div align="center">

[![Star History Chart](https://api.star-history.com/svg?repos=openags/OpenAGS&type=Date)](https://star-history.com/#openags/OpenAGS&Date)

</div>

## Citation

If you use OpenAGS in your research, please cite:

```bibtex
@article{zhang2025scaling,
  title   = {Scaling Laws in Scientific Discovery with AI and Robot Scientists},
  author  = {Zhang, Pengsong and Zhang, Heng and Xu, Huazhe and Xu, Renjun and
             Wang, Zhenting and Wang, Cong and Garg, Animesh and Li, Zhibin and
             Ajoudani, Arash and Liu, Xinyu},
  journal = {arXiv preprint arXiv:2503.22444},
  year    = {2025}
}

@article{zhangautonomous,
  title   = {Autonomous Generalist Scientist: Towards and Beyond Human-Level
             Scientific Research with Agentic and Embodied AI and Robots},
  author  = {Zhang, Pengsong and Zhang, Heng and Xu, Huazhe and Xu, Renjun and
             Wang, Zhenting and Wang, Cong and Garg, Animesh and Li, Zhibin and
             Liu, Xinyu and Ajoudani, Arash},
  journal = {ResearchGate preprint RG.2.2.35148.01923},
  year    = {2024}
}
```

## License

[MIT](LICENSE)