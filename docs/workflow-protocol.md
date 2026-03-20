# OpenAGS Multi-Agent Workflow Protocol

> v1.0 — 2026-03-20

## 概述

本协议定义了 Coordinator Agent、Sub-Agent 和 Node.js Orchestrator 之间的通信契约。所有跨 Agent 通信通过两个文件完成：`DIRECTIVE.md`（任务指令）和 `STATUS.md`（执行状态）。

三个角色：

| 角色 | 职责 | 不做的事 |
|------|------|---------|
| **Coordinator Agent** | 读所有 STATUS.md → 做决策 → 写 DIRECTIVE.md | 不执行研究任务，不监控进程 |
| **Sub-Agent** | 读 DIRECTIVE.md → 执行任务 → 写 STATUS.md + 产出文件 | 不知道其他 Agent 的存在，不写 DIRECTIVE.md |
| **Node.js Orchestrator** | 监控 STATUS.md → 触发 Coordinator → Dispatch Agent → 超时/崩溃处理 | 不做任何研究决策 |

---

## 项目结构

```
my-research/                   ← Coordinator（根 Agent）
  SOUL.md                      ← Coordinator 角色定义
  DIRECTIVE.md                 ← Orchestrator 写给 Coordinator 的触发指令
  STATUS.md                    ← Coordinator 写出的决策状态
  memory.md                    ← 项目全局记忆

  literature/                  ← 文献综述 Agent
    SOUL.md, DIRECTIVE.md, STATUS.md, memory.md
    notes/                     ← 产出

  proposal/                    ← 研究提案 Agent
    SOUL.md, DIRECTIVE.md, STATUS.md, memory.md
    ideas/

  experiments/                 ← 实验执行 Agent
    SOUL.md, DIRECTIVE.md, STATUS.md, memory.md
    code/, data/, results/

  manuscript/                  ← 论文写作 Agent
    SOUL.md, DIRECTIVE.md, STATUS.md, memory.md
    main.tex, references.bib

  review/                      ← 同行评审 Agent
    SOUL.md, DIRECTIVE.md, STATUS.md, memory.md
    reviews/

  references/                  ← 引用管理工具（非 Agent）
  uploads/                     ← 用户上传文件（只读）
```

---

## 工作流配置

所有阈值和超时参数集中管理在 `.openags/config.yaml` 的 `workflow` 段。用户可在项目 Dashboard 的设置面板中修改。

```yaml
# .openags/config.yaml
workflow:
  # ── 全局默认值 ──
  max_refine: 2              # 同一 agent 同一阶段最多 REFINE 次数
  max_pivot: 1               # 整个项目最多 PIVOT 次数
  max_attempts: 2            # 每个 DIRECTIVE 最大重试次数
  coordinator_timeout: 300   # Coordinator 单次决策超时（秒）
  poll_interval: 2000        # STATUS.md 轮询间隔（毫秒）
  auto_start: false          # 创建项目后是否自动启动工作流

  # ── per-agent 覆盖（只写需要覆盖的字段）──
  agents:
    literature:
      timeout: 600            # 10 分钟（搜索+阅读论文）
    proposal:
      timeout: 900            # 15 分钟（分析+写提案）
    experiments:
      timeout: 259200         # 72 小时（可能跑几天实验）
      execution_timeout: 86400  # 单次实验执行超时（跑代码本身）
      max_attempts: 3         # 实验失败多给几次机会
    manuscript:
      timeout: 3600           # 1 小时（写论文）
    review:
      timeout: 1800           # 30 分钟（审稿）
```

### 参数查找顺序

```
agent 级 (.workflow.agents.{name}.timeout)
  → 全局默认 (.workflow.default_timeout 或代码兜底)
```

### 代码兜底默认值

