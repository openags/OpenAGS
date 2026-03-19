# OpenAGS 迭代计划

> 2026-03-19 更新

---

## 已完成总结

### Phase 1-4: 安全 + Agent 智能化 + Backend 统一 + Agent 能力 ✅

- 安全修复（SSH 转义、路径校验、token 验证）
- WebUI/Desktop 同步（认证、session、文件上传、WebSocket）
- 死代码清理 + 错误处理修复 + 补全测试（34 个测试全过）
- Tool System 接入（ToolRegistry + MCP + 12 个内置工具 + per-project registry）
- Skills System 接入（SkillEngine + 关键词匹配注入）
- 7 个 Agent 实现 + PDF 解析 + Coordinator 动态编排
- CLI Backend 统一（CLIBackend 基类，claude/codex/copilot/gemini 继承）
- 项目模块化结构（per-module sessions/memory/skills）
- 自定义工作目录 + Agent Config UI（SOUL.md 编辑器 + Skills 管理）
- 文件操作工具（read/write/edit/list/search/bash + safe_path 安全校验）
- 子 agent 上下文隔离 + ask_user 回调 + Context Compact 两阶段压缩
- dispatch_agent + check_progress + Coordinator 自定义 _is_done
- 端到端验证（Literature/Proposer/Writer/Reviewer/Coordinator 链路）

### Phase 2.5: Manuscript 编辑器 + 项目配置 ✅

- Mini-Overleaf 编辑器（文件树、多标签、LaTeX 编译、PDF 预览）
- Settings 完善（5 种 Backend 卡片、API Key 管理）
- i18n 多语言 + Windows 兼容

### Phase 5: 实时反馈 + UX ✅

- WebSocket 实时事件 + 工具状态内联显示
- Session 持久化修复 + UX 修复（自动滚动、全宽排版）

### 重构方案：文件夹驱动多智能体 ✅

- 统一 Agent 类（配置驱动，从 SOUL.md frontmatter 获取行为）
- SOUL.md 解析器（parse_soul / write_soul）
- AgentDiscovery（目录扫描发现智能体）
- discover_modules()（运行时模块发现）
- 项目模板系统（research/minimal/data-science）
- Hooks 钩子系统、Auto Memory、Task List、Worktree、Permission Mode

### 引擎/科研层分离 ✅

- Phase R1: 清理硬编码残留（AgentRole, ProjectStage, 7 个别名文件）
- Phase R2: `openags/agent/` 独立引擎（公共 API、工具重命名、独立 CLI）
- Phase R3: `openags/research/` 物理分离（orchestrator, server, tools, experiment 等）
- Phase R4: 前端动态化（模块从 API 获取、`module` 替代 `role`）
- 360+ 测试全部通过，引擎与科研层零耦合

### Phase 7: IM 双向通信 ✅

- BotHandler 统一命令解析（/status, /run, /chat, /projects, /help）
- IMSessionMapper — IM 对话 ↔ OpenAGS Session 映射
- 支持 Telegram / Discord / 飞书

### Phase 8: 知识管理 + RAG ✅

- VectorStore Protocol + LocalVectorStore（TF 余弦相似度，JSON 持久化）
- 文档分块（重叠窗口）
- Document/SearchResult Pydantic 模型

### Phase 9: 生产化 ✅（核心）

- RateLimitMiddleware（滑动窗口限流）
- AuditLogMiddleware（请求日志审计）
- pyproject.toml v0.2.0

### Phase 10: Desktop 嵌入式终端 ✅

- node-pty + xterm.js 集成
- PTY Manager（会话持久化、输出缓存、reconnect 回放）
- CLI Backend 自动在对应文件夹启动终端（claude/codex/copilot/gemini）
- 上下分割布局（Terminal + Chat Bubbles），各自可最小化
- Claude Code JSONL 历史同步（每 3 秒轮询 `~/.claude/projects/`）
- 切换 section 保持 PTY 活跃，仅关闭软件时 kill 全部
- electron-rebuild 确保原生模块兼容

---

## 待完成

### Phase 11: 端到端科研能力（借鉴竞品分析，见 docs/competitive-analysis.md）

**P0 — 立即可做（纯 SOUL.md 改进）**

- [ ] 标准化中间文件格式 — 定义每个 agent 的输入/输出文件路径约定
- [ ] PIVOT/REFINE/PROCEED 自主决策 — coordinator 根据结果质量决定回退/继续/换方向
- [ ] 自主实验循环 — experiments agent 支持 "edit → run → evaluate → keep/discard" 循环

**P1 — 核心功能增强**

- [ ] 跨模型审稿循环 — review agent 用不同模型审稿（借鉴 ARIS 的 Claude+GPT 双模型模式）
- [ ] 阶段检查点 — 每个 agent 完成后写 checkpoint（借鉴 ARIS 的 REVIEW_STATE.json）
- [ ] 改进 auto_memory 提取 — 分类记录成功策略/失败模式/研究洞察（借鉴 EvoScientist）
- [ ] 聊天中断机制（AbortController）
- [ ] 实验 stdout/stderr 流式传输

**P2 — 体验优化**

- [ ] Manuscript 文件浏览器隐藏 agent/sessions/memory 等非写作文件
- [ ] SOUL.md 编辑器拆分（frontmatter 表单 + prompt 编辑器）
- [ ] 暗色模式
- [ ] Dashboard 统计图表
- [ ] 实验结果持久化 + 历史对比面板

**P3 — 长期规划**

- [ ] ACP 持久 session — CLI agent 保持单 session 跨多阶段（借鉴 AutoResearchClaw）
- [ ] SQLite 替代 JSON/YAML 存储
- [ ] 引用关系图 + 知识图谱可视化
- [ ] Path-specific Rules（Skills 按路径触发）
- [ ] 新增 `fetch.py` 网页抓取工具
- [ ] Electron 打包发布（macOS DMG + Windows NSIS）
