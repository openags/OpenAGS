# OpenAGS Architecture

## 总体设计

OpenAGS = **Agent 引擎** + **科研应用层** + **统一 UI 服务**，三层解耦。

```
openags/
  agent/       ← 通用 Agent 引擎（独立项目，对 research/ 零依赖）
  research/    ← 科研项目管理（依赖 agent/，builtin agent 执行）
  models.py    ← 共享数据契约（Pydantic 模型）
  main.py      ← CLI 入口

desktop/       ← Node.js 服务 + React 前端 + 可选 Electron 桌面壳
  src/main/
    server.ts       ← Express + WebSocket 服务（PTY 终端、Provider Chat、API 代理）
    providers/      ← CLI Agent SDK 集成（Claude Code、Codex、Cursor、Gemini）
  src/renderer/     ← React 前端（浏览器和 Electron 通用）
```

- `agent/` 是一个完整的、自包含的 Agent。LLM 调用是它的内部实现。
- `research/` 是科研项目管理。只管 builtin agent（litellm-based）。
- `desktop/` 管所有 CLI agent（Claude Code SDK、Codex SDK 等）+ PTY 终端 + 前端。

---

## 核心概念：Folder = Agent

> **每个文件夹就是一个独立的智能体。**
> SOUL.md 定义它是谁，Skills 定义它能做什么，目录内容就是它的工作空间。

```
my-research/                      ← 根 agent（Coordinator / PI）
  SOUL.md                          ← 角色定义 + 配置（builtin agent 用）
  CLAUDE.md                        ← 项目通用信息（Claude Code 层级加载）
  skills/                          ← 项目级技能（SKILL.md 格式）
  memory.md                        ← 项目全局记忆
  .openags/history.md              ← 操作时间线（append-only）

  literature/                      ← 文献 agent
    SOUL.md                        ← 角色定义（builtin 用）
    CLAUDE.md / AGENTS.md / GEMINI.md  ← 自动同步，各 CLI agent 用
    skills/                        ← 模块级技能
      paper-search/SKILL.md        ← Claude Code 兼容格式
    .claude/skills/                ← symlink → ../skills/*（Claude Code 自动发现）
    memory.md, notes/, papers/

  experiments/                     ← 实验 agent
    SOUL.md, CLAUDE.md
    skills/run-experiment/SKILL.md
    code/, data/, results/

  manuscript/                      ← 写作 agent
    SOUL.md, CLAUDE.md
    main.tex, references.bib

  任意目录/                        ← 放 SOUL.md 就是新 agent
    SOUL.md
```

关键特性：
1. **零代码创建** — 建目录 + 放 SOUL.md 即可
2. **流程由配置定义** — 工作流写在 SOUL.md 和 Skills 里，不在代码里
3. **Runtime 可替换** — 同一个文件夹，可以用 builtin agent、Claude Code、Codex 跑
4. **上下游固化** — 每个 agent 的 SOUL.md 明确指定上游数据源路径

---

## 两条执行路径

### 路径 1: OpenAGS Builtin Agent（Python 后端）

```
用户在 Chat 输入消息
  → HTTP POST /api/agents/{project}/chat
  → Python Orchestrator
    → 读 SOUL.md → 创建 Agent
    → Agent.loop(task)
        → 加载 Skills / Memory
        → 调 LLM（litellm，支持 OpenAI/Anthropic/DeepSeek/...）
        → LLM 返回 tool_calls → 执行工具 → 结果回消息历史
        → 循环直到完成
  → 返回结果
```

### 路径 2: CLI Agent（Node.js 服务端）

```
用户在 Chat 输入消息
  → WebSocket /chat
  → Node.js server (server.ts)
    → 根据 provider 路由到：
      ├─ claude-sdk.ts  → @anthropic-ai/claude-agent-sdk（SDK 直接调用）
      ├─ codex-sdk.ts   → @openai/codex-sdk（SDK 直接调用）
      ├─ cursor-cli.ts  → 子进程 + --output-format stream-json
      └─ gemini-cli.ts  → 子进程 + --output-format stream-json
    → 结构化消息流 → WebSocket → Chat Bubbles
```

**CLI agent 完全由 Node.js 管理，Python 后端不参与。**

### 配置同步

所有配置文件保持同步，只需维护一份，切换 backend 零开销：