| 参数 | 默认值 | 说明 |
|------|--------|------|
| timeout | 1800 | 通用 agent 默认 30 分钟 |
| execution_timeout | null | 仅 experiments 使用，null 表示等于 timeout |
| max_refine | 2 | |
| max_pivot | 1 | |
| max_attempts | 2 | |
| coordinator_timeout | 300 | 5 分钟 |
| poll_interval | 2000 | 2 秒 |
| auto_start | false | |

Coordinator 写 DIRECTIVE.md 时，`timeout_seconds` 字段从此配置读取，不硬编码。Node.js Orchestrator 的超时 timer 也从此配置读取。

---

## DIRECTIVE.md 格式

由 Coordinator Agent 写入目标 Agent 的目录，表示"你该做什么"。

```yaml
---
directive_id: "d-20260320-143052-literature-a7f3"
phase: "literature_review"
action: "execute"
priority: "normal"
created_at: "2026-03-20T14:30:52Z"
timeout_seconds: 600
max_attempts: 2
attempt: 1
decision: "PROCEED"
decision_reason: "项目启动，需要先做文献调研"
depends_on: []
---

## Task

搜索 arXiv 上关于 scientific taste prediction 的论文（2024-2026），找至少 10 篇。

## Acceptance Criteria

1. 至少 10 篇论文，含标题、作者、年份、摘要概述
2. 结果写入 notes/search_results.md
3. 标注前 3 篇最相关论文及理由
4. 更新 memory.md

## Context

用户研究课题：LLM 能否发展出科学品味？

## Upstream Data

- 项目概览：../CLAUDE.md
- 用户上传：../uploads/
```

### 字段说明

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `directive_id` | string | 是 | 格式：`d-{YYYYMMDD}-{HHmmss}-{agent}-{4hex}` |
| `phase` | string | 是 | 研究阶段：literature_review / proposal / experiments / manuscript_writing / peer_review |
| `action` | enum | 是 | `execute`=新任务, `revise`=根据反馈修改, `abort`=取消 |
| `priority` | enum | 是 | critical / high / normal / low |
| `created_at` | ISO 8601 | 是 | UTC 时间戳 |
| `timeout_seconds` | int | 是 | 超时秒数，从 `.openags/config.yaml` workflow.agents.{agent}.timeout 读取 |
| `max_attempts` | int | 是 | 最大重试次数 |
| `attempt` | int | 是 | 当前第几次尝试（从 1 开始） |
| `decision` | enum | 是 | `PROCEED`=推进 / `REFINE`=修改 / `PIVOT`=转向 |
| `decision_reason` | string | 是 | 决策原因 |
| `depends_on` | list | 否 | 前置依赖的 directive_id 列表 |

---

## STATUS.md 格式

由 Sub-Agent 完成任务后写入自己的目录，表示"我做了什么"。

### 成功：

```yaml
---
directive_id: "d-20260320-143052-literature-a7f3"
agent: "literature"
status: "completed"
started_at: "2026-03-20T14:30:55Z"
completed_at: "2026-03-20T14:35:12Z"
duration_seconds: 257
exit_reason: "task_complete"
error_message: null
artifacts:
  - "notes/search_results.md"
  - "notes/paper_001.md"
quality_self_assessment: 4
---

## Summary

搜索到 12 篇论文，其中 3 篇高度相关。

## Acceptance Criteria Met

1. [x] 至少 10 篇论文（找到 12 篇）
2. [x] 结果写入 notes/search_results.md
3. [x] 标注前 3 篇最相关论文
4. [x] memory.md 已更新

## Issues

无。

## Recommendations

建议进入 proposal 阶段，文献显示 LLM 品味评估领域存在空白。
```

### 失败：

```yaml
---
directive_id: "d-20260320-143052-literature-a7f3"
agent: "literature"
status: "failed"
started_at: "2026-03-20T14:30:55Z"
completed_at: "2026-03-20T14:32:00Z"
duration_seconds: 65
exit_reason: "error"
error_message: "arXiv API 超时"
artifacts: []
quality_self_assessment: 1
---

## Summary

任务失败：arXiv API 连续超时。

## Partial Progress

semantic_scholar 搜到 3 篇论文，但不够。

## Issues

arXiv API 返回 503，可能是服务器维护。
```

