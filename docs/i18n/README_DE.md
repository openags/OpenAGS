<div align="center">

# OpenAGS

**Offener Autonomer Generalist-Wissenschaftler**

Ein Open-Source-Framework für vollständig autonome wissenschaftliche Forschung — von der Literaturrecherche bis zur Manuskripterstellung.

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Python 3.11+](https://img.shields.io/badge/Python-3.11+-3776ab.svg)](https://python.org)
[![Node.js 18+](https://img.shields.io/badge/Node.js-18+-339933.svg)](https://nodejs.org)

[Schnellstart](#schnellstart) &bull; [Architektur](#architektur) &bull; [Dokumentation](../architecture.md) &bull; [Zitation](#zitation)

[English](../../README.md) | [中文](ZH.md) | [日本語](JA.md) | [Français](FR.md) | Deutsch | [العربية](AR.md)

</div>

---

OpenAGS orchestriert ein Team von KI-Agenten, die über den gesamten Forschungslebenszyklus zusammenarbeiten — Literaturrecherche, Hypothesengenerierung, Experimente, Manuskripterstellung und Peer-Review. Ein Framework, End-to-End, vollständig autonom.

<div align="center">
  <img src="../images/OpenAGS-Desktop1.jpg" alt="OpenAGS Desktop">
  <br>
  <sub>OpenAGS Desktop — Multi-Agenten-Forschungsarbeitsplatz mit integriertem LaTeX-Editor</sub>
</div>

---

## Schnellstart

### Installation

```bash
git clone https://github.com/openags/OpenAGS.git
cd OpenAGS
uv sync
```

LLM-Anbieter konfigurieren:

```bash
uv run openags config default_backend.model deepseek/deepseek-chat
uv run openags config default_backend.api_key sk-your-key
```

### Starten

```bash
# Desktop-App (Electron)
cd desktop && pnpm install && pnpm dev

# Browser-Modus (kein Electron erforderlich)
cd desktop && pnpm build && pnpm serve    # → http://localhost:3001

# Nur CLI
uv run openags init my-project --name "Meine Forschung"
uv run openags chat my-project
```

---

## Architektur

```
React UI (Browser + Electron)
    ↓ WebSocket + HTTP
Node.js Server (Express)
  /chat  → Claude SDK, Codex SDK, Cursor CLI, Gemini CLI
  /shell → PTY Terminal (node-pty)
  /api/* → Proxy zum Python-Backend
    ↓ HTTP
Python Backend (FastAPI)
  Orchestrator → Agent-Schleife → Fähigkeiten → Werkzeuge → Gedächtnis
    ↓
Externe Dienste: LLM APIs, arXiv, Semantic Scholar, Docker, SSH
```

## Unterstützte Anbieter

**LLM (über LiteLLM — 100+ unterstützt)**: DeepSeek, OpenAI, Anthropic, Google, OpenRouter, Ollama, u.a.

**CLI Agent Backends**: Claude Code, Codex, Cursor, Gemini CLI

---

## Star History

<div align="center">

[![Star History Chart](https://api.star-history.com/svg?repos=openags/OpenAGS&type=Date)](https://star-history.com/#openags/OpenAGS&Date)

</div>

## Zitation

```bibtex
@article{zhang2025scaling,
  title   = {Scaling Laws in Scientific Discovery with AI and Robot Scientists},
  author  = {Zhang, Pengsong and Zhang, Heng and Xu, Huazhe and Xu, Renjun and
             Wang, Zhenting and Wang, Cong and Garg, Animesh and Li, Zhibin and
             Ajoudani, Arash and Liu, Xinyu},
  journal = {arXiv preprint arXiv:2503.22444},
  year    = {2025}
}
```

## Lizenz

[MIT](LICENSE)