```
SOUL.md ←→ CLAUDE.md ←→ AGENTS.md ←→ GEMINI.md
         自动同步（比较 mtime，最新的为准）
```

触发时机：新建项目 / 切换后端 / 编辑配置（不在每条消息时触发）。

### Skill 发现

Skills 使用 Claude Code 兼容的目录格式（`skill-name/SKILL.md`），通过 symlink 让各 backend 都能发现：

```
literature/skills/paper-search/SKILL.md     ← 真实文件
literature/.claude/skills/paper-search →    ← symlink（Claude Code 自动发现）
```

OpenAGS SkillEngine 和 Claude Code 读同一份 SKILL.md，frontmatter 字段兼容两者：

```yaml
---
name: paper-search
description: Search for academic papers
roles: [literature, coordinator]          # OpenAGS 字段
triggers: ["search papers", "arxiv"]      # OpenAGS 字段
allowed-tools: Read, Write, Bash(curl *)  # Claude Code 字段
---
```

---

## 会话管理

每个 Chat 对话对应一个独立的 provider session：

```
Thread（UI 层）
  ├── id: thread-xxx
  ├── title: "搜索论文"
  ├── messages: [...]                ← localStorage 持久化（显示用）
  ├── sessionId: "abc"               ← builtin backend session
  └── providerSessionId: "def"       ← Claude Code session ID（resume 用）
```

- **新建 Chat** → 不传 sessionId → provider 创建新 session → 保存 providerSessionId
- **切换 Chat** → 读取该 thread 的 providerSessionId → resume 到对应 session
- **重启** → localStorage 恢复聊天记录 + providerSessionId 恢复 session

---

## 统一 UI 服务

Desktop 不是 Electron 专属，是一个 **Node.js HTTP + WebSocket 服务**：

```
Node.js Server (port 3001)
├── HTTP
│   ├── /api/*        → 代理到 Python 后端 (:19836)
│   ├── /*            → React 静态文件（SPA）
│
├── WebSocket
│   ├── /chat         → Provider Chat（Claude SDK / Codex SDK / Cursor / Gemini）
│   ├── /shell        → PTY 终端（node-pty）
│   └── /ws/*         → 代理到 Python WebSocket
│
├── 访问方式
│   ├── 浏览器: http://localhost:3001
│   └── Electron: BrowserWindow.loadURL(同一个地址)
```

**同一套代码，浏览器和桌面都能用。无 IPC，全走 WebSocket。**

### PTY 终端

```
前端点击终端图标
  → WebSocket /shell → { type: 'init', id, cwd }
  → server.ts: pty.spawn(shell, { cwd })
  → PTY 输出 → buffer + WebSocket → xterm.js 渲染
  → 断连后保活 30 分钟（claudecodeui 同款）
  → 再次连接 → replay buffer
```

终端是独立的普通 shell，不自动启动 CLI agent。用户可以手动在里面运行任何命令。

### Chat UI 布局

```
非 manuscript 区域（CLI 模式）：
┌─────────────────────────────────┐
│  Header: Project > Section [>_] │  ← [>_] 终端图标
├─────────────────────────────────┤
│  Chat Bubbles（主交互界面）      │
│  User: 搜索论文                  │
│  Agent: > Tool: Read...done     │
│  Agent: 找到 5 篇论文...         │
│  ┌───────────── [📎] [发送] ──┐ │
│  │ 输入框                      │ │
│  └─────────────────────────────┘ │
└─────────────────────────────────┘

manuscript 区域：
┌─────────────────────────────────┐
│  ManuscriptEditor（文件浏览+编辑）│
│  main.tex 编辑 + PDF 预览        │
├── Chat Panel (可折叠, 可拖拽) ──┤
│  Chat 对话（走 CLI 或 builtin）   │
│  ┌──────────────────── [发送] ──┐│
│  │ 输入框                       ││
│  └──────────────────────────────┘│
└─────────────────────────────────┘
```

---

## Agent 间通信：文件就是通信机制

**不需要消息队列、事件回调、代码触发。文件系统就是最好的通信层。**

每个 agent 的 SOUL.md 固化了上下游路径：