### 字段说明

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `directive_id` | string | 是 | 必须匹配 DIRECTIVE.md 中的 ID |
| `agent` | string | 是 | Agent 名称 |
| `status` | enum | 是 | pending / running / completed / failed / blocked / aborted |
| `started_at` | ISO 8601 | 是 | 开始时间 |
| `completed_at` | ISO 8601 | 终态必填 | 完成时间 |
| `duration_seconds` | float | 终态必填 | 耗时 |
| `exit_reason` | enum | 终态必填 | task_complete / max_steps / timeout / error / user_abort / agent_abort |
| `error_message` | string | 失败必填 | 错误信息 |
| `artifacts` | list | 否 | 创建/修改的文件路径列表 |
| `quality_self_assessment` | int | 否 | 1-5，Agent 自评 |

---

## 状态机

```
                    DIRECTIVE.md 写入
                         │
                         ▼
          ┌──────── [idle] ◄──────────────────────┐
          │            │                           │
          │    Orchestrator 读取                   │
          │    DIRECTIVE → dispatch                │
          │            │                           │
          │            ▼                           │
          │       [pending]                        │
          │            │                           │
          │     Agent 开始执行                      │
          │     STATUS: running                    │
          │            │                           │
          │            ▼                           │
          │       [running]                        │
          │        │      │                        │
          │    成功 │      │ 失败/超时              │
          │        ▼      ▼                        │
          │ [completed] [failed]                   │
          │      │         │                       │
          │      │    重试? │                       │
          │      │    attempt < max_attempts?       │
          │      │      是 → [pending] ────────────┘
          │      │      否 → Coordinator 决策
          │      │
          │   Coordinator 读取 STATUS
          │   写新 DIRECTIVE（或不写）
          │      │
          └──────┘

  特殊状态：
    [blocked]  ← 上游依赖未完成 → 依赖完成后 → [pending]
    [aborted]  ← DIRECTIVE action=abort → [idle]
```

### 合法状态转换

| From | To | 触发 |
|------|----|------|
| idle | pending | DIRECTIVE.md 写入 |
| pending | running | Agent 开始执行，写 STATUS.md |
| pending | blocked | Agent 检测到上游依赖未完成 |
| running | completed | Agent 成功完成 |
| running | failed | Agent 出错或超时 |
| running | aborted | DIRECTIVE.md 被覆盖为 action=abort |
| failed | pending | Orchestrator 重试（attempt < max_attempts） |
| blocked | pending | 上游依赖完成 |
| completed → idle | Coordinator 写新 DIRECTIVE.md 或无动作 |

---

## Coordinator 决策协议

### 决策类型

| 决策 | 含义 | 限制 |
|------|------|------|
| **PROCEED** | 质量达标，推进到下一阶段 | 必须遵循依赖图 |
| **REFINE** | 方向正确但质量不够，给反馈重做 | 同一 Agent 同一阶段不超过 `workflow.max_refine` 次 |
| **PIVOT** | 方向错误，回退到更早阶段 | **整个项目最多 1 次 PIVOT** |
| **wait_user** | 需要用户介入 | REFINE 超 `max_refine` 或 PIVOT 超 `max_pivot` 时强制 |
| **stop** | 研究完成 | Review 给出 Accept/Weak Accept 时 |

### 依赖图

```
literature → proposal → experiments → manuscript → review
```

- 不能在 literature 完成前 dispatch proposal
- 不能在 proposal 完成前 dispatch experiments
- 不能在 experiments 完成前 dispatch manuscript
- 不能在 manuscript 完成前 dispatch review
- REFINE 和 PIVOT 可以回退到任意更早阶段

### Review 循环

```
review STATUS.md 说 "Reject" 或 "Borderline"
  → Coordinator 读 review 报告
  → 决定回退到哪个阶段（experiments 补实验 / manuscript 改论文）
  → 写对应 Agent 的 DIRECTIVE.md（action=revise）
  → 修改完成后 → 重新 dispatch manuscript → 重新 dispatch review
```

