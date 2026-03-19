<div align="center">

# OpenAGS

**开放自主通用科学家**

开源全自主科研框架 — 从文献综述到论文撰写。

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Python 3.11+](https://img.shields.io/badge/Python-3.11+-3776ab.svg)](https://python.org)
[![Node.js 18+](https://img.shields.io/badge/Node.js-18+-339933.svg)](https://nodejs.org)

[快速开始](#快速开始) &bull; [架构](#架构) &bull; [文档](../architecture.md) &bull; [引用](#引用)

[English](../../README.md) | 中文 | [日本語](JA.md) | [Français](FR.md) | [Deutsch](DE.md) | [العربية](AR.md)

</div>

---

OpenAGS 编排一组 AI 智能体，协同完成整个科研流程 — 文献综述、假设生成、实验设计、论文撰写和同行评审。一个框架，端到端，全自主。

<div align="center">
  <img src="../images/OpenAGS-Desktop1.jpg" alt="OpenAGS Desktop">
  <br>
  <sub>OpenAGS Desktop — 多智能体科研工作空间，集成 LaTeX 编辑器</sub>
</div>

---

## 快速开始

### 安装

```bash
git clone https://github.com/openags/OpenAGS.git
cd OpenAGS
uv sync
```

配置 LLM 提供商：

```bash
uv run openags config default_backend.model deepseek/deepseek-chat
uv run openags config default_backend.api_key sk-your-key
```

### 启动

```bash
# 桌面应用 (Electron)
cd desktop && pnpm install && pnpm dev

# 浏览器模式（无需 Electron）
cd desktop && pnpm build && pnpm serve    # → http://localhost:3001

# 仅 CLI
uv run openags init my-project --name "我的研究"
uv run openags chat my-project
```

---

## 架构

```
React UI（浏览器 + Electron）
    ↓ WebSocket + HTTP
Node.js 服务器（Express）
  /chat  → Claude SDK, Codex SDK, Cursor CLI, Gemini CLI
  /shell → PTY 终端 (node-pty)
  /api/* → 代理到 Python 后端
    ↓ HTTP
Python 后端（FastAPI）
  编排器 → Agent 循环 → 技能 → 工具 → 记忆
    ↓
外部服务：LLM API, arXiv, Semantic Scholar, Docker, SSH
```

## 支持的提供商

**LLM（通过 LiteLLM，100+ 支持）**：DeepSeek、OpenAI、Anthropic、Google、OpenRouter、Ollama 等

**CLI Agent 后端**：Claude Code、Codex、Cursor、Gemini CLI

---

## Star History

<div align="center">

[![Star History Chart](https://api.star-history.com/svg?repos=openags/OpenAGS&type=Date)](https://star-history.com/#openags/OpenAGS&Date)

</div>

## 引用

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

## 许可证

[MIT](LICENSE)
