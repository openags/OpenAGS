/**
 * Lightweight i18n system.
 *
 * Usage:
 *   const { t, locale, setLocale, LOCALES } = useLocale()
 *   t('settings.title')  // → "Settings" or "设置"
 */

import { useCallback, useEffect, useState } from 'react'

export type Locale = 'en' | 'zh'

export interface LocaleOption {
  code: Locale
  label: string
  nativeLabel: string
}

export const LOCALES: LocaleOption[] = [
  { code: 'en', label: 'English', nativeLabel: 'English' },
  { code: 'zh', label: 'Chinese', nativeLabel: '中文' },
]

const STORAGE_KEY = 'openags-locale'

type Dict = Record<string, string | Record<string, string | Record<string, string>>>

// Flatten nested dict: { a: { b: "x" } } → { "a.b": "x" }
function flatten(obj: Dict, prefix = ''): Record<string, string> {
  const result: Record<string, string> = {}
  for (const [k, v] of Object.entries(obj)) {
    const key = prefix ? `${prefix}.${k}` : k
    if (typeof v === 'string') {
      result[key] = v
    } else {
      Object.assign(result, flatten(v as Dict, key))
    }
  }
  return result
}

const en: Dict = {
  // Settings page
  settings: {
    title: 'Settings',
    saveAll: 'Save All Changes',
    backendSection: 'Agent Backend',
    backendType: 'Backend Type',
    backendTypeHint: 'Choose which backend executes agent tasks',
    model: 'Model',
    modelHint: 'e.g. claude-sonnet-4-6, gpt-4o, deepseek/deepseek-chat',
    defaultApiKey: 'Default API Key',
    keySet: 'Key is set (enter new value to change)',
    noKey: 'No key configured',
    cliInfo: 'is a CLI-based backend',
    cliDetail: 'CLI backends use their own authentication (login via CLI). No API key or model selection needed here. Make sure the CLI tool is installed and available in your PATH.',
    timeout: 'Timeout (seconds)',
    apiKeysSection: 'API Keys',
    apiKeysHint: 'Configure API keys for different LLM providers. These are used by the built-in (LiteLLM) backend to route requests to the appropriate provider based on the model name.',
    generalSection: 'General',
    workspace: 'Workspace Directory',
    logLevel: 'Log Level',
    tokenBudget: 'Token Budget (USD)',
    tokenBudgetHint: 'Leave empty for no limit',
    configInfo: 'Configuration',
    configDetail: 'Changes are saved to your local config file and take effect immediately. The backend is reinitialized after each update.',
    language: 'Language',
    languageHint: 'Interface display language',
    testConnection: 'Test Connection',
    testing: 'Testing...',
    connected: 'Connected',
    connectionFailed: 'Connection failed',
    selectModel: 'Select model',
    customModel: 'Custom model name',
  },
  // Manuscript editor
  manuscript: {
    files: 'Files',
    newFile: 'New file',
    newFolder: 'New folder',
    refresh: 'Refresh',
    hideTree: 'Hide file tree',
    showTree: 'Show file tree',
    save: 'Save',
    compile: 'Compile',
    compiling: 'Compiling...',
    preview: 'Preview',
    hidePreview: 'Hide Preview',
    selectFile: 'Select a file to edit',
    selectFileHint: 'Right-click in file tree to create files',
    unsaved: 'unsaved',
    viewLog: 'View compile log',
    pdfPreview: 'PDF Preview',
    compileToSee: 'Compile to see PDF preview',
    enterFileName: 'Enter file name...',
    enterFolderName: 'Enter folder name...',
    confirmDelete: 'Confirm delete?',
    cancel: 'Cancel',
    delete: 'Delete',
    rename: 'Rename',
    enterNewName: 'Enter new name...',
    createFailed: 'Create failed',
    deleteFailed: 'Delete failed',
  },
  // Sidebar & navigation
  nav: {
    projects: 'Projects',
    skills: 'Skills',
    settings: 'Settings',
    searchProjects: 'Search projects...',
    noProjects: 'No projects yet',
    newChat: 'New Chat',
    editProject: 'Edit',
    projectName: 'Project Name',
    description: 'Description',
  },
  // Common
  common: {
    save: 'Save',
    cancel: 'Cancel',
    delete: 'Delete',
    rename: 'Rename',
    confirm: 'Confirm',
    loading: 'Loading...',
    saved: 'Saved',
    failed: 'Failed',
  },
  // Backend types
  backend: {
    builtin: 'LiteLLM (Built-in)',
    builtinDesc: 'Use any LLM via LiteLLM. Supports OpenAI, Anthropic, Google, and many more.',
    claudeCode: 'Claude Code',
    claudeCodeDesc: 'Use Anthropic Claude Code CLI as backend. Requires claude CLI installed.',
    codex: 'Codex (OpenAI)',
    codexDesc: 'Use OpenAI Codex CLI as backend. Requires codex CLI installed.',
    copilot: 'Copilot CLI',
    copilotDesc: 'Use GitHub Copilot CLI as backend. Requires gh copilot extension.',
    geminiCli: 'Gemini CLI',
    geminiCliDesc: 'Use Google Gemini CLI as backend. Requires gemini CLI installed.',
  },
}

const zh: Dict = {
  settings: {
    title: '设置',
    saveAll: '保存所有更改',
    backendSection: 'Agent 后端',
    backendType: '后端类型',
    backendTypeHint: '选择执行 Agent 任务的后端',
    model: '模型',
    modelHint: '如 claude-sonnet-4-6, gpt-4o, deepseek/deepseek-chat',
    defaultApiKey: '默认 API Key',
    keySet: 'Key 已设置（输入新值以更换）',
    noKey: '未配置 Key',
    cliInfo: '是 CLI 类型后端',
    cliDetail: 'CLI 后端使用自身的认证方式（通过 CLI 登录）。无需在此配置 API Key 或模型。请确保对应 CLI 工具已安装并在 PATH 中。',
    timeout: '超时时间（秒）',
    apiKeysSection: 'API 密钥',
    apiKeysHint: '为不同 LLM 提供商配置 API Key。内置 LiteLLM 后端会根据模型名称自动路由到对应提供商。',
    generalSection: '通用',
    workspace: '工作目录',
    logLevel: '日志级别',
    tokenBudget: 'Token 预算（美元）',
    tokenBudgetHint: '留空表示无限制',
    configInfo: '配置信息',
    configDetail: '更改会保存到本地配置文件并立即生效。每次更新后后端会重新初始化。',
    language: '语言',
    languageHint: '界面显示语言',
    testConnection: '测试连接',
    testing: '测试中...',
    connected: '已连接',
    connectionFailed: '连接失败',
    selectModel: '选择模型',
    customModel: '自定义模型名称',
  },
  manuscript: {
    files: '文件',
    newFile: '新建文件',
    newFolder: '新建文件夹',
    refresh: '刷新',
    hideTree: '隐藏文件树',
    showTree: '显示文件树',
    save: '保存',
    compile: '编译',
    compiling: '编译中...',
    preview: '预览',
    hidePreview: '隐藏预览',
    selectFile: '选择文件以编辑',
    selectFileHint: '右键点击文件树可创建文件',
    unsaved: '未保存',
    viewLog: '查看编译日志',
    pdfPreview: 'PDF 预览',
    compileToSee: '编译后查看 PDF 预览',
    enterFileName: '输入文件名...',
    enterFolderName: '输入文件夹名...',
    confirmDelete: '确认删除？',
    cancel: '取消',
    delete: '删除',
    rename: '重命名',
    enterNewName: '输入新名称...',
    createFailed: '创建失败',
    deleteFailed: '删除失败',
  },
  nav: {
    projects: '项目',
    skills: '技能',
    settings: '设置',
    searchProjects: '搜索项目...',
    noProjects: '暂无项目',
    editProject: '编辑',
    projectName: '项目名称',
    description: '描述',
    newChat: '新建对话',
  },
  common: {
    save: '保存',
    cancel: '取消',
    delete: '删除',
    rename: '重命名',
    confirm: '确认',
    loading: '加载中...',
    saved: '已保存',
    failed: '失败',
  },
  backend: {
    builtin: 'LiteLLM（内置）',
    builtinDesc: '通过 LiteLLM 使用任何 LLM。支持 OpenAI、Anthropic、Google 等。',
    claudeCode: 'Claude Code',
    claudeCodeDesc: '使用 Anthropic Claude Code CLI 作为后端。需安装 claude CLI。',
    codex: 'Codex (OpenAI)',
    codexDesc: '使用 OpenAI Codex CLI 作为后端。需安装 codex CLI。',
    copilot: 'Copilot CLI',
    copilotDesc: '使用 GitHub Copilot CLI 作为后端。需安装 gh copilot 扩展。',
    geminiCli: 'Gemini CLI',
    geminiCliDesc: '使用 Google Gemini CLI 作为后端。需安装 gemini CLI。',
  },
}

const translations: Record<Locale, Record<string, string>> = {
  en: flatten(en),
  zh: flatten(zh),
}

function getStoredLocale(): Locale {
  if (typeof window === 'undefined') return 'en'
  const stored = window.localStorage.getItem(STORAGE_KEY)
  if (stored === 'zh' || stored === 'en') return stored
  // Auto-detect from browser
  const browserLang = navigator.language.toLowerCase()
  if (browserLang.startsWith('zh')) return 'zh'
  return 'en'
}

// Global state so all hooks share the same locale
let _currentLocale: Locale = getStoredLocale()
const _listeners = new Set<() => void>()

function _setGlobalLocale(locale: Locale) {
  _currentLocale = locale
  if (typeof window !== 'undefined') {
    window.localStorage.setItem(STORAGE_KEY, locale)
  }
  _listeners.forEach((fn) => fn())
}

export function useLocale() {
  const [, forceUpdate] = useState(0)

  useEffect(() => {
    const handler = () => forceUpdate((n) => n + 1)
    _listeners.add(handler)
    return () => { _listeners.delete(handler) }
  }, [])

  const t = useCallback((key: string): string => {
    return translations[_currentLocale][key] || translations.en[key] || key
  }, [])

  return {
    locale: _currentLocale,
    setLocale: _setGlobalLocale,
    t,
    LOCALES,
  }
}
