# OpenAGS 迭代计划

> 2026-03-20 更新 — v0.0.1

## 全部完成

### 核心架构
- [x] Agent 引擎与科研应用层解耦 + Folder = Agent
- [x] 12 个内置工具 + Skill 系统（Claude Code 兼容 + Path-specific 触发）
- [x] 配置同步（SOUL.md ↔ CLAUDE.md ↔ AGENTS.md ↔ GEMINI.md）
- [x] 7 个科研 Agent + PIVOT/REFINE/PROCEED 决策 + 自主实验循环

### Backend
- [x] Builtin agent（litellm, 100+ LLM）+ CLI agent（Claude Code/Codex/Cursor/Gemini SDK）
- [x] Provider 配置直写 CLI 工具文件 + 预设 + Session resume
- [x] GPU 检测 + SSH 远程 + Docker 沙箱 + 实验自动修复 + on_output 回调
- [x] 阶段检查点 + auto_memory 分类提取 + Message Bus
- [x] WebFetch + 认证 + Token 追踪 + 项目导出/克隆/自定义模板
- [x] 并行 Agent 执行（run_agents_parallel）
- [x] 引用关系图 API（citation_graph + GET /citations）
- [x] 插件系统（PluginManager + manifest.json + 自动加载 skills）
- [x] MCP 集成 + 插件/MCP 列表 API

### 前端
- [x] 统一 UI（浏览器 + Electron）+ 全 WebSocket
- [x] Chat Bubbles（Markdown + 代码块 Copy + 对话搜索）
- [x] ManuscriptEditor（CodeMirror + LaTeX 自动补全 + PDF 编译）
- [x] Settings 分页 + CLI Provider 配置 + Compute & Servers
- [x] 暗色模式 + 6 语言 i18n + IM 通知配置
- [x] Dashboard 统计 + 项目右键菜单（Clone/Export/Delete）
- [x] Logs CSV 导出 + Skills 页面增强
- [x] localStorage 分片存储（大对象自动分 chunk）

### 基础设施
- [x] CI/CD（ci.yml + release.yml）+ Electron 图标 + entitlements
- [x] Dockerfile + docker-compose.yml + .env.example + OWASP 安全头
- [x] 373 tests + 0 `as any` + 版本 v0.0.1

---

## 后续优化方向（需外部资源或大规模改动）

- [ ] macOS 签名 + 公证（需要 Apple Developer 账号 $99/年）
- [ ] Windows 代码签名（需要 EV 证书）
- [ ] 知识图谱前端可视化（D3.js / Cytoscape.js 渲染引用网络）
- [ ] 实验结果对比面板（指标趋势图）
- [ ] 对话消息编辑/重发
- [ ] 项目标签/分组
