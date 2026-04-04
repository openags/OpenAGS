/**
 * CLI Config Manager — read/write configuration files for each CLI agent.
 *
 * Each CLI tool stores its config in a different file and format:
 *   Claude Code → ~/.claude.json (JSON, settings.env.*)
 *   Codex       → ~/.codex/config.toml (TOML, top-level fields)
 *   Gemini CLI  → ~/.gemini/settings.json (JSON)
 *
 * Inspired by cc-switch's providerConfigUtils.ts
 */

import * as fs from 'fs'
import * as path from 'path'
import * as os from 'os'

// ── Provider presets ────────────────────────────────

export interface ProviderPreset {
  id: string
  name: string
  icon: string
  color: string
  category: 'official' | 'cn' | 'relay' | 'custom'
  // What gets written to the config file
  config: Record<string, string>
}

/** Claude Code presets — written to ~/.claude.json settings.env */
export const CLAUDE_PRESETS: ProviderPreset[] = [
  {
    id: 'anthropic', name: 'Anthropic (Official)', icon: 'anthropic', color: '#D97757',
    category: 'official',
    config: {},  // Official uses OAuth, no env override needed
  },
  {
    id: 'deepseek', name: 'DeepSeek', icon: 'deepseek', color: '#1E88E5',
    category: 'cn',
    config: {
      ANTHROPIC_BASE_URL: 'https://api.deepseek.com/anthropic',
      ANTHROPIC_MODEL: 'DeepSeek-V3.2',
    },
  },
  {
    id: 'openrouter', name: 'OpenRouter', icon: 'openrouter', color: '#6366f1',
    category: 'relay',
    config: {
      ANTHROPIC_BASE_URL: 'https://openrouter.ai/api/v1',
      ANTHROPIC_MODEL: 'anthropic/claude-sonnet-4',
    },
  },
  {
    id: 'kimi', name: 'Kimi (Moonshot)', icon: 'kimi', color: '#6366F1',
    category: 'cn',
    config: {
      ANTHROPIC_BASE_URL: 'https://api.moonshot.cn/anthropic',
      ANTHROPIC_MODEL: 'kimi-k2.5',
    },
  },
  {
    id: 'custom', name: 'Custom Provider', icon: 'custom', color: '#64748b',
    category: 'custom',
    config: {},
  },
]

/** Codex presets — written to ~/.codex/config.toml */
export const CODEX_PRESETS: ProviderPreset[] = [
  {
    id: 'openai', name: 'OpenAI (Official)', icon: 'openai', color: '#10a37f',
    category: 'official',
    config: {},
  },
  {
    id: 'custom', name: 'Custom Provider', icon: 'custom', color: '#64748b',
    category: 'custom',
    config: {},
  },
]

/** Gemini CLI presets */
export const GEMINI_PRESETS: ProviderPreset[] = [
  {
    id: 'google', name: 'Google (Official)', icon: 'google', color: '#4285f4',
    category: 'official',
    config: {},
  },
]

// ── Config file paths ───────────────────────────────

function claudeConfigPath(): string {
  return path.join(os.homedir(), '.claude.json')
}

function codexConfigPath(): string {
  return path.join(os.homedir(), '.codex', 'config.toml')
}

function geminiConfigPath(): string {
  return path.join(os.homedir(), '.gemini', 'settings.json')
}

// ── Claude Code config ──────────────────────────────

export function readClaudeConfig(): Record<string, string> {
  try {
    const raw = fs.readFileSync(claudeConfigPath(), 'utf-8')
    const data = JSON.parse(raw)
    return data?.settings?.env || {}
  } catch { return {} }
}

export function writeClaudeConfig(env: Record<string, string>): void {
  const configPath = claudeConfigPath()
  let data: Record<string, any> = {}
  try { data = JSON.parse(fs.readFileSync(configPath, 'utf-8')) } catch { /* new file */ }

  if (!data.settings) data.settings = {}
  if (!data.settings.env) data.settings.env = {}

  // Merge env vars (don't delete other settings)
  for (const [key, value] of Object.entries(env)) {
    if (value) {
      data.settings.env[key] = value
    } else {
      delete data.settings.env[key]
    }
  }

  fs.writeFileSync(configPath, JSON.stringify(data, null, 2), 'utf-8')
}

export function applyClaudePreset(presetId: string, apiKey: string, model?: string, baseUrl?: string): void {
  const preset = CLAUDE_PRESETS.find(p => p.id === presetId)
  const env: Record<string, string> = {}

  if (preset && preset.id !== 'anthropic') {
    // Non-official: set base URL + model from preset
    Object.assign(env, preset.config)
  }

  // Override with user values
  if (apiKey) env.ANTHROPIC_AUTH_TOKEN = apiKey
  if (model) {
    env.ANTHROPIC_MODEL = model
    env.ANTHROPIC_DEFAULT_SONNET_MODEL = model
  }
  if (baseUrl) env.ANTHROPIC_BASE_URL = baseUrl

  // If switching to official (anthropic), clear custom env vars
  if (presetId === 'anthropic') {
    writeClaudeConfig({
      ANTHROPIC_BASE_URL: '',
      ANTHROPIC_MODEL: '',
      ANTHROPIC_DEFAULT_SONNET_MODEL: '',
      ANTHROPIC_DEFAULT_HAIKU_MODEL: '',
      ANTHROPIC_DEFAULT_OPUS_MODEL: '',
      ANTHROPIC_AUTH_TOKEN: apiKey || '',
    })
    return
  }

  writeClaudeConfig(env)
}