---

## Node.js Orchestrator 事件循环

```typescript
// 伪代码

class WorkflowOrchestrator {
  // 启动
  async start() {
    // 1. 恢复崩溃前的状态
    await this.recoverFromCrash()
    // 2. 监控所有 Agent 目录的 STATUS.md
    for (dir of agentDirs) {
      fs.watch(dir, (event, file) => {
        if (file === 'STATUS.md') this.onStatusChanged(dir)
      })
    }
    // 3. 触发 Coordinator 首次运行
    await this.triggerCoordinator('project_start')
  }

  // STATUS.md 变化事件
  async onStatusChanged(agentDir) {
    await delay(200)  // 防抖，等文件写完
    status = parseStatusMd(agentDir)  // 多层解析

    if (status.status in ['completed', 'failed', 'aborted']) {
      // 终态 → 触发 Coordinator 评估
      this.activeAgents.delete(agentDir)
      await this.triggerCoordinator(`${agentDir}_${status.status}`)
    }
  }

  // 触发 Coordinator
  async triggerCoordinator(reason) {
    if (this.coordinatorLock) {
      this.pendingTriggers.push(reason)
      return
    }
    this.coordinatorLock = true

    // 构建 Coordinator 的 DIRECTIVE.md
    context = await this.buildProjectContext()  // 读所有 STATUS.md + memory.md
    writeDirective(projectRoot, { task: `评估项目状态。触发原因: ${reason}`, context })

    // 调 Coordinator（和用户手动聊天走同一条 chat 路径）
    await this.dispatchAgent('coordinator', projectRoot)

    // Coordinator 完成后，扫描是否有新的 DIRECTIVE.md
    await this.processCoordinatorOutput()

    this.coordinatorLock = false
    // 处理排队的触发
    if (this.pendingTriggers.length > 0) {
      await this.triggerCoordinator(this.pendingTriggers.shift())
    }
  }

  // 处理 Coordinator 的输出
  async processCoordinatorOutput() {
    coordStatus = parseStatusMd(projectRoot)

    if (coordStatus.exit_reason === 'wait_user') {
      this.emitToUI('workflow.awaiting_user', coordStatus.summary)
      return
    }
    if (coordStatus.exit_reason === 'project_complete') {
      this.emitToUI('workflow.complete')
      return
    }

    // 扫描哪些 Agent 目录有新的 pending DIRECTIVE
    for (dir of agentDirs) {
      directive = parseDirectiveMd(dir)
      if (!directive) continue
      status = parseStatusMd(dir)
      if (status?.status === 'running') continue  // 已在运行，跳过

      // 检查依赖
      if (!this.allDependenciesMet(directive.depends_on)) continue

      // Dispatch
      await this.dispatchAgent(dir.name, dir.path)
    }
  }

  // Dispatch Agent（所有 backend 走同一条路）
  async dispatchAgent(agentName, cwd) {
    // 和用户在 UI 里发消息用同一个 chat 接口
    // builtin → HTTP POST /api/agents/{project}/chat
    // CLI     → WebSocket /chat → provider SDK
    await this.chatAPI.send(agentName, cwd,
      "读取你的 DIRECTIVE.md，执行任务，完成后写 STATUS.md。")
  }

  // 崩溃恢复
  async recoverFromCrash() {
    for (dir of agentDirs) {
      status = parseStatusMd(dir)
      if (status?.status === 'running') {
        // 进程不在了 → 标记 failed
        if (!this.isProcessAlive(dir)) {
          writeFailedStatus(dir, 'stale_after_crash')
        }
      }
    }
  }
}
```

---

## 失败处理

### STATUS.md 多层解析

```
第 1 层：YAML frontmatter 解析
  ↓ 失败
第 2 层：正则提取 status:、directive_id: 等字段
  ↓ 失败
第 3 层：启发式 — body 包含"completed/done"视为完成，"failed/error"视为失败
  ↓ 失败
第 4 层：视为 failed（parse_error），触发 Coordinator 决策
```