| Agent | 读取上游 | 写入 |
|-------|---------|------|
| literature | `../CLAUDE.md`, `../uploads/` | `notes/`, `memory.md` |
| proposal | `../literature/notes/`, `../literature/memory.md` | `ideas/proposal.md`, `memory.md` |
| experiments | `../proposal/ideas/proposal.md`, `../literature/notes/` | `code/`, `results/`, `data/`, `memory.md` |
| manuscript | `../literature/notes/`, `../proposal/ideas/`, `../experiments/results/` | `main.tex`, `references.bib` |
| review | `../manuscript/main.tex`, `../experiments/results/` | `reviews/`, `memory.md` |
| references | `../literature/notes/`, `../manuscript/main.tex` | `../manuscript/references.bib` |

**所有 runtime（OpenAGS、Claude Code、Codex）都能写文件**。这是唯一跨 runtime 通用的通信方式。

---

## agent/ — 引擎层

### 结构

```
agent/
  __init__.py           公共 API

  # ─── Core ────────────────────────────────────
  loop.py               Agent 类 — step() 和 loop()
  llm.py                LLM 传输层（内部实现，通过 litellm）
  backend.py            Backend Protocol
  errors.py             异常层次

  # ─── State ───────────────────────────────────
  memory.py             双层记忆（memory.md + history.md）
  session.py            会话管理（JSONL 持久化 + 恢复）

  # ─── Discovery ───────────────────────────────
  discovery.py          AgentDiscovery — 扫描 SOUL.md
  soul.py               SOUL.md 解析器

  # ─── Extensions ──────────────────────────────
  hooks.py              生命周期钩子
  auto_memory.py        自动学习（MEMORY.md）
  task_list.py          共享任务列表
  message_bus.py        事件总线
  worktree.py           Git Worktree 隔离

  # ─── Subsystems ──────────────────────────────
  tools/                通用工具（read, write, edit, ls, grep, bash, sub_agent, ask_user, mcp）
  skills/               Skills 引擎（扫描 SKILL.md，兼容 Claude Code 格式）
  rag/                  RAG 系统（VectorStore + chunker）
```

### 依赖规则

```
loop.py (Agent 核心)
  ├── llm.py        LLM 传输（内部实现）
  ├── memory.py     MemorySystem
  ├── skills/       SkillEngine
  └── tools/        ToolRegistry

agent/ 对 research/ 的依赖：0（完全独立）
```

---

## research/ — 科研应用层

### 结构

```
research/
  orchestrator.py       中心调度 — builtin agent 执行（CLI 路径已移至 Node.js）
  adapter.py            适配层 — SOUL.md → CLAUDE.md / AGENTS.md 生成
  project.py            项目 CRUD + discover_modules()
  templates.py          项目模板（含上下游依赖的 SOUL.md body）
  config.py             SystemConfig 加载/保存

  backend/
    router.py             RuntimeRouter（只管 builtin LLMBackend）

  server/               FastAPI 服务
    routes/
      config.py           系统配置 + Remote Server CRUD + Compute 配置
      gpu.py              GPU 检测 + 分配
      agents.py           Agent Chat API
      projects.py         项目 CRUD + 项目级 Compute 配置
      manuscript.py       LaTeX 编辑 + PDF 编译（pdflatex/xelatex/tectonic）
      agent_config.py     SOUL.md / Skill 管理 API
      ...

  tools/                科研工具（arxiv, semantic_scholar, citation_verify, gpu, mcp）
  messaging/            IM 通知（telegram, discord, feishu）
  experiment/           实验引擎
    engine.py             执行 + LLM 自动修复循环
    sandbox.py            沙箱抽象（Local / Docker / SSH）
    ssh_executor.py       SSH 远程执行（scp 上传/下载 + 远程 GPU 检测）
```

---

## desktop/ — 统一 UI 服务

### 结构

