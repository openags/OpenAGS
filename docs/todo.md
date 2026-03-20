# OpenAGS 迭代计划

> 2026-03-20 更新 — v0.0.1

## 全部完成

### 核心架构
- [x] Agent 引擎与科研应用层解耦 + Folder = Agent
- [x] 12 个内置工具 + Skill 系统（Claude Code 兼容 + Path-specific 触发）
- [x] 配置同步（SOUL.md ↔ CLAUDE.md ↔ AGENTS.md ↔ GEMINI.md）
- [x] 7 个科研 Agent + PIVOT/REFINE/PROCEED 决策 + 自主实验循环
- [x] DIRECTIVE.md / STATUS.md 协议 + 多层解析（Python 端 + Node.js 4 层 fallback）
- [x] 工作流配置（per-agent timeout, max_refine, max_pivot）
- [x] Workflow API（GET /status, GET /config, PUT /config）
- [x] DoneStrategy.TOOL_REQUIRED + min_steps + upstream_files 注入

### Backend
- [x] Claude Code 作为主 backend（其他暂未调试，Settings 灰色显示）
- [x] Provider 配置直写 CLI 工具文件 + 预设 + Session resume
- [x] GPU 检测 + SSH 远程 + Docker 沙箱 + 实验自动修复 + on_output 回调
- [x] 阶段检查点 + auto_memory 分类提取 + Message Bus
- [x] 并行 Agent 执行 + 引用关系图 + 插件系统 + MCP 集成

### 前端
- [x] 统一 UI（浏览器 + Electron）+ 全 WebSocket（/chat, /shell, /workflow）
- [x] Chat Bubbles（Markdown + 代码块 Copy + 对话搜索）
- [x] ManuscriptEditor + Settings 分页 + 暗色模式 + i18n
- [x] Dashboard 统计 + 项目右键菜单 + Logs CSV 导出
- [x] Dev 模式 WebSocket 端口修复（5173 → 3001 直连）

### 基础设施
- [x] CI/CD + Dockerfile + 373 tests

### AGS 自主模式 + PI 角色重构

#### Phase 1：角色重构
- [x] Root agent: coordinator → ags（~30 文件，向后兼容旧项目）
- [x] 侧边栏 Sessions → PI（GraduationCap icon, agentRole='pi'）
- [x] 新建 `pi/` 子目录 agent（研究顾问，brainstorm）
- [x] 新建 `chatroom.md`（append-only 公共聊天室）+ apply_template 自动创建
- [x] 所有模块 upstream_files 加上 `../chatroom.md`
- [x] 项目模板更新（research / minimal / data-science 三套模板）
- [x] skills/agents/coordinator/ → skills/agents/ags/
- [x] write_soul() YAML 序列化 bug 修复（enum 用 mode="json"）

#### Phase 2：AGS Dashboard
- [x] AGSDashboard.tsx（~210 行）：Pipeline + 活动卡片 + 输入框
- [x] Pipeline 进度条：WebSocket 实时推送 auto.pipeline 状态
- [x] 卡片区：按类型渲染（status/decision/error/dispatch）
- [x] 输入框：发消息给 AGS（workflow.intervene）
- [x] Pipeline 节点点击 → 关闭 Dashboard → 跳转对应 section
- [x] 单按钮三态（Start/Pause/Resume）+ Stop 链接
- [x] Project.tsx header bar `🤖 AGS` 按钮（显示运行状态）
- [x] position: absolute 浮层，切换 section 时自动关闭

#### Phase 3：Node.js 状态监控 + 子 Agent Dispatch
- [x] WorkflowOrchestrator: fs.watch STATUS.md（orchestrator.ts）
- [x] workflow.start/stop/pause/resume WebSocket 协议（server.ts）
- [x] dispatchViaChat(): CLI（Claude Code SDK）+ builtin（Python API）双路径
- [x] BroadcastWriter 广播到所有 UI 客户端
- [x] processCoordinatorOutput() 扫描 DIRECTIVE.md → 自动 dispatch
- [x] 方案 A（Node.js SDK dispatch）+ 方案 B（AGS bash `claude -p`）均已实现
- [x] Pipeline 状态 API + WebSocket 实时推送（非轮询）

#### Phase 4：AGS 自动流程
- [x] 完整生命周期：Start → AGS 评估 → 写 DIRECTIVE → dispatch sub-agent → STATUS 监控 → 循环
- [x] 用户介入：Dashboard 输入框 → workflow.intervene → AGS 调整策略
- [x] Pipeline 点击 → 跳转 Chat → 自动+手动共享 session
- [x] 超时/崩溃恢复：handleTimeout() + recoverFromCrash()

#### Phase 5：chatroom.md 公共聊天室
- [x] chatroom.md 创建 + apply_template 自动生成
- [x] AGS SOUL.md 指导写 chatroom.md 公告
- [x] 所有 agent upstream_files 包含 ../chatroom.md（间接通信）
- [x] Dashboard 输入框发消息给 AGS（workflow.intervene）
- [x] Dashboard 不单独展示 chatroom（决策卡片已覆盖关键信息）

---

## 后续优化方向

- [ ] macOS 签名 + 公证
- [ ] Windows 代码签名
- [ ] 知识图谱前端可视化
- [ ] 实验结果对比面板
- [ ] 对话消息编辑/重发
- [ ] 项目标签/分组
- [ ] 更多 Backend 支持（Codex, Gemini CLI 等，目前灰色）
- [ ] AGS Agent Teams 集成（利用 Claude Code 实验性 Agent Teams 功能）