// ── Codex config ────────────────────────────────────

export function readCodexConfig(): { model?: string; base_url?: string } {
  try {
    const raw = fs.readFileSync(codexConfigPath(), 'utf-8')
    const result: Record<string, string> = {}
    for (const line of raw.split('\n')) {
      const match = line.match(/^\s*(model|base_url)\s*=\s*"([^"]+)"/)
      if (match) result[match[1]] = match[2]
    }
    return result
  } catch { return {} }
}

export function writeCodexConfig(updates: { model?: string; base_url?: string }): void {
  const configPath = codexConfigPath()
  fs.mkdirSync(path.dirname(configPath), { recursive: true })

  let lines: string[] = []
  try { lines = fs.readFileSync(configPath, 'utf-8').split('\n') } catch { /* new file */ }

  for (const [field, value] of Object.entries(updates)) {
    if (!value) continue
    const pattern = new RegExp(`^\\s*${field}\\s*=`)
    const idx = lines.findIndex(l => pattern.test(l))
    const newLine = `${field} = "${value}"`
    if (idx >= 0) {
      lines[idx] = newLine
    } else {
      // Insert at top (before any [section])
      const sectionIdx = lines.findIndex(l => /^\s*\[/.test(l))
      if (sectionIdx >= 0) lines.splice(sectionIdx, 0, newLine)
      else lines.push(newLine)
    }
  }

  fs.writeFileSync(configPath, lines.join('\n'), 'utf-8')
}

// ── Gemini config ───────────────────────────────────

export function readGeminiConfig(): { apiKey?: string } {
  try {
    const raw = fs.readFileSync(geminiConfigPath(), 'utf-8')
    const data = JSON.parse(raw)
    return { apiKey: data?.GEMINI_API_KEY || '' }
  } catch { return {} }
}

export function writeGeminiConfig(apiKey: string): void {
  const configPath = geminiConfigPath()
  fs.mkdirSync(path.dirname(configPath), { recursive: true })

  let data: Record<string, any> = {}
  try { data = JSON.parse(fs.readFileSync(configPath, 'utf-8')) } catch { /* new */ }

  if (apiKey) data.GEMINI_API_KEY = apiKey
  else delete data.GEMINI_API_KEY

  fs.writeFileSync(configPath, JSON.stringify(data, null, 2), 'utf-8')
}

// ── Unified read/write ──────────────────────────────

export interface CLIProviderConfig {
  provider: string  // preset id
  apiKey: string
  model: string
  baseUrl: string
}

export function readCLIConfig(backend: string): CLIProviderConfig {
  if (backend === 'claude_code') {
    const env = readClaudeConfig()
    return {
      provider: env.ANTHROPIC_BASE_URL ? 'custom' : 'anthropic',
      apiKey: env.ANTHROPIC_AUTH_TOKEN || env.ANTHROPIC_API_KEY || '',
      model: env.ANTHROPIC_MODEL || '',
      baseUrl: env.ANTHROPIC_BASE_URL || '',
    }
  }
  if (backend === 'codex') {
    const cfg = readCodexConfig()
    return {
      provider: cfg.base_url ? 'custom' : 'openai',
      apiKey: '',
      model: cfg.model || '',
      baseUrl: cfg.base_url || '',
    }
  }
  if (backend === 'gemini_cli') {
    const cfg = readGeminiConfig()
    return {
      provider: 'google',
      apiKey: cfg.apiKey || '',
      model: '',
      baseUrl: '',
    }
  }
  if (backend === 'copilot') {
    return {
      provider: 'github',
      apiKey: process.env.GITHUB_TOKEN || process.env.GH_TOKEN || '',
      model: '',
      baseUrl: '',
    }
  }
  return { provider: '', apiKey: '', model: '', baseUrl: '' }
}

export function writeCLIConfig(backend: string, config: CLIProviderConfig): void {
  if (backend === 'claude_code') {
    applyClaudePreset(config.provider, config.apiKey, config.model, config.baseUrl)
  } else if (backend === 'codex') {
    writeCodexConfig({ model: config.model, base_url: config.baseUrl })
  } else if (backend === 'gemini_cli') {
    writeGeminiConfig(config.apiKey)
  } else if (backend === 'copilot') {
    // Copilot uses GITHUB_TOKEN env var — write to .env or similar
    // For now, just set the env variable for the current process
    if (config.apiKey) process.env.GITHUB_TOKEN = config.apiKey
  }
  // cursor: no config file needed — uses Cursor IDE auth
}
