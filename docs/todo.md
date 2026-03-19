# OpenAGS 迭代计划

> 2026-03-20 更新

---

## 已完成

### 核心架构
- [x] Agent 引擎层（loop, llm, memory, skills, tools）与科研应用层完全解耦
- [x] Folder = Agent — 放 SOUL.md 就是新 agent
- [x] 12 个内置工具（read, write, edit, ls, grep, bash, fetch, sub_agent, ask_user, mcp, arxiv, semantic_scholar）
- [x] Skill 系统 — SKILL.md 格式兼容 Claude Code，symlink 自动发现
- [x] 配置同步 — SOUL.md ↔ CLAUDE.md ↔ AGENTS.md ↔ GEMINI.md
- [x] 7 个科研 Agent + Coordinator 动态编排

### Backend
- [x] Builtin agent（litellm, 100+ LLM）
- [x] CLI agent 移至 Node.js（Claude Code SDK, Codex SDK, Cursor CLI, Gemini CLI）
- [x] Session resume（providerSessionId 持久化）
- [x] GPU 检测（nvidia-smi / PyTorch / Apple MPS）+ API
- [x] SSH 远程执行（SSHSandbox + scp）
- [x] Docker 沙箱（--network=none + memory limit）
- [x] 实验自动修复循环（LLM 分析 stderr → 修改代码 → 重试）
- [x] Remote Server CRUD API + 测试连接
- [x] WebFetch 工具（HTML→文本, JSON 格式化, 50K 限制）
- [x] 认证系统 + Token 追踪

### 前端
- [x] 统一 UI 服务（浏览器 http://localhost:3001 + Electron 共用）
- [x] WebSocket 通信（/chat, /shell, /ws 代理）— 无 IPC
- [x] Chat Bubbles 交互（SDK 结构化消息 → Tool 状态 + Markdown 渲染）
- [x] 对话管理（Thread + providerSessionId，localStorage 持久化）
- [x] 终端面板（普通 shell，按需显示）
- [x] ManuscriptEditor（LaTeX 编辑 + PDF 编译 + 文件浏览）
- [x] 暗色模式（CSS 变量 + Settings 切换 + localStorage）
- [x] Compute & Servers 设置（GPU 状态 + Remote Server 管理 + 执行模式）
- [x] 项目级 Compute 配置（执行模式 / GPU 数 / 超时 / Auto-fix）
- [x] 文件上传 + 图片支持
- [x] SOUL.md 模板固化上下游依赖
- [x] PIVOT/REFINE/PROCEED 决策协议
- [x] 自主实验循环模板

---

## 待完成

### P0 — 基础设施（影响发布）

- [ ] **Electron 应用图标** — `desktop/resources/` 为空，打包会失败
  - 需要 `icon.icns` (macOS), `icon.ico` (Windows), `icon.png` (Linux)
- [ ] **CI/CD 流水线** — 新增 `.github/workflows/`
  - PR 自动测试（pytest + pnpm build）
  - 代码检查（ruff lint + mypy）
  - Release 自动构建 Electron 安装包
- [ ] **Dockerfile** — Python 后端容器化
  - `docker-compose.yml`（一键启动 Python + Node.js）
- [ ] **.env.example** — 环境变量模板
- [ ] **OWASP 安全头** — 添加 X-Frame-Options, CSP, HSTS middleware

### P1 — 核心功能增强

- [ ] **实验 stdout/stderr 流式传输** — 实时推送到 WebSocket，前端显示进度
- [ ] **跨模型审稿** — review agent 调用不同模型（如 Claude + GPT）做双盲审稿
- [ ] **阶段检查点** — 每个 agent 完成后写 checkpoint（JSON），支持断点恢复
- [ ] **改进 auto_memory** — 分类提取：成功策略 / 失败模式 / 研究洞察 + 去重
- [ ] **Message Bus 接入** — 已实现但未使用，agent 完成任务后发事件通知
- [ ] **Worktree 集成** — 已实现但未调用，用于隔离实验执行
- [ ] **IM 通知配置 UI** — Settings 里加 Telegram/Discord/飞书 webhook 配置

### P2 — 体验优化

- [ ] **Dashboard 统计图表**
  - Token 消耗趋势图
  - 项目进度条（各模块完成状态）
  - 最近 Agent 活动时间线
- [ ] **SOUL.md 编辑器拆分**
  - Frontmatter 表单（name, tools, mode, max_steps 下拉/输入）
  - Prompt 编辑器（Markdown 语法高亮）
  - 保存时 YAML 校验
- [ ] **实验结果持久化 + 历史对比**
  - 实验运行记录面板
  - 指标对比（当前 vs 历史最佳）
  - 结果可视化（图表嵌入）
- [ ] **Logs 页面增强**
  - 日期范围筛选
  - 按模型/backend 分组统计
  - CSV 导出
- [ ] **Skill 管理 UI 增强**
  - 前端创建 Skill（表单 → 生成 SKILL.md）
  - Skill 使用统计

### P3 — 长期规划

- [ ] **SQLite 替代 JSON/YAML** — 项目元数据、session、token 追踪迁移到数据库
- [ ] **引用关系图 + 知识图谱** — 论文引用网络可视化
- [ ] **Path-specific Skills** — Skills 按文件路径模式触发（不仅关键词）
- [ ] **多语言扩展** — 日语、韩语、西班牙语等
- [ ] **Electron 打包发布**
  - macOS DMG（签名 + 公证）
  - Windows NSIS 安装包
  - GitHub Release 自动发布
- [ ] **PyPI 发布** — `pip install openags`
- [ ] **API 版本化** — `/api/v1/` 前缀
- [ ] **并行 Agent 执行** — 多个 agent 同时运行（如 literature + proposal 并行）
- [ ] **自定义项目模板** — 用户创建 + 分享模板
- [ ] **插件系统** — 第三方工具/skill 包管理

### 代码质量

- [ ] **测试覆盖补全**
  - messaging/（bot, channels）
  - Desktop ↔ Python WebSocket 集成测试
  - 端到端科研流程测试
  - 修复 `test_server.py` 失败的 test case
- [ ] **清理未使用代码**
  - `openags/agent/message_bus.py` — 集成或删除
  - `openags/agent/worktree.py` — 集成或删除
  - `openags/agent/task_list.py` — 集成或删除
- [ ] **TypeScript 类型安全** — 减少 `as any` 使用