### 所有故障场景

| 故障 | 检测 | 恢复 |
|------|------|------|
| Agent 写了格式错误的 STATUS.md | YAML 解析失败 | 多层降级解析，最差视为 failed |
| Agent 不写 STATUS.md | 超时触发 | Orchestrator 合成 failed STATUS.md |
| Agent 进程崩溃 | 进程退出 + STATUS 仍是 running | Orchestrator 合成 failed STATUS.md |
| STATUS 说 completed 但文件没写 | 比对 artifacts vs 磁盘 | 标记 failed，让 Coordinator 决定重试 |
| Coordinator 写错 DIRECTIVE.md | 验证失败 | 多层解析 + 默认值填充 |
| Coordinator 死循环 | 超时（120 秒） | 强制 failed，重新触发 |
| REFINE 超过 max_refine | 计数器 | 强制 wait_user |
| PIVOT 超过 1 次 | 计数器 | 强制 wait_user |
| Node.js 崩溃重启 | 启动时扫描所有目录 | 从 DIRECTIVE.md + STATUS.md 完整恢复 |
| 磁盘满 | 写入失败 | 通知用户，暂停工作流 |
| LLM API 故障 | 网络超时 | Backend 自动重试 → 耗尽后写 failed STATUS |

---

## 并发规则

### 目录锁

每个 Agent 目录同一时刻只允许一个 DIRECTIVE 在执行。STATUS.md 显示 `running` 时，该目录被锁定。

### 单写入者规则

| 文件 | 合法写入者 |
|------|-----------|
| `{agent}/DIRECTIVE.md` | Coordinator Agent |
| `{agent}/STATUS.md` | 该 Agent 自己（CLI）或 Orchestrator（builtin 兜底） |
| `{agent}/memory.md` | 该 Agent 自己（追加模式） |
| `{agent}/` 下的产出文件 | 该 Agent 自己 |

### 原子写入

所有协议文件写入使用 `write → tmp → rename` 模式：
```
写入 STATUS.md.tmp → rename STATUS.md.tmp → STATUS.md
```
POSIX rename 是原子操作，防止 fs.watch 读到写了一半的文件。

---

## SOUL.md 中的不可变协议段

### 标识符

```html
<!-- @@PROTOCOL_START — DO NOT MODIFY OR DELETE THIS SECTION -->
...
<!-- @@PROTOCOL_END -->
```

所有编辑工具（包括 Agent 自己、Adapter 同步、UI 编辑器）在修改 SOUL.md 时**必须保留**此段不变。

### Coordinator 协议段

写入 Coordinator 的 SOUL.md（项目根目录），紧跟在角色描述之后：

```markdown
<!-- @@PROTOCOL_START — DO NOT MODIFY OR DELETE THIS SECTION -->
## Workflow Protocol (IMMUTABLE)

你是 Coordinator。你不执行研究任务。你读取状态、做决策、写指令。

### 执行循环

1. READ 自己的 DIRECTIVE.md（了解为什么被触发）
2. READ 所有子 Agent 的 STATUS.md 和 memory.md
3. DECIDE 下一步做什么
4. WRITE 目标 Agent 目录的 DIRECTIVE.md
5. WRITE 自己的 STATUS.md
6. UPDATE 自己的 memory.md

### DIRECTIVE.md 格式

用 write 工具写入目标 Agent 目录，严格遵循此格式：

```
---
directive_id: "d-{YYYYMMDD}-{HHmmss}-{agent}-{4hex}"
phase: "{阶段}"
action: "execute"
priority: "normal"
created_at: "{ISO8601}"
timeout_seconds: {从 .openags/config.yaml workflow.agents.{agent}.timeout 读取}
max_attempts: {从 workflow.max_attempts 读取}
attempt: 1
decision: "PROCEED"
decision_reason: "{原因}"
depends_on: []
---

