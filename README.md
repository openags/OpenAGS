<div align="center">

# OpenAGS

**Open Autonomous Generalist Scientist**

An open-source framework for fully autonomous scientific research — from literature review to manuscript writing.

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Node.js 20+](https://img.shields.io/badge/Node.js-20+-339933.svg)](https://nodejs.org)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.6+-3178c6.svg)](https://typescriptlang.org)

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
| Node.js | >= 20 | Server & UI |
| pnpm | >= 9 | Package manager |
| TeX Live / BasicTeX | any | LaTeX compilation (optional) |
| Docker | any | Sandboxed experiments (optional) |
| Rust | >= 1.75 | CLI agent (optional, for development) |

### Install

```bash
git clone https://github.com/openags/OpenAGS.git
cd OpenAGS
pnpm install
pnpm build
```

### Launch

**Desktop app (Electron window + server):**

```bash
cd packages/desktop
npx electron-vite dev
```

This starts the server on `http://127.0.0.1:19836` and opens an Electron window. On first launch, create an account from the login screen, then create a research project from the dashboard.

**Server only (browser mode — no Electron):**

```bash
pnpm --filter @openags/app dev    # → http://127.0.0.1:19836
```

Open `http://127.0.0.1:19836` in your browser.

**Production build:**

```bash
pnpm build
cd packages/app && node dist/index.js   # → http://127.0.0.1:19836
```

---

## Architecture

```
┌────────────────────────────────────────────────────────────────┐
│  React UI (browser + Electron)                                  │
│  Chat │ Terminal (xterm.js) │ Manuscript Editor │ Settings       │
└──────────────────────┬─────────────────────────────────────────┘
                       │ WebSocket + HTTP
┌──────────────────────▼─────────────────────────────────────────┐
│  Node.js Server (@openags/app)                                  │
│  /chat     → Claude SDK, Codex SDK, Cursor CLI, Gemini CLI      │
│  /shell    → PTY Terminal (node-pty)                            │
│  /workflow → Workflow Orchestrator                               │
│  /api/*    → REST API (projects, research, config, skills)      │
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
├── packages/
│   ├── app/                       # @openags/app — Application server
│   │   ├── src/
│   │   │   ├── index.ts           #   Entry point
│   │   │   ├── server.ts          #   Express + WebSocket server
│   │   │   ├── schemas.ts         #   Zod schemas (data validation)
│   │   │   ├── config.ts          #   YAML config loading
│   │   │   ├── errors.ts          #   Error class hierarchy
│   │   │   ├── providers/         #   CLI agent integrations
│   │   │   │   ├── claude-sdk.ts  #     @anthropic-ai/claude-agent-sdk
│   │   │   │   ├── codex-sdk.ts   #     @openai/codex-sdk
│   │   │   │   ├── cursor-cli.ts  #     subprocess + stream-json
│   │   │   │   └── gemini-cli.ts  #     subprocess + stream-json
│   │   │   ├── research/          #   Research tools
│   │   │   │   ├── project.ts     #     Project CRUD
│   │   │   │   ├── experiment.ts  #     Docker sandbox (dockerode)
│   │   │   │   ├── ssh.ts         #     SSH execution (ssh2)
│   │   │   │   └── tools/         #     arXiv, Semantic Scholar, citations
│   │   │   ├── routes/            #   REST API endpoints
│   │   │   ├── workflow/          #   Workflow orchestration
│   │   │   └── messaging/         #   Telegram, Discord, Feishu
│   │   └── package.json
│   │
│   └── desktop/                   # @openags/desktop — Electron + React UI
│       ├── src/
│       │   ├── main/              #   Electron shell
│       │   ├── renderer/          #   React SPA
│       │   └── preload/
│       └── package.json
│
├── cli/                           # openags-cli (Rust, future)
│   ├── Cargo.toml
│   └── src/main.rs
│
├── skills/                        # Skill definitions (SKILL.md format)
│   ├── search-papers/SKILL.md
│   ├── verify-citations/SKILL.md
│   └── agents/                    #   Agent SOUL.md templates
│
├── docs/                          # Documentation
├── pnpm-workspace.yaml            # Monorepo workspace config
├── turbo.json                     # Turborepo build config
└── package.json                   # Root workspace
```

---

## Configuration

Stored at `~/.openags/config.yaml`:

```yaml
# Server settings
workspace_dir: ~/.openags/projects
log_level: info

# API keys (for direct LLM access)
anthropic_api_key: sk-ant-xxx
openai_api_key: sk-xxx
gemini_api_key: xxx

# Experiment sandbox
experiment_sandbox: docker        # local | docker | remote

# Remote servers (for GPU experiments)
remote_servers:
  - name: gpu-server
    host: 10.0.1.50
    user: research
    key_file: ~/.ssh/id_rsa
    gpus: [0, 1, 2, 3]

# Messaging notifications
telegram:
  bot_token: xxx
  chat_id: xxx
discord:
  webhook_url: https://discord.com/api/webhooks/xxx
```

All settings are also configurable from the UI (Settings page).

## Supported Providers

<details>
<summary><b>CLI Agent Backends</b></summary>

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
# Install dependencies
pnpm install

# Development mode
pnpm --filter @openags/app dev          # Server only (http://127.0.0.1:19836)
cd packages/desktop && npx electron-vite dev  # Desktop app (Electron + React)

# Build all packages
pnpm build

# Lint
pnpm lint

# Type check
pnpm typecheck

# Run tests
pnpm test
```

### Building the Rust CLI (optional)

```bash
cd cli
cargo build --release
# Binary at: target/release/openags
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