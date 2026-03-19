# OpenAGS 重构方案：从硬编码智能体到纯文件夹驱动的多智能体系统

> **核心理念**：目录就是智能体，SOUL.md 就是它的全部定义。
> **配置载体**：SOUL.md YAML frontmatter（结构化参数）+ Markdown 正文（角色定义）。
> **不再需要** `agent.yaml`。

---

## 一、重构进度总览

> 截至 2026-03-19 — **全部完成**

### ✅ Phase R1: 清理过渡态残留

| 操作 | 状态 |
|------|------|
| 删除 `AgentRole` / `ProjectStage` 枚举 | ✅ |
| 删除 7 个 Agent 别名文件 + `registry.py` | ✅ |
| 删除 `_ROLE_TO_MODULE` / `_PROJECT_SUBDIRS` / `SECTION_TO_DIR` | ✅ |
| 删除 `_get_agent_name_compat()` | ✅ |
| `SkillMeta.roles` / `Session.agent_role` / `Project.stage` → `str` | ✅ |
| 验证：338 个测试全部通过 | ✅ |

### ✅ Phase R2: openags 通用 Agent 引擎

| 目标 | 状态 |
|------|------|
| `openags/agent/` 公共 API（Agent, AgentDiscovery, parse_soul, etc.） | ✅ |
| MemorySystem 解耦（project_dir 可选） | ✅ |
| 工具重命名（file_read→read 等 + alias 向后兼容） | ✅ |
| `openags/cli.py` 独立 REPL + 单次任务 | ✅ |
| `openags/providers/` 公共 API | ✅ |
| 验证：344 个测试全部通过 | ✅ |

### ✅ Phase R3: 科研层物理分离

| 目标 | 状态 |
|------|------|
| orchestrator/project/templates/auth → `research/` | ✅ |
| server/ (14 routes) → `research/server/` | ✅ |
| 科研工具 → `research/tools/` | ✅ |
| experiment/ → `research/experiment/` | ✅ |
| logging/ → `research/logging/` | ✅ |
| `create_engine_registry()` 纯通用工具 | ✅ |
| API `role` → `module`（向后兼容） | ✅ |
| 验证：360 个测试全部通过 | ✅ |

### ✅ Phase R4: 前端动态化

| 目标 | 状态 |
|------|------|
| 侧边栏从 API 动态获取模块列表 | ✅ |
| `module` 参数替代 `role` | ✅ |
| 前端 chat/session API 更新 | ✅ |

### ✅ Phase R5: Desktop 嵌入式终端

| 目标 | 状态 |
|------|------|
| node-pty + xterm.js 集成 | ✅ |
| PTY Manager（持久会话、输出缓存、reconnect 回放） | ✅ |
| CLI Backend 自动在对应文件夹启动终端 | ✅ |
| 上下分割布局（Terminal + Chat），各自可最小化 | ✅ |
| Claude Code JSONL 历史同步 | ✅ |
| Section 切换保持 PTY 活跃 | ✅ |

---

## 二、设计决策：为什么用 SOUL.md frontmatter

三个参考项目（Claude Code、OpenCode、learn-claude-code）**都没有**使用单独的 YAML 配置文件定义 agent，统一使用 **Markdown + YAML frontmatter**。

| 放在哪里 | 放什么 | 为什么 |
|----------|--------|--------|
| **SOUL.md frontmatter** | name, description, tools, max_steps, done_strategy, model, mode, hooks | 机器可读的运行参数，UI 可解析 |
| **SOUL.md 正文** | 角色定义、工作流程、质量标准、协作规则 | 自然语言，给 LLM 看的 prompt |
| **项目级 .openags/config.yaml** | 默认 model、全局权限、backend 配置 | 跨模块共享的全局设置 |

---

## 三、SOUL.md 格式规范

### Frontmatter 字段

| 字段 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `name` | string | 目录名 | 智能体名称 |
| `description` | string | `""` | 一句话描述 |
| `tools` | list[string] | 全部工具 | 允许使用的工具列表 |
| `max_steps` | int | `20` | 单次执行最大步数 |
| `done_strategy` | string | `"default"` | `default` / `coordinator` |
| `continuation_phrases` | list[string] | `[]` | coordinator 延续短语 |
| `model` | string | `null` | 覆盖默认模型 |
| `mode` | string | `"subagent"` | `root` / `subagent` |
| `hooks` | list[object] | `[]` | 生命周期钩子 |
| `permission_mode` | string | `"default"` | `default` / `plan` / `supervised` |
| `isolation` | string | `null` | `worktree` 隔离模式 |

### 解析规则

1. 有 frontmatter → 解析为 `AgentConfig`
2. 无 frontmatter → 目录名 + 默认值（向后兼容）
3. SOUL.md 不存在但目录含 `sessions/` 或 `memory.md` → 仍视为智能体
4. 所有字段可选，缺失用默认值

---

## 四、与 Claude Code 的对齐

| Claude Code 特性 | OpenAGS 现状 | 状态 |
|-----------------|-------------|------|
| `.claude/agents/*.md` + frontmatter | SOUL.md + frontmatter | ✅ |
| CLAUDE.md 分层加载 | SOUL.md 四级查找 | ✅ |
| Skills | `module/skills/*.md` | ✅ |
| Hooks (PreToolUse/PostToolUse/Stop) | `core/hooks.py` | ✅ |
| Agent Teams (并行 + 任务列表) | `task_list.py` + 批量 dispatch | ✅ |
| Auto Memory | `auto_memory.py` | ✅ |
| Permission Modes | PermissionMode 枚举 | ✅ |
| Git Worktree | `worktree.py` | ✅ |
| Context Compaction | 两阶段压缩 | ✅ |
| MCP 集成 | MCPManager | ✅ |
| Agent spawn subagent (任意名) | dispatch_agent 使用 str 名称 | ✅ |
| Session Resume (-c/-r/--name) | CLI --continue/--resume 支持 | ✅ |
| 独立 CLI REPL | `openags agent --repl` | ✅ |
| Path-specific Rules | ❌ skills 只按关键词触发 | 待实现 |

### OpenAGS 独有能力

- **科研领域工具**：arXiv、Semantic Scholar、Citation Verify、Experiment Engine
- **项目模板系统**：一键创建多智能体研究项目
- **实验沙箱**：Docker/SSH 远程实验执行
- **多 Backend**：同一项目可混用 Claude Code、Codex、Copilot、LiteLLM
- **双层记忆**：memory.md + history.md + MEMORY.md（自动学习）
- **嵌入式终端**：Desktop 内嵌 CLI Agent 终端 + Chat 同步
- **IM 双向通信**：Telegram / Discord / 飞书
