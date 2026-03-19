# OpenAGS 迭代计划

> 2026-03-20 更新

---

## 已完成

### 核心架构
- [x] Agent 引擎与科研应用层完全解耦（agent/ ↔ research/）
- [x] Folder = Agent — 放 SOUL.md 就是新 agent
- [x] 12 个内置工具（read, write, edit, ls, grep, bash, fetch, sub_agent, ask_user, mcp, arxiv, semantic_scholar）
- [x] Skill 系统 — SKILL.md 兼容 Claude Code + symlink 自动发现 + Path-specific 触发
- [x] 配置同步 — SOUL.md ↔ CLAUDE.md ↔ AGENTS.md ↔ GEMINI.md
- [x] 7 个科研 Agent + Coordinator PIVOT/REFINE/PROCEED 决策 + 上下游依赖固化
- [x] 自主实验循环模板

### Backend
- [x] Builtin agent（litellm, 100+ LLM provider）
- [x] CLI agent 由 Node.js 管理（Claude Code SDK, Codex SDK, Cursor CLI, Gemini CLI）
- [x] Provider 配置直写 CLI 工具配置文件 + 预设
- [x] Session resume + GPU 检测 + SSH 远程 + Docker 沙箱
- [x] 实验自动修复循环 + on_output 回调 + 阶段检查点
- [x] auto_memory 分类提取 + 失败学习 + 去重
- [x] Message Bus + WebFetch + 认证 + Token 追踪
- [x] 项目导出 ZIP + 克隆 + 自定义模板（save-as-template + templates/list API）

### 前端
- [x] 统一 UI（浏览器 + Electron，全 WebSocket）
- [x] Chat Bubbles（SDK 结构化消息 + Markdown + 代码块 Copy + 对话搜索）
- [x] 对话管理（Thread + providerSessionId）
- [x] ManuscriptEditor（CodeMirror 编辑器 + LaTeX 自动补全 + PDF 编译）
- [x] Settings 分页 + CLI Provider 配置 + Compute & Servers
- [x] 暗色模式 + 6 语言 i18n + IM 通知配置
- [x] Dashboard 统计 + 模块进度条 + 项目右键菜单（Clone/Export/Delete）
- [x] Logs CSV 导出 + Skills source_path 显示

### 基础设施
- [x] CI/CD（ci.yml + release.yml）+ Electron 应用图标 + entitlements
- [x] Dockerfile + docker-compose.yml + .env.example
- [x] OWASP 安全头 + 373 tests + 0 `as any`

---

## 后续优化方向

- [ ] macOS 签名 + 公证（需要 Apple Developer 账号）
- [ ] 引用关系图 + 知识图谱可视化
- [ ] 并行 Agent 执行
- [ ] 插件系统（第三方 skill 包管理）
- [ ] MCP 集成增强（外部 MCP server）
- [ ] localStorage 大对象分片存储
