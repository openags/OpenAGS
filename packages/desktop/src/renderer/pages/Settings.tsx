import React, { useEffect, useState } from 'react'
import { message } from 'antd'
import {
  Settings2,
  Server,
  Gauge,
  Save,
  Eye,
  EyeOff,
  CheckCircle2,
  Terminal,
  Cpu,
  Bot,
  Sparkles,
  Globe,
  ChevronDown,
  Wifi,
  WifiOff,
  Loader2,
  Plus,
  Trash2,
  MonitorCheck,
  HardDrive,
} from 'lucide-react'

type SettingsTab = 'backend' | 'keys' | 'compute' | 'general'
import { api } from '../services/api'
import { useLocale } from '../services/i18n'

interface BackendCfg { type: string; model: string; api_key: string | null; timeout: number }
interface Config {
  workspace_dir: string; log_level: string; default_backend: BackendCfg
  backends: Record<string, { model?: string; api_key?: string | null; timeout?: number }>
  token_budget_usd: number | null
}
interface EditableField { key: string; value: string; dirty: boolean }

const BACKEND_TYPES = [
  { value: 'claude_code', label: 'Claude Code', icon: Terminal, description: 'Anthropic Claude Code — recommended.', color: '#7c5cf7', installHint: 'npm install -g @anthropic-ai/claude-code', available: true },
  { value: 'codex', label: 'Codex (OpenAI)', icon: Bot, description: 'OpenAI Codex CLI.', color: '#22c55e', installHint: 'npm install -g @openai/codex', available: true },
  { value: 'copilot', label: 'GitHub Copilot', icon: Sparkles, description: 'GitHub Copilot via SDK. Requires Copilot subscription.', color: '#f59e0b', installHint: 'npm install -g @github/copilot-sdk', available: true },
  { value: 'gemini_cli', label: 'Gemini CLI', icon: Terminal, description: 'Google Gemini CLI.', color: '#ef4444', installHint: 'npm install -g @google/gemini-cli', available: true },
]

const MODEL_GROUPS = [
  { provider: 'Anthropic', models: ['claude-sonnet-4-6', 'claude-opus-4-6', 'claude-haiku-4-5'] },
  { provider: 'OpenAI', models: ['gpt-4o', 'gpt-4o-mini', 'o3-mini'] },
  { provider: 'Google', models: ['gemini-2.5-pro', 'gemini-2.0-flash'] },
  { provider: 'DeepSeek', models: ['deepseek/deepseek-chat', 'deepseek/deepseek-reasoner'] },
  { provider: 'OpenRouter', models: ['openrouter/auto'] },
]

interface ApiKeyEntry { provider: string; envVar: string; value: string; dirty: boolean }
const API_KEY_PROVIDERS = [
  { provider: 'Anthropic', envVar: 'ANTHROPIC_API_KEY', placeholder: 'sk-ant-...' },
  { provider: 'OpenAI', envVar: 'OPENAI_API_KEY', placeholder: 'sk-...' },
  { provider: 'Google AI', envVar: 'GOOGLE_API_KEY', placeholder: 'AIza...' },
  { provider: 'DeepSeek', envVar: 'DEEPSEEK_API_KEY', placeholder: 'sk-...' },
]