```
desktop/
  src/
    main/                        Node.js 服务（Electron 主进程 / 独立服务）
      index.ts                     启动入口（支持 --serve 浏览器模式）
      server.ts                    Express + WebSocket（PTY、Chat、API 代理）
      python-backend.ts            Python 后端生命周期管理
      providers/                   CLI Agent 集成
        claude-sdk.ts                Claude Code SDK（@anthropic-ai/claude-agent-sdk）
        codex-sdk.ts                 Codex SDK（@openai/codex-sdk）
        cursor-cli.ts                Cursor CLI（子进程 + stream-json）
        gemini-cli.ts                Gemini CLI（子进程 + stream-json + session ID 映射）
        adapter.ts                   配置同步（SOUL.md ↔ CLAUDE.md + skill symlink）
        types.ts                     共享类型 + WsWriter
      tray.ts, updater.ts

    preload/
      index.ts                     最小化 IPC（仅 Electron 文件对话框）

    renderer/                    React 前端（浏览器 + Electron 通用）
      App.tsx                      主路由 + 侧边栏
      pages/
        Dashboard.tsx                项目概览
        Project.tsx                  主工作区（Chat + Terminal + Manuscript）
        Settings.tsx                 配置（Backend + API Keys + Compute & Servers）
      components/
        TerminalPanel.tsx            嵌入式终端（xterm.js + WebSocket /shell）
        ManuscriptEditor.tsx         Mini-Overleaf 编辑器
        ProjectConfig.tsx            项目配置（含 Compute 覆盖）
      services/
        api.ts                       REST 客户端（相对路径，通过 server 代理）
        ws.ts                        WebSocket 客户端（动态 URL）
        chat_threads.ts              对话存储（localStorage + providerSessionId）
```

### 启动方式

```bash
# 浏览器模式（无需 Electron）
cd desktop && pnpm build && pnpm serve
# → http://localhost:3001

# Electron 桌面模式
cd desktop && pnpm dev
# → Electron 窗口（内部加载 http://localhost:3001）
```

---

## Compute & Servers

### 实验执行模式

| 模式 | 实现 | 用途 |
|------|------|------|
| **Local** | `LocalSandbox` — subprocess | 本机直接运行（默认） |
| **Docker** | `DockerSandbox` — `--network=none` + 内存限制 | 隔离执行 |
| **Remote SSH** | `SSHSandbox` — scp 上传/SSH 执行/下载结果 | 远程 GPU 服务器 |

### 配置层级

```yaml
# ~/.openags/config.yaml（全局默认）
experiment_sandbox: local
remote_servers:
  - name: gpu-server-1
    host: 10.0.1.50
    port: 22
    user: research
    key_file: ~/.ssh/id_rsa
    gpus: [0, 1, 2, 3]

# 项目级覆盖 .openags/config.yaml
compute:
  execution_mode: remote
  remote_server: gpu-server-1
  gpu_count: 2
  timeout: 600
  auto_fix: true
```

### GPU 检测

自动检测：nvidia-smi → PyTorch CUDA → Apple MPS → CPU fallback。
API：`GET /api/gpu/devices`、`POST /api/gpu/allocate`。

### 实验自动修复

```
ExperimentEngine.run(experiment):
  1. 执行代码（sandbox）
  2. 成功 → 返回结果
  3. 失败 → LLM 分析 stderr → 修改代码 → 验证语法 → 重试
  4. 重复直到成功或达到 max_fix_attempts
```

---

## SOUL.md 格式

```yaml
---
name: literature
description: "文献综述与论文搜索"
tools: [arxiv, semantic_scholar, read, write]
max_steps: 20
done_strategy: default      # default | coordinator
mode: subagent              # root | subagent
---

你是文献综述专家。

## Context Sources (read these first!)

- `../CLAUDE.md` — 项目概述
- `../uploads/` — 用户上传的论文

## Your Outputs

- 搜索结果 → `notes/search_results.md`
- 更新 `memory.md`
```

---

## SKILL.md 格式（Claude Code 兼容）

```
skills/
  search-papers/
    SKILL.md       ← 入口（必需）
    templates/      ← 可选支持文件
```

```yaml
---
name: search-papers
description: Search for academic papers
roles: [literature, coordinator]          # OpenAGS SkillEngine 用
triggers: ["search papers", "arxiv"]      # OpenAGS 触发匹配
allowed-tools: Read, Write, Bash(curl *)  # Claude Code 权限
---

## Instructions
...
```

---

## Security

| 威胁 | 防护 |
|------|------|
| 路径遍历 | `safe_path()` — resolve + is_relative_to |
| 危险命令 | bash 黑名单 |
| 输出爆炸 | read 100K, grep 200 条, bash 50K |
| API 密钥 | `SecretStr` + 日志脱敏 + config 文件 chmod 600 |
| 跨域 | CORS 仅 localhost |
| 子进程 | timeout + cwd 限制 |
| Docker | `--network=none` + `--memory` 限制 |
| SSH | `StrictHostKeyChecking=no` + `ConnectTimeout=10` + key auth |
| 请求洪水 | RateLimitMiddleware 滑动窗口 |
| 审计 | AuditLogMiddleware 全请求日志 |
