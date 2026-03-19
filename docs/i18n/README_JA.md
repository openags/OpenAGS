<div align="center">

# OpenAGS

**オープン自律型汎用科学者**

完全自律型の科学研究のためのオープンソースフレームワーク — 文献レビューから論文執筆まで。

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Python 3.11+](https://img.shields.io/badge/Python-3.11+-3776ab.svg)](https://python.org)
[![Node.js 18+](https://img.shields.io/badge/Node.js-18+-339933.svg)](https://nodejs.org)

[クイックスタート](#クイックスタート) &bull; [アーキテクチャ](#アーキテクチャ) &bull; [ドキュメント](../architecture.md) &bull; [引用](#引用)

[English](../../README.md) | [中文](ZH.md) | 日本語 | [Français](FR.md) | [Deutsch](DE.md) | [العربية](AR.md)

</div>

---

OpenAGS は、研究のライフサイクル全体を協力して行う AI エージェントチームを編成します — 文献レビュー、仮説生成、実験、論文執筆、査読。一つのフレームワークで、エンドツーエンド、完全自律。

<div align="center">
  <img src="../images/OpenAGS-Desktop1.jpg" alt="OpenAGS Desktop">
  <br>
  <sub>OpenAGS Desktop — LaTeX エディタ統合のマルチエージェント研究ワークスペース</sub>
</div>

---

## クイックスタート

### インストール

```bash
git clone https://github.com/openags/OpenAGS.git
cd OpenAGS
uv sync
```

LLM プロバイダーの設定：

```bash
uv run openags config default_backend.model deepseek/deepseek-chat
uv run openags config default_backend.api_key sk-your-key
```

### 起動

```bash
# デスクトップアプリ (Electron)
cd desktop && pnpm install && pnpm dev

# ブラウザモード（Electron 不要）
cd desktop && pnpm build && pnpm serve    # → http://localhost:3001

# CLI のみ
uv run openags init my-project --name "My Research"
uv run openags chat my-project
```

---

## アーキテクチャ

```
React UI（ブラウザ + Electron）
    ↓ WebSocket + HTTP
Node.js サーバー（Express）
  /chat  → Claude SDK, Codex SDK, Cursor CLI, Gemini CLI
  /shell → PTY ターミナル (node-pty)
  /api/* → Python バックエンドへプロキシ
    ↓ HTTP
Python バックエンド（FastAPI）
  オーケストレーター → エージェントループ → スキル → ツール → メモリ
    ↓
外部サービス：LLM API, arXiv, Semantic Scholar, Docker, SSH
```

## 対応プロバイダー

**LLM（LiteLLM 経由、100以上対応）**：DeepSeek、OpenAI、Anthropic、Google、OpenRouter、Ollama など

**CLI エージェントバックエンド**：Claude Code、Codex、Cursor、Gemini CLI

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

## ライセンス

[MIT](LICENSE)