export default function Settings(): React.ReactElement {
  const { t, locale, setLocale, LOCALES } = useLocale()
  const [config, setConfig] = useState<Config | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState<string | null>(null)
  const [testResult, setTestResult] = useState<'idle' | 'testing' | 'ok' | 'fail'>('idle')
  const [backendHealth, setBackendHealth] = useState<Record<string, boolean>>({})

  const [backendType, setBackendType] = useState<EditableField>({ key: 'default_backend.type', value: 'builtin', dirty: false })
  const [model, setModel] = useState<EditableField>({ key: 'default_backend.model', value: '', dirty: false })
  const [apiKey, setApiKey] = useState<EditableField>({ key: 'default_backend.api_key', value: '', dirty: false })
  const [timeout, setTimeout] = useState<EditableField>({ key: 'default_backend.timeout', value: '', dirty: false })
  const [logLevel, setLogLevel] = useState<EditableField>({ key: 'log_level', value: '', dirty: false })
  const [tokenBudget, setTokenBudget] = useState<EditableField>({ key: 'token_budget_usd', value: '', dirty: false })
  const [showApiKey, setShowApiKey] = useState(false)
  const [apiKeys, setApiKeys] = useState<ApiKeyEntry[]>([])
  const [modelDropdownOpen, setModelDropdownOpen] = useState(false)
  const [customModelInput, setCustomModelInput] = useState('')

  // CLI provider config (for Claude Code / Codex / Gemini)
  interface CLIProviderConfig { provider: string; apiKey: string; model: string; baseUrl: string }
  interface CLIPreset { id: string; name: string; color: string; category: string }
  const [cliConfig, setCliConfig] = useState<CLIProviderConfig>({ provider: '', apiKey: '', model: '', baseUrl: '' })
  const [cliPresets, setCliPresets] = useState<CLIPreset[]>([])
  const [cliSaving, setCliSaving] = useState(false)
  const [cliSaved, setCliSaved] = useState(false)
  const [showCliKey, setShowCliKey] = useState(false)

  const cliWsRef = React.useRef<WebSocket | null>(null)

  // Load CLI config when backend type changes to a CLI backend
  useEffect(() => {
    const bt = backendType.value
    if (!['claude_code', 'codex', 'gemini_cli', 'copilot'].includes(bt)) return

    const host = window.location.port === '3090' ? 'localhost:19836' : window.location.host
    const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
    const ws = new WebSocket(`${proto}//${host}/chat`)
    cliWsRef.current = ws

    ws.onopen = () => {
      ws.send(JSON.stringify({ type: 'read-cli-config', backend: bt }))
    }
    ws.onmessage = (event) => {
      const msg = JSON.parse(event.data)
      if (msg.type === 'cli-config') {
        setCliConfig(msg.config)
        setCliPresets(msg.presets || [])
      }
      if (msg.type === 'cli-config-saved') {
        setCliSaving(false)
        setCliSaved(true)
        window.setTimeout(() => setCliSaved(false), 2000)
      }
    }
    return () => { ws.close(); cliWsRef.current = null }
  }, [backendType.value])

  const saveCliConfig = () => {
    if (!cliWsRef.current) return
    setCliSaving(true)
    cliWsRef.current.send(JSON.stringify({
      type: 'write-cli-config',
      backend: backendType.value,
      config: cliConfig,
    }))
  }

  const selectCliPreset = (presetId: string) => {
    const preset = cliPresets.find(p => p.id === presetId)
    if (!preset) return
    setCliConfig(prev => ({
      ...prev,
      provider: presetId,
      // Keep user's API key, update model/baseUrl from preset
      ...(presetId === 'anthropic' || presetId === 'openai' || presetId === 'google'
        ? { model: '', baseUrl: '' }
        : {}),
    }))
  }

  const [activeTab, setActiveTab] = useState<SettingsTab>('backend')

  // Theme
  const [theme, setTheme] = useState(() => localStorage.getItem('openags-theme') || 'light')
  const toggleTheme = (t: string) => {
    setTheme(t)
    localStorage.setItem('openags-theme', t)
    document.documentElement.setAttribute('data-theme', t)
  }

  // Compute section state
  interface GPUInfo { index: number; name: string; memory_total_mb: number; memory_free_mb: number; utilization_percent: number }
  interface RemoteServerInfo { name: string; host: string; port: number; user: string; key_file: string | null; gpus: number[] }

  const [gpus, setGpus] = useState<GPUInfo[]>([])
  const [gpuLoading, setGpuLoading] = useState(false)
  const [servers, setServers] = useState<RemoteServerInfo[]>([])
  const [showAddServer, setShowAddServer] = useState(false)
  const [newServer, setNewServer] = useState({ name: '', host: '', port: '22', user: '', key_file: '' })
  const [serverTestResults, setServerTestResults] = useState<Record<string, { status: 'idle' | 'testing' | 'ok' | 'fail'; info?: string; error?: string }>>({})
  const [executionMode, setExecutionMode] = useState('local')

  const fetchGpus = async () => {
    setGpuLoading(true)
    try {
      const data = await api.get<GPUInfo[]>('/api/gpu/devices')
      setGpus(data)
    } catch { setGpus([]) }
    setGpuLoading(false)
  }

  const fetchServers = async () => {
    try {
      const data = await api.get<RemoteServerInfo[]>('/api/config/remote-servers')
      setServers(data)
    } catch { setServers([]) }
  }

  const addServer = async () => {
    if (!newServer.name || !newServer.host || !newServer.user) return
    try {
      await api.post('/api/config/remote-servers', {
        name: newServer.name, host: newServer.host, port: parseInt(newServer.port) || 22,
        user: newServer.user, key_file: newServer.key_file || null, gpus: [],
      })
      message.success(`Server "${newServer.name}" added`)
      setNewServer({ name: '', host: '', port: '22', user: '', key_file: '' })
      setShowAddServer(false)
      void fetchServers()
    } catch { message.error('Failed to add server') }
  }

  const deleteServer = async (name: string) => {
    try {
      await api.delete(`/api/config/remote-servers/${name}`)
      message.success(`Server "${name}" deleted`)
      void fetchServers()
    } catch { message.error('Failed to delete server') }
  }

  const testServer = async (name: string) => {
    setServerTestResults(prev => ({ ...prev, [name]: { status: 'testing' } }))
    try {
      const r = await api.post<{ connected: boolean; gpu_info: string; error: string | null }>(`/api/config/remote-servers/${name}/test`, {})
      if (r.connected) {
        setServerTestResults(prev => ({ ...prev, [name]: { status: 'ok', info: r.gpu_info } }))
      } else {
        setServerTestResults(prev => ({ ...prev, [name]: { status: 'fail', error: r.error || 'Failed' } }))
      }
    } catch {
      setServerTestResults(prev => ({ ...prev, [name]: { status: 'fail', error: 'Request failed' } }))
    }
  }

  const saveExecutionMode = async (mode: string) => {
    setExecutionMode(mode)
    try {
      await api.put('/api/config/compute', { experiment_sandbox: mode, experiment_timeout: 300 })
      message.success('Execution mode updated')
    } catch { message.error('Failed to update') }
  }

  const fetchConfig = async () => {
    setLoading(true)
    try {
      const data = await api.get<Config>('/api/config/')
      setConfig(data)
      setBackendType({ key: 'default_backend.type', value: data.default_backend.type || 'builtin', dirty: false })
      setModel({ key: 'default_backend.model', value: data.default_backend.model || '', dirty: false })
      setApiKey({ key: 'default_backend.api_key', value: '', dirty: false })
      setTimeout({ key: 'default_backend.timeout', value: String(data.default_backend.timeout || 120), dirty: false })
      setLogLevel({ key: 'log_level', value: data.log_level || 'INFO', dirty: false })
      setTokenBudget({ key: 'token_budget_usd', value: data.token_budget_usd != null ? String(data.token_budget_usd) : '', dirty: false })
      const keys: ApiKeyEntry[] = API_KEY_PROVIDERS.map((p) => ({
        provider: p.provider, envVar: p.envVar, value: '', dirty: false,
      }))
      setApiKeys(keys)
    } catch { message.error('Failed to load configuration') }
    setLoading(false)
  }

  useEffect(() => {
    void fetchConfig()
    void fetchGpus()
    void fetchServers()
    // Fetch backend health in background
    api.get<{ results: Record<string, boolean> }>('/api/config/backends/test')
      .then((res) => setBackendHealth(res.results))
      .catch(() => {})
  }, [])

  // Close model dropdown on outside click
  useEffect(() => {
    if (!modelDropdownOpen) return
    const close = () => setModelDropdownOpen(false)
    window.addEventListener('click', close)
    return () => window.removeEventListener('click', close)
  }, [modelDropdownOpen])

  const saveField = async (field: EditableField, setter: React.Dispatch<React.SetStateAction<EditableField>>) => {
    if (!field.dirty) return
    setSaving(field.key)
    try {
      await api.put('/api/config/', { key: field.key, value: field.value })
      setter((prev) => ({ ...prev, dirty: false }))
      message.success(`Saved ${field.key.split('.').pop()}`)
      const data = await api.get<Config>('/api/config/')
      setConfig(data)
    } catch { message.error(`Failed to save ${field.key}`) }
    setSaving(null)
  }

  const saveAllDirty = async () => {
    const dirtyFields: [EditableField, React.Dispatch<React.SetStateAction<EditableField>>][] = []
    if (backendType.dirty) dirtyFields.push([backendType, setBackendType])
    if (model.dirty) dirtyFields.push([model, setModel])
    if (apiKey.dirty) dirtyFields.push([apiKey, setApiKey])
    if (timeout.dirty) dirtyFields.push([timeout, setTimeout])
    if (logLevel.dirty) dirtyFields.push([logLevel, setLogLevel])
    if (tokenBudget.dirty) dirtyFields.push([tokenBudget, setTokenBudget])
    for (const [field, setter] of dirtyFields) await saveField(field, setter)
    for (const entry of apiKeys) {
      if (entry.dirty && entry.value.trim()) {
        try {
          await api.put('/api/config/', { key: `backends.${entry.provider.toLowerCase()}.api_key`, value: entry.value })
          message.success(`Saved ${entry.provider} API key`)
        } catch { message.error(`Failed to save ${entry.provider} API key`) }
      }
    }
    setApiKeys((prev) => prev.map((k) => ({ ...k, dirty: false })))
  }

  const handleBackendChange = async (type: string) => {
    setBackendType({ key: 'default_backend.type', value: type, dirty: false })
    setTestResult('idle')
    setSaving('default_backend.type')
    try {
      await api.put('/api/config/', { key: 'default_backend.type', value: type })
      message.success(`Backend switched to ${BACKEND_TYPES.find((b) => b.value === type)?.label || type}`)
      const data = await api.get<Config>('/api/config/')
      setConfig(data)
      setModel({ key: 'default_backend.model', value: data.default_backend.model || '', dirty: false })
    } catch { message.error('Failed to switch backend') }
    setSaving(null)
  }

  const testBackend = async () => {
    setTestResult('testing')
    try {
      const res = await api.get<{ results: Record<string, boolean> }>('/api/config/backends/test')
      setBackendHealth(res.results)
      const ok = res.results[backendType.value]
      setTestResult(ok ? 'ok' : 'fail')
    } catch { setTestResult('fail') }
  }

  const selectModel = (modelName: string) => {
    setModel({ ...model, value: modelName, dirty: true })
    setModelDropdownOpen(false)
    setCustomModelInput('')
    // Auto-switch to builtin backend when selecting a model from the dropdown
    if (backendType.value !== 'builtin') {
      void handleBackendChange('builtin')
    }
  }

  const hasDirty = backendType.dirty || model.dirty || apiKey.dirty || timeout.dirty || logLevel.dirty || tokenBudget.dirty || apiKeys.some((k) => k.dirty)
  const selectedBackend = BACKEND_TYPES.find((b) => b.value === backendType.value) || BACKEND_TYPES[0]
  const isCLIBackend = ['claude_code', 'codex', 'copilot', 'gemini_cli'].includes(backendType.value)

  // Check if current model is in presets
  const allPresetModels = MODEL_GROUPS.flatMap((g) => g.models)
  const isCustomModel = model.value && !allPresetModels.includes(model.value)

  if (loading || !config) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '60vh' }}>
        <div style={{ color: 'var(--text-tertiary)' }}>Loading settings...</div>
      </div>
    )
  }

  const TABS: { key: SettingsTab; label: string; icon: typeof Server }[] = [
    { key: 'backend', label: 'Backend', icon: Server },
    { key: 'compute', label: 'Compute', icon: HardDrive },
    { key: 'general', label: 'General', icon: Gauge },
  ]

  return (
    <div style={{ padding: '28px 32px', maxWidth: 960, margin: '0 auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
        <h2 style={{ fontSize: 20, fontWeight: 700, margin: 0, color: 'var(--text)' }}>{t('settings.title')}</h2>
        {hasDirty && (
          <button type="button" onClick={() => void saveAllDirty()} disabled={saving !== null}
            style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 16px', border: 'none', borderRadius: 8, background: 'var(--accent)', color: '#fff', fontSize: 13, fontWeight: 600, cursor: saving ? 'not-allowed' : 'pointer', opacity: saving ? 0.7 : 1 }}>
            <Save size={14} /> {t('settings.saveAll')}
          </button>
        )}
      </div>

      {/* Tab bar */}
      <div style={{
        display: 'flex', gap: 4, marginBottom: 20, padding: 4,
        background: 'var(--bg-sidebar)', borderRadius: 10, border: '1px solid var(--border)',
      }}>
        {TABS.map(tab => {
          const Icon = tab.icon
          const isActive = activeTab === tab.key
          return (
            <button key={tab.key} type="button" onClick={() => setActiveTab(tab.key)}
              style={{
                flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                padding: '8px 12px', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 500,
                cursor: 'pointer', transition: 'all var(--transition)',
                background: isActive ? 'var(--bg-card)' : 'transparent',
                color: isActive ? 'var(--accent)' : 'var(--text-secondary)',
                boxShadow: isActive ? 'var(--shadow-sm)' : 'none',
              }}>
              <Icon size={14} /> {tab.label}
            </button>
          )
        })}
      </div>

      {/* Backend Selection */}
      {activeTab === 'backend' && <SettingsSection icon={Server} title={t('settings.backendSection')} color="#4f6ef7">
        <SettingsField label={t('settings.backendType')} hint={t('settings.backendTypeHint')}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            {BACKEND_TYPES.map((bt) => {
              const Icon = bt.icon
              const isSelected = backendType.value === bt.value
              const isAvailable = bt.available !== false
              const health = backendHealth[bt.value]
              const isInstalled = health === true
              const isChecked = health !== undefined
              return (
                <div key={bt.value}
                  onClick={() => { if (isAvailable) void handleBackendChange(bt.value) }}
                  style={{
                    padding: '12px 14px', borderRadius: 10,
                    border: `2px solid ${isSelected ? bt.color : 'var(--border)'}`,
                    background: isSelected ? `${bt.color}08` : isAvailable ? 'var(--bg-card)' : 'var(--bg-sidebar)',
                    cursor: isAvailable ? 'pointer' : 'not-allowed',
                    opacity: isAvailable ? 1 : 0.45,
                    transition: 'all 0.15s',
                    display: 'flex', flexDirection: 'column', gap: 6,
                  }}
                  onMouseEnter={(e) => { if (isAvailable && !isSelected) e.currentTarget.style.borderColor = `${bt.color}60` }}
                  onMouseLeave={(e) => { if (isAvailable && !isSelected) e.currentTarget.style.borderColor = 'var(--border)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <div style={{ width: 28, height: 28, borderRadius: 7, background: `${bt.color}12`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <Icon size={14} color={isAvailable ? bt.color : '#aaa'} strokeWidth={2} />
                    </div>
                    <span style={{ fontSize: 13, fontWeight: isSelected ? 600 : 500, color: isSelected ? bt.color : isAvailable ? 'var(--text)' : 'var(--text-tertiary)' }}>{bt.label}</span>
                    <span style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 4 }}>
                      {!isAvailable && (
                        <span style={{ fontSize: 10, fontWeight: 500, color: 'var(--text-tertiary)', background: 'var(--bg-input)', padding: '1px 6px', borderRadius: 4 }}>Coming soon</span>
                      )}
                      {isAvailable && isChecked && (
                        isInstalled
                          ? <span style={{ fontSize: 10, fontWeight: 600, color: '#22c55e', background: 'rgba(34,197,94,0.1)', padding: '1px 6px', borderRadius: 4 }}>Ready</span>
                          : <span style={{ fontSize: 10, fontWeight: 600, color: '#ef4444', background: 'rgba(239,68,68,0.1)', padding: '1px 6px', borderRadius: 4 }}>Not installed</span>
                      )}
                      {isSelected && <CheckCircle2 size={14} color={bt.color} />}
                    </span>
                  </div>
                  <div style={{ fontSize: 11, color: isAvailable ? 'var(--text-tertiary)' : 'var(--text-tertiary)', lineHeight: 1.4 }}>{bt.description}</div>
                  {isAvailable && isChecked && !isInstalled && bt.installHint && (
                    <div style={{ fontSize: 10, color: 'var(--text-tertiary)', background: 'var(--bg-input)', padding: '4px 8px', borderRadius: 4, fontFamily: 'monospace', lineHeight: 1.4 }}>
                      Install: <code style={{ color: 'var(--accent)' }}>{bt.installHint}</code>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </SettingsField>

        {/* Test Connection */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
          <button type="button" onClick={() => void testBackend()} disabled={testResult === 'testing'}
            style={{ padding: '6px 14px', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--bg-card)', fontSize: 12, fontWeight: 500, cursor: testResult === 'testing' ? 'wait' : 'pointer', display: 'flex', alignItems: 'center', gap: 6, color: 'var(--text)' }}>
            {testResult === 'testing' ? <Loader2 size={13} style={{ animation: 'spin 1s linear infinite' }} /> : <Wifi size={13} />}
            {t('settings.testConnection')}
          </button>
          {testResult === 'ok' && (
            <span style={{ fontSize: 12, color: '#22c55e', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 4 }}>
              <CheckCircle2 size={13} /> {t('settings.connected')}
            </span>
          )}
          {testResult === 'fail' && (
            <span style={{ fontSize: 12, color: '#ef4444', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 4 }}>
              <WifiOff size={13} /> {t('settings.connectionFailed')}
            </span>
          )}
        </div>

        {/* Model selector - only for builtin backend */}
        {!isCLIBackend && (
          <SettingsField label={t('settings.model')} hint={t('settings.modelHint')}>
            <div style={{ position: 'relative' }}>
              <div onClick={(e) => { e.stopPropagation(); setModelDropdownOpen(!modelDropdownOpen) }}
                style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 10px', border: `1px solid ${model.dirty ? 'var(--accent)' : 'var(--border)'}`, borderRadius: 6, fontSize: 13, cursor: 'pointer', background: 'var(--bg-input)', color: model.value ? 'var(--text)' : 'var(--text-tertiary)', transition: 'border-color var(--transition)' }}>
                <span>{model.value || t('settings.selectModel')}</span>
                <ChevronDown size={14} color="var(--text-tertiary)" />
              </div>

              {modelDropdownOpen && (
                <div onClick={(e) => e.stopPropagation()}
                  style={{ position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 100, background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 8, boxShadow: '0 8px 24px rgba(0,0,0,0.12)', maxHeight: 320, overflowY: 'auto', marginTop: 4 }}>
                  {MODEL_GROUPS.map((group) => (
                    <div key={group.provider}>
                      <div style={{ padding: '6px 12px', fontSize: 11, fontWeight: 600, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: 0.5, background: 'var(--bg-sidebar)' }}>
                        {group.provider}
                      </div>
                      {group.models.map((m) => (
                        <div key={m} onClick={() => { selectModel(m); void saveField({ ...model, value: m, dirty: true }, setModel) }}
                          style={{ padding: '7px 12px 7px 20px', fontSize: 13, cursor: 'pointer', color: model.value === m ? 'var(--accent)' : 'var(--text)', fontWeight: model.value === m ? 600 : 400, background: model.value === m ? 'var(--accent-light)' : 'transparent' }}
                          onMouseEnter={(e) => { if (model.value !== m) e.currentTarget.style.background = 'var(--bg-hover)' }}
                          onMouseLeave={(e) => { if (model.value !== m) e.currentTarget.style.background = 'transparent' }}>
                          {m}
                        </div>
                      ))}
                    </div>
                  ))}
                  {/* Custom model input */}
                  <div style={{ borderTop: '1px solid var(--border-light)', padding: '8px 12px' }}>
                    <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-tertiary)', marginBottom: 4 }}>
                      {t('settings.customModel')}
                    </div>
                    <div style={{ display: 'flex', gap: 4 }}>
                      <input value={customModelInput}
                        onChange={(e) => setCustomModelInput(e.target.value)}
                        onKeyDown={(e) => { if (e.key === 'Enter' && customModelInput.trim()) { selectModel(customModelInput.trim()); void saveField({ ...model, value: customModelInput.trim(), dirty: true }, setModel) } }}
                        placeholder="provider/model-name"
                        style={{ flex: 1, padding: '5px 8px', border: '1px solid var(--border)', borderRadius: 4, fontSize: 12, outline: 'none', background: 'var(--bg-input)', color: 'var(--text)' }}
                      />
                      <button type="button"
                        onClick={() => { if (customModelInput.trim()) { selectModel(customModelInput.trim()); void saveField({ ...model, value: customModelInput.trim(), dirty: true }, setModel) } }}
                        style={{ padding: '5px 10px', border: 'none', borderRadius: 4, background: 'var(--accent)', color: '#fff', fontSize: 11, fontWeight: 600, cursor: 'pointer' }}>
                        OK
                      </button>
                    </div>
                  </div>
                </div>
              )}
              {isCustomModel && (
                <div style={{ fontSize: 11, color: 'var(--text-tertiary)', marginTop: 4 }}>
                  {t('settings.customModel')}: {model.value}
                </div>
              )}
            </div>
          </SettingsField>
        )}

        {/* API Key - only for builtin backend */}
        {!isCLIBackend && (
          <SettingsField label={t('settings.defaultApiKey')} hint={config.default_backend.api_key ? t('settings.keySet') : t('settings.noKey')}>
            <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
              <div style={{ flex: 1, position: 'relative' }}>
                <input type={showApiKey ? 'text' : 'password'} value={apiKey.value}
                  onChange={(e) => setApiKey({ ...apiKey, value: e.target.value, dirty: true })}
                  onKeyDown={(e) => { if (e.key === 'Enter') void saveField(apiKey, setApiKey) }}
                  placeholder="sk-..."
                  style={{ width: '100%', padding: '8px 36px 8px 10px', border: `1px solid ${apiKey.dirty ? 'var(--accent)' : 'var(--border)'}`, borderRadius: 6, fontSize: 13, outline: 'none', background: 'var(--bg-input)', color: 'var(--text)', fontFamily: 'monospace', transition: 'border-color var(--transition)' }} />
                <button type="button" onClick={() => setShowApiKey(!showApiKey)}
                  style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-tertiary)', padding: 0, display: 'flex' }}>
                  {showApiKey ? <EyeOff size={14} /> : <Eye size={14} />}
                </button>
              </div>
              <SaveButton dirty={apiKey.dirty} saving={saving === apiKey.key} onClick={() => void saveField(apiKey, setApiKey)} />
            </div>
          </SettingsField>
        )}

        {isCLIBackend && (
          <div style={{
            padding: 16, borderRadius: 10, background: 'var(--bg-sidebar)',
            border: '1px solid var(--border)', marginBottom: 0,
          }}>
            <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 12, color: 'var(--text)' }}>
              {selectedBackend.label} Provider
            </div>

            {/* Provider preset selector */}
            {cliPresets.length > 0 && (
              <div style={{ marginBottom: 12 }}>
                <label style={{ fontSize: 12, color: 'var(--text-secondary)', display: 'block', marginBottom: 6 }}>Provider</label>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {cliPresets.map(p => (
                    <button key={p.id} type="button" onClick={() => selectCliPreset(p.id)}
                      style={{
                        padding: '5px 12px', borderRadius: 6, fontSize: 12, cursor: 'pointer',
                        border: `1px solid ${cliConfig.provider === p.id ? p.color : 'var(--border)'}`,
                        background: cliConfig.provider === p.id ? p.color + '15' : 'var(--bg-card)',
                        color: cliConfig.provider === p.id ? p.color : 'var(--text-secondary)',
                        fontWeight: cliConfig.provider === p.id ? 600 : 400,
                      }}>
                      {p.name}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* API Key */}
            <div style={{ marginBottom: 12 }}>
              <label style={{ fontSize: 12, color: 'var(--text-secondary)', display: 'block', marginBottom: 4 }}>API Key</label>
              <div style={{ display: 'flex', gap: 6 }}>
                <input
                  type={showCliKey ? 'text' : 'password'}
                  value={cliConfig.apiKey}
                  onChange={e => setCliConfig(prev => ({ ...prev, apiKey: e.target.value }))}
                  placeholder={backendType.value === 'claude_code' ? 'ANTHROPIC_AUTH_TOKEN' : backendType.value === 'copilot' ? 'GITHUB_TOKEN' : 'API Key'}
                  style={{
                    flex: 1, padding: '7px 10px', border: '1px solid var(--border)', borderRadius: 6,
                    fontSize: 12, outline: 'none', background: 'var(--bg-input)', color: 'var(--text)',
                  }}
                />
                <button type="button" onClick={() => setShowCliKey(!showCliKey)}
                  style={{ border: '1px solid var(--border)', background: 'var(--bg-card)', borderRadius: 6, padding: '0 8px', cursor: 'pointer', color: 'var(--text-tertiary)' }}>
                  {showCliKey ? <EyeOff size={13} /> : <Eye size={13} />}
                </button>
              </div>
            </div>

            {/* Model (optional override) */}
            <div style={{ marginBottom: 12 }}>
              <label style={{ fontSize: 12, color: 'var(--text-secondary)', display: 'block', marginBottom: 4 }}>Model (optional override)</label>
              <input
                value={cliConfig.model}
                onChange={e => setCliConfig(prev => ({ ...prev, model: e.target.value }))}
                placeholder={backendType.value === 'claude_code' ? 'claude-sonnet-4-6' : backendType.value === 'codex' ? 'gpt-4o' : backendType.value === 'copilot' ? 'gpt-4o' : 'gemini-2.5-flash'}
                style={{
                  width: '100%', padding: '7px 10px', border: '1px solid var(--border)', borderRadius: 6,
                  fontSize: 12, outline: 'none', background: 'var(--bg-input)', color: 'var(--text)',
                }}
              />
            </div>

            {/* Base URL (for custom providers) */}
            {backendType.value !== 'gemini_cli' && backendType.value !== 'copilot' && (
              <div style={{ marginBottom: 12 }}>
                <label style={{ fontSize: 12, color: 'var(--text-secondary)', display: 'block', marginBottom: 4 }}>Base URL (custom provider only)</label>
                <input
                  value={cliConfig.baseUrl}
                  onChange={e => setCliConfig(prev => ({ ...prev, baseUrl: e.target.value }))}
                  placeholder="https://api.anthropic.com"
                  style={{
                    width: '100%', padding: '7px 10px', border: '1px solid var(--border)', borderRadius: 6,
                    fontSize: 12, outline: 'none', background: 'var(--bg-input)', color: 'var(--text)',
                    fontFamily: 'monospace',
                  }}
                />
              </div>
            )}

            {/* Save button */}
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <button type="button" onClick={saveCliConfig} disabled={cliSaving}
                style={{
                  padding: '7px 16px', border: 'none', borderRadius: 6, fontSize: 12, fontWeight: 600,
                  background: selectedBackend.color, color: '#fff', cursor: cliSaving ? 'not-allowed' : 'pointer',
                }}>
                {cliSaving ? 'Saving...' : `Save to ${backendType.value === 'claude_code' ? '~/.claude.json' : backendType.value === 'codex' ? '~/.codex/config.toml' : backendType.value === 'copilot' ? 'env GITHUB_TOKEN' : '~/.gemini/settings.json'}`}
              </button>
              {cliSaved && <span style={{ fontSize: 12, color: 'var(--green)' }}>Saved!</span>}
            </div>

            <div style={{ marginTop: 8, fontSize: 11, color: 'var(--text-tertiary)' }}>
              Config is written directly to {backendType.value === 'claude_code' ? 'Claude Code' : backendType.value === 'codex' ? 'Codex' : backendType.value === 'copilot' ? 'GitHub Copilot' : 'Gemini CLI'}&apos;s own config file. Changes take effect on next session.
            </div>
          </div>
        )}

        {!isCLIBackend && (
          <SettingsField label={t('settings.timeout')}>
            <SettingsInput value={timeout.value} onChange={(v) => setTimeout({ ...timeout, value: v, dirty: true })} onSave={() => void saveField(timeout, setTimeout)} saving={saving === timeout.key} dirty={timeout.dirty} placeholder="120" type="number" />
          </SettingsField>
        )}
      </SettingsSection>}

      {/* General */}
      {activeTab === 'general' && <SettingsSection icon={Gauge} title={t('settings.generalSection')} color="#22c55e">
        <SettingsField label={t("settings.theme")}>
          <div style={{ display: 'flex', gap: 6 }}>
            {[
              { value: 'light', label: 'Light' },
              { value: 'dark', label: 'Dark' },
            ].map(opt => (
              <button key={opt.value} type="button" onClick={() => toggleTheme(opt.value)}
                style={{
                  padding: '6px 14px',
                  border: `1px solid ${theme === opt.value ? 'var(--accent)' : 'var(--border)'}`,
                  borderRadius: 6,
                  background: theme === opt.value ? 'var(--accent)' : 'transparent',
                  color: theme === opt.value ? '#fff' : 'var(--text-secondary)',
                  fontSize: 12, fontWeight: theme === opt.value ? 600 : 400,
                  cursor: 'pointer', transition: 'all var(--transition)',
                }}>
                {opt.label}
              </button>
            ))}
          </div>
        </SettingsField>
        <SettingsField label={t('settings.language')} hint={t('settings.languageHint')}>
          <div style={{ display: 'flex', gap: 6 }}>
            {LOCALES.map((loc) => (
              <button key={loc.code} type="button" onClick={() => setLocale(loc.code)}
                style={{ padding: '6px 14px', border: `1px solid ${locale === loc.code ? 'var(--accent)' : 'var(--border)'}`, borderRadius: 6, background: locale === loc.code ? 'var(--accent-light)' : 'transparent', color: locale === loc.code ? 'var(--accent)' : 'var(--text-secondary)', fontSize: 12, fontWeight: locale === loc.code ? 600 : 400, cursor: 'pointer', transition: 'all var(--transition)', display: 'flex', alignItems: 'center', gap: 6 }}>
                <Globe size={12} /> {loc.nativeLabel}
              </button>
            ))}
          </div>
        </SettingsField>
        <SettingsField label={t('settings.workspace')}>
          <code style={{ padding: '6px 10px', borderRadius: 6, background: 'var(--bg-input)', fontSize: 12, color: 'var(--text-secondary)', display: 'block', border: '1px solid var(--border-light)' }}>{config.workspace_dir}</code>
        </SettingsField>
        <SettingsField label={t('settings.logLevel')}>
          <div style={{ display: 'flex', gap: 4 }}>
            {['DEBUG', 'INFO', 'WARNING', 'ERROR'].map((level) => (
              <button key={level} type="button"
                onClick={() => { setLogLevel({ ...logLevel, value: level, dirty: true }); void (async () => { try { await api.put('/api/config/', { key: 'log_level', value: level }); setLogLevel((prev) => ({ ...prev, dirty: false })); message.success(`Log level set to ${level}`) } catch { message.error('Failed to update log level') } })() }}
                style={{ padding: '5px 12px', border: `1px solid ${logLevel.value === level ? 'var(--accent)' : 'var(--border)'}`, borderRadius: 6, background: logLevel.value === level ? 'var(--accent-light)' : 'transparent', color: logLevel.value === level ? 'var(--accent)' : 'var(--text-secondary)', fontSize: 12, fontWeight: logLevel.value === level ? 600 : 400, cursor: 'pointer', transition: 'all var(--transition)' }}>
                {level}
              </button>
            ))}
          </div>
        </SettingsField>
        <SettingsField label={t('settings.tokenBudget')} hint={t('settings.tokenBudgetHint')}>
          <SettingsInput value={tokenBudget.value} onChange={(v) => setTokenBudget({ ...tokenBudget, value: v, dirty: true })} onSave={() => void saveField(tokenBudget, setTokenBudget)} saving={saving === tokenBudget.key} dirty={tokenBudget.dirty} placeholder="No limit" type="number" />
        </SettingsField>

        {/* IM Notifications */}
        <SettingsField label="Notifications" hint="Get notified when experiments complete">
          {[
            { key: 'messaging.telegram.token', label: 'Telegram Bot Token', placeholder: '123456:ABC-DEF...' },
            { key: 'messaging.telegram.chat_id', label: 'Telegram Chat ID', placeholder: '-1001234567890' },
            { key: 'messaging.discord.webhook_url', label: 'Discord Webhook URL', placeholder: 'https://discord.com/api/webhooks/...' },
            { key: 'messaging.feishu.webhook_url', label: 'Feishu Webhook URL', placeholder: 'https://open.feishu.cn/open-apis/bot/v2/hook/...' },
          ].map(field => (
            <div key={field.key} style={{ marginBottom: 8 }}>
              <label style={{ fontSize: 11, color: 'var(--text-tertiary)', display: 'block', marginBottom: 3 }}>{field.label}</label>
              <div style={{ display: 'flex', gap: 6 }}>
                <input
                  placeholder={field.placeholder}
                  onKeyDown={async (e) => {
                    if (e.key === 'Enter') {
                      const val = (e.target as HTMLInputElement).value
                      if (val) {
                        try {
                          await api.put('/api/config/', { key: field.key, value: val })
                          message.success(`${field.label} saved`)
                        } catch { message.error('Failed to save') }
                      }
                    }
                  }}
                  style={{
                    flex: 1, padding: '6px 10px', border: '1px solid var(--border)', borderRadius: 6,
                    fontSize: 12, outline: 'none', background: 'var(--bg-input)', color: 'var(--text)',
                    fontFamily: 'monospace',
                  }}
                />
              </div>
            </div>
          ))}
          <div style={{ fontSize: 11, color: 'var(--text-tertiary)', marginTop: 4 }}>
            Enter value and press Enter to save. Leave empty to disable.
          </div>
        </SettingsField>
      </SettingsSection>}

      {/* ── Compute & Servers ────────────────────────── */}
      {activeTab === 'compute' && <SettingsSection icon={HardDrive} title={t('compute.title')} color="#0891b2">
        {/* Local GPU */}
        <SettingsField label={t("compute.localGpu")}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
            {gpuLoading ? (
              <span style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>Detecting...</span>
            ) : gpus.length > 0 ? (
              <span style={{ fontSize: 12, color: '#22c55e', fontWeight: 500 }}>● {gpus.length} GPU{gpus.length > 1 ? 's' : ''} detected</span>
            ) : (
              <span style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>○ No GPU detected (CPU only)</span>
            )}
            <button type="button" onClick={() => void fetchGpus()} style={{
              border: '1px solid var(--border)', background: 'var(--bg-card)', borderRadius: 6, padding: '3px 8px',
              fontSize: 11, cursor: 'pointer', color: 'var(--text-secondary)',
            }}>Refresh</button>
          </div>
          {gpus.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              {gpus.map(g => (
                <div key={g.index} style={{
                  display: 'flex', alignItems: 'center', gap: 10, padding: '6px 10px',
                  background: 'var(--bg-sidebar)', borderRadius: 6, fontSize: 12,
                }}>
                  <span style={{ fontWeight: 500, minWidth: 50 }}>GPU {g.index}</span>
                  <span style={{ flex: 1, color: 'var(--text-secondary)' }}>{g.name}</span>
                  <span style={{ color: '#22c55e' }}>{(g.memory_free_mb / 1024).toFixed(1)}GB free</span>
                  <span style={{ color: 'var(--text-tertiary)' }}>{g.utilization_percent}%</span>
                </div>
              ))}
            </div>
          )}
        </SettingsField>

        {/* Remote Servers */}
        <SettingsField label={t('compute.remoteServers')} hint={t('compute.remoteServersHint')}>
          {servers.map(s => {
            const test = serverTestResults[s.name] || { status: 'idle' }
            return (
              <div key={s.name} style={{
                padding: '10px 12px', marginBottom: 8, borderRadius: 8,
                border: '1px solid var(--border)', background: 'var(--bg-card)',
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                  <Server size={13} color="#0891b2" />
                  <span style={{ fontWeight: 600, fontSize: 13 }}>{s.name}</span>
                  <span style={{ fontSize: 11, color: 'var(--text-tertiary)', flex: 1 }}>
                    {s.user}@{s.host}:{s.port}
                  </span>
                  {test.status === 'ok' && <span style={{ fontSize: 11, color: '#22c55e' }}>● Connected</span>}
                  {test.status === 'fail' && <span style={{ fontSize: 11, color: '#ef4444' }}>● Failed</span>}
                </div>
                {s.gpus.length > 0 && (
                  <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginBottom: 4 }}>
                    GPUs: {s.gpus.join(', ')}
                  </div>
                )}
                {test.status === 'ok' && test.info && (
                  <div style={{ fontSize: 11, color: '#22c55e', marginBottom: 4 }}>{test.info}</div>
                )}
                {test.status === 'fail' && test.error && (
                  <div style={{ fontSize: 11, color: '#ef4444', marginBottom: 4 }}>{test.error}</div>
                )}
                <div style={{ display: 'flex', gap: 6 }}>
                  <button type="button" onClick={() => void testServer(s.name)} disabled={test.status === 'testing'}
                    style={{
                      border: '1px solid var(--border)', background: 'var(--bg-card)', borderRadius: 6,
                      padding: '4px 10px', fontSize: 11, cursor: 'pointer', color: 'var(--text-secondary)',
                    }}>
                    {test.status === 'testing' ? 'Testing...' : 'Test Connection'}
                  </button>
                  <button type="button" onClick={() => void deleteServer(s.name)}
                    style={{
                      border: '1px solid #fecaca', background: 'var(--bg-card)', borderRadius: 6,
                      padding: '4px 10px', fontSize: 11, cursor: 'pointer', color: '#ef4444',
                    }}>
                    <Trash2 size={10} /> Delete
                  </button>
                </div>
              </div>
            )
          })}

          {/* Add Server */}
          {showAddServer ? (
            <div style={{
              padding: '12px', borderRadius: 8, border: '1px solid var(--accent)',
              background: '#f8faff', marginTop: 4,
            }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 8 }}>
                <input placeholder="Name (e.g. gpu-server)" value={newServer.name}
                  onChange={e => setNewServer(p => ({ ...p, name: e.target.value }))}
                  style={{ padding: '6px 10px', border: '1px solid var(--border)', borderRadius: 6, fontSize: 12, outline: 'none' }} />
                <input placeholder="Host (e.g. 10.0.1.50)" value={newServer.host}
                  onChange={e => setNewServer(p => ({ ...p, host: e.target.value }))}
                  style={{ padding: '6px 10px', border: '1px solid var(--border)', borderRadius: 6, fontSize: 12, outline: 'none' }} />
                <input placeholder="Username" value={newServer.user}
                  onChange={e => setNewServer(p => ({ ...p, user: e.target.value }))}
                  style={{ padding: '6px 10px', border: '1px solid var(--border)', borderRadius: 6, fontSize: 12, outline: 'none' }} />
                <input placeholder="Port (22)" value={newServer.port}
                  onChange={e => setNewServer(p => ({ ...p, port: e.target.value }))}
                  style={{ padding: '6px 10px', border: '1px solid var(--border)', borderRadius: 6, fontSize: 12, outline: 'none' }} />
                <input placeholder="Key file (e.g. ~/.ssh/id_rsa)" value={newServer.key_file}
                  onChange={e => setNewServer(p => ({ ...p, key_file: e.target.value }))}
                  style={{ padding: '6px 10px', border: '1px solid var(--border)', borderRadius: 6, fontSize: 12, outline: 'none', gridColumn: '1 / -1' }} />
              </div>
              <div style={{ display: 'flex', gap: 6 }}>
                <button type="button" onClick={() => void addServer()}
                  style={{
                    border: 'none', background: 'var(--accent)', color: '#fff', borderRadius: 6,
                    padding: '6px 14px', fontSize: 12, cursor: 'pointer', fontWeight: 500,
                  }}>Save</button>
                <button type="button" onClick={() => setShowAddServer(false)}
                  style={{
                    border: '1px solid var(--border)', background: 'var(--bg-card)', borderRadius: 6,
                    padding: '6px 14px', fontSize: 12, cursor: 'pointer', color: 'var(--text-secondary)',
                  }}>Cancel</button>
              </div>
            </div>
          ) : (
            <button type="button" onClick={() => setShowAddServer(true)}
              style={{
                display: 'flex', alignItems: 'center', gap: 4, border: '1px dashed var(--border)',
                background: 'var(--bg-card)', borderRadius: 6, padding: '6px 12px', fontSize: 12,
                cursor: 'pointer', color: 'var(--text-secondary)', marginTop: 4,
              }}>
              <Plus size={12} /> Add Server
            </button>
          )}
        </SettingsField>

        {/* Default Execution Mode */}
        <SettingsField label={t('compute.defaultExecution')} hint={t('compute.executionHint')}>
          <div style={{ display: 'flex', gap: 6 }}>
            {[
              { value: 'local', label: 'Local', icon: MonitorCheck },
              { value: 'docker', label: 'Docker', icon: HardDrive },
              { value: 'remote', label: 'Remote SSH', icon: Server },
            ].map(m => (
              <button key={m.value} type="button" onClick={() => void saveExecutionMode(m.value)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 5, padding: '6px 14px',
                  border: `1px solid ${executionMode === m.value ? 'var(--accent)' : 'var(--border)'}`,
                  background: executionMode === m.value ? 'var(--accent)' : '#fff',
                  color: executionMode === m.value ? '#fff' : 'var(--text-secondary)',
                  borderRadius: 6, fontSize: 12, cursor: 'pointer', fontWeight: 500,
                  transition: 'all var(--transition)',
                }}>
                <m.icon size={13} /> {m.label}
              </button>
            ))}
          </div>
        </SettingsField>
      </SettingsSection>}

      <div style={{ padding: '16px 20px', borderRadius: 'var(--radius)', background: 'var(--bg-sidebar)', border: '1px solid var(--border-light)', fontSize: 12, color: 'var(--text-tertiary)', lineHeight: 1.6 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
          <Settings2 size={13} /> <span style={{ fontWeight: 600 }}>{t('settings.configInfo')}</span>
        </div>
        {t('settings.configDetail')}
      </div>
    </div>
  )
}

function SettingsSection({ icon: Icon, title, color, children }: { icon: typeof Settings2; title: string; color: string; children: React.ReactNode }): React.ReactElement {
  return (
    <div style={{ background: 'var(--bg-card)', borderRadius: 'var(--radius)', border: '1px solid var(--border)', padding: '20px 24px', marginBottom: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 18 }}>
        <div style={{ width: 32, height: 32, borderRadius: 8, background: color + '10', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <Icon size={16} color={color} strokeWidth={2} />
        </div>
        <span style={{ fontSize: 15, fontWeight: 600, color: 'var(--text)' }}>{title}</span>
      </div>
      {children}
    </div>
  )
}

function SettingsField({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }): React.ReactElement {
  return (
    <div style={{ marginBottom: 16 }}>
      <div style={{ marginBottom: 6 }}>
        <label style={{ fontSize: 13, fontWeight: 500, color: 'var(--text)' }}>{label}</label>
        {hint && <span style={{ fontSize: 11, color: 'var(--text-tertiary)', marginLeft: 8 }}>{hint}</span>}
      </div>
      {children}
    </div>
  )
}

function SettingsInput({ value, onChange, onSave, saving, dirty, placeholder, type = 'text' }: { value: string; onChange: (v: string) => void; onSave: () => void; saving: boolean; dirty: boolean; placeholder?: string; type?: string }): React.ReactElement {
  return (
    <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
      <input type={type} value={value} onChange={(e) => onChange(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') onSave() }} placeholder={placeholder}
        style={{ flex: 1, padding: '8px 10px', border: `1px solid ${dirty ? 'var(--accent)' : 'var(--border)'}`, borderRadius: 6, fontSize: 13, outline: 'none', background: 'var(--bg-input)', color: 'var(--text)', transition: 'border-color var(--transition)' }} />
      <SaveButton dirty={dirty} saving={saving} onClick={onSave} />
    </div>
  )
}

function SaveButton({ dirty, saving, onClick }: { dirty: boolean; saving: boolean; onClick: () => void }): React.ReactElement {
  if (!dirty && !saving) return <div style={{ width: 32 }} />
  return (
    <button type="button" onClick={onClick} disabled={saving || !dirty}
      style={{ width: 32, height: 32, border: 'none', borderRadius: 6, background: dirty ? 'var(--accent)' : 'var(--bg-hover)', color: dirty ? '#fff' : 'var(--text-tertiary)', cursor: saving ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, opacity: saving ? 0.6 : 1, transition: 'all var(--transition)' }}
      title="Save">
      {saving ? (
        <div style={{ width: 14, height: 14, border: '2px solid currentColor', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 0.6s linear infinite' }} />
      ) : dirty ? <Save size={14} /> : <CheckCircle2 size={14} />}
    </button>
  )
}