## Task
{具体、可执行的任务描述}

## Acceptance Criteria
{编号列表}

## Upstream Data
{上游文件路径}
```

### 决策规则（强制）

1. **PROCEED** — 质量达标，进入下一阶段
2. **REFINE** — 同一 Agent 同一阶段 REFINE 次数不得超过 `.openags/config.yaml` 中 `workflow.max_refine`，超过必须 wait_user
3. **PIVOT** — 整个项目 PIVOT 次数不得超过 `workflow.max_pivot`，超过必须 wait_user
4. **wait_user** — 需要用户介入时使用
5. **stop** — 研究完成时使用

### 依赖图（强制）

literature → proposal → experiments → manuscript → review
不得跳过。REFINE/PIVOT 可回退。

### 禁止

- 不写任何 Agent 的工作文件（notes/, code/ 等）
- 不 dispatch references/（它不是 Agent）
- 不删除或修改此协议段

<!-- @@PROTOCOL_END -->
```

### Sub-Agent 协议段

写入每个 Sub-Agent 的 SOUL.md，紧跟在角色描述之后：

```markdown
<!-- @@PROTOCOL_START — DO NOT MODIFY OR DELETE THIS SECTION -->
## Workflow Protocol (IMMUTABLE)

你是一个执行者。读取 DIRECTIVE.md 获取任务，完成后写 STATUS.md 报告结果。

### 执行循环

1. READ 你目录下的 DIRECTIVE.md — 这是你的任务
2. 如果 action 是 "abort"：立即写 STATUS.md (status: aborted)，停止
3. 如果 action 是 "revise"：根据反馈改进之前的工作
4. 如果 action 是 "execute"：执行任务
5. WRITE STATUS.md 报告结果
6. UPDATE memory.md

### STATUS.md 格式（必须严格遵循）

```
---
directive_id: "{从 DIRECTIVE.md 复制}"
agent: "{你的名字}"
status: "completed"
started_at: "{ISO8601}"
completed_at: "{ISO8601}"
duration_seconds: {N}
exit_reason: "task_complete"
error_message: null
artifacts:
  - "path/to/file1"
quality_self_assessment: {1-5}
---

## Summary
{2-5 句话总结}

## Acceptance Criteria Met
{对照 DIRECTIVE 中的标准打勾}

## Issues
{遇到的问题，或"无"}

## Recommendations
{建议下一步做什么}
```

失败时将 status 改为 "failed"，exit_reason 改为 "error"，填写 error_message。

### 禁止

- 不写 DIRECTIVE.md（只有 Coordinator 写）
- 不修改自己目录以外的文件（除了 SOUL.md 中指定的上游路径）
- 不删除或修改此协议段

<!-- @@PROTOCOL_END -->
```

---

## 跨 Backend 一致性

| Backend | 谁写 DIRECTIVE.md | 谁写 STATUS.md | 可靠性保证 |
|---------|-------------------|----------------|-----------|
| **Builtin** | Coordinator（Python Agent.loop） | Python 代码从 AgentResult 自动生成 | 100% 格式正确 |
| **Claude Code** | Coordinator（Claude Code Write 工具） | LLM 按 SOUL.md 协议写 | SOUL.md 指令 + Node.js 验证兜底 |
| **Codex** | Coordinator（Codex Write） | LLM 按 AGENTS.md 协议写 | 同上 |
| **Gemini CLI** | Coordinator（Gemini Write） | LLM 按 GEMINI.md 协议写 | 同上 |

**Builtin 路径**：Python `Orchestrator.run_agent()` 完成后，从 `AgentResult` 自动生成 STATUS.md — 不依赖 LLM 格式化能力，保证格式正确。

**CLI 路径**：LLM 按照 SOUL.md 中的不可变协议段写 STATUS.md — 如果格式有误，Node.js Orchestrator 用多层解析兜底。

**最终一致**：无论哪条路径，STATUS.md 最终都存在且可解析。
