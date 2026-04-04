/**
 * Config Routes — system configuration endpoints
 */

import { Router, Request, Response } from 'express'
import * as fs from 'fs'
import * as path from 'path'
import * as os from 'os'
import * as yaml from 'js-yaml'
import { loadConfig } from '../config.js'

export function createConfigRoutes(configPath?: string): Router {
  const router = Router()
  const defaultConfigPath = configPath || path.join(os.homedir(), '.openags', 'config.yaml')

  // Get current configuration
  router.get('/config', (_req: Request, res: Response) => {
    try {
      const config = loadConfig(defaultConfigPath) as Record<string, unknown>
      // Redact sensitive fields
      const safe = {
        ...config,
        anthropic_api_key: config.anthropic_api_key ? '***' : undefined,
        openai_api_key: config.openai_api_key ? '***' : undefined,
        deepseek_api_key: config.deepseek_api_key ? '***' : undefined,
        openrouter_api_key: config.openrouter_api_key ? '***' : undefined,
        gemini_api_key: config.gemini_api_key ? '***' : undefined,
        telegram: config.telegram ? { ...config.telegram as object, bot_token: '***' } : undefined,
        discord: config.discord ? { ...config.discord as object, bot_token: '***' } : undefined,
      }
      res.json(safe)
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : 'Unknown error' })
    }
  })

  // Update configuration
  router.patch('/config', (req: Request, res: Response) => {
    try {
      // Load existing config
      let existing: Record<string, unknown> = {}
      if (fs.existsSync(defaultConfigPath)) {
        const content = fs.readFileSync(defaultConfigPath, 'utf-8')
        existing = yaml.load(content) as Record<string, unknown>
      }

      // Merge with request body
      const updated = { ...existing, ...req.body }

      // Ensure directory exists
      const dir = path.dirname(defaultConfigPath)
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true, mode: 0o755 })
      }

      // Write config with restricted permissions
      const content = yaml.dump(updated)
      fs.writeFileSync(defaultConfigPath, content, { mode: 0o600 })

      res.json({ success: true })
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : 'Unknown error' })
    }
  })

  // Update single config value by dotted key path (used by frontend Settings)
  router.put('/config', (req: Request, res: Response) => {
    try {
      const { key, value } = req.body as { key?: string; value?: string }
      if (!key) { res.status(400).json({ error: 'key is required' }); return }

      let existing: Record<string, unknown> = {}
      if (fs.existsSync(defaultConfigPath)) {
        const content = fs.readFileSync(defaultConfigPath, 'utf-8')
        existing = (yaml.load(content) as Record<string, unknown>) || {}
      }

      // Set nested key (e.g. "default_backend.type" → existing.default_backend.type)
      const keys = key.split('.')
      let target: Record<string, unknown> = existing
      for (let i = 0; i < keys.length - 1; i++) {
        if (!target[keys[i]] || typeof target[keys[i]] !== 'object') {
          target[keys[i]] = {}
        }
        target = target[keys[i]] as Record<string, unknown>
      }

      // Auto-convert types
      let parsed: unknown = value
      if (value === 'true') parsed = true
      else if (value === 'false') parsed = false
      else if (value !== undefined && /^\d+$/.test(String(value))) parsed = parseInt(String(value), 10)
      target[keys[keys.length - 1]] = parsed

      const dir = path.dirname(defaultConfigPath)
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
      fs.writeFileSync(defaultConfigPath, yaml.dump(existing), { mode: 0o600 })

      res.json({ success: true, key, value: parsed })
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : 'Unknown error' })
    }
  })

  // Trailing slash variant
  router.put('/config/', (req: Request, res: Response) => {
    const { key, value } = req.body as { key?: string; value?: string }
    if (!key) { res.status(400).json({ error: 'key is required' }); return }

    let existing: Record<string, unknown> = {}
    if (fs.existsSync(defaultConfigPath)) {
      existing = (yaml.load(fs.readFileSync(defaultConfigPath, 'utf-8')) as Record<string, unknown>) || {}
    }

    const keys = key.split('.')
    let target: Record<string, unknown> = existing
    for (let i = 0; i < keys.length - 1; i++) {
      if (!target[keys[i]] || typeof target[keys[i]] !== 'object') target[keys[i]] = {}
      target = target[keys[i]] as Record<string, unknown>
    }
    let parsed: unknown = value
    if (value === 'true') parsed = true
    else if (value === 'false') parsed = false
    else if (value !== undefined && /^\d+$/.test(String(value))) parsed = parseInt(String(value), 10)
    target[keys[keys.length - 1]] = parsed

    const dir = path.dirname(defaultConfigPath)
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
    fs.writeFileSync(defaultConfigPath, yaml.dump(existing), { mode: 0o600 })
    res.json({ success: true, key, value: parsed })
  })

  // PUT /config/compute (experiment settings)
  router.put('/config/compute', (req: Request, res: Response) => {
    try {
      let existing: Record<string, unknown> = {}
      if (fs.existsSync(defaultConfigPath)) {
        existing = (yaml.load(fs.readFileSync(defaultConfigPath, 'utf-8')) as Record<string, unknown>) || {}
      }
      if (req.body.experiment_sandbox) existing.experiment_sandbox = req.body.experiment_sandbox
      if (req.body.experiment_timeout) existing.experiment_timeout = req.body.experiment_timeout
      fs.writeFileSync(defaultConfigPath, yaml.dump(existing), { mode: 0o600 })
      res.json({ success: true })
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : 'Unknown error' })
    }
  })

  // GET /config/backends/test — check which CLI tools are available
  router.get('/config/backends/test', async (_req: Request, res: Response) => {
    const { execFile } = await import('child_process')
    const { promisify } = await import('util')
    const execAsync = promisify(execFile)

    const results: Record<string, boolean> = {}
    const checks: [string, string, string[]][] = [
      ['claude_code', 'claude', ['--version']],
      ['codex', 'codex', ['--version']],
      ['gemini_cli', 'gemini', ['--version']],
    ]

    for (const [key, cmd, args] of checks) {
      try {
        await execAsync(cmd, args, { timeout: 5000 })
        results[key] = true
      } catch {
        results[key] = false
      }
    }

    // Copilot — check if SDK is importable via system Node
    try {
      await execAsync('node', ['-e', "require('@github/copilot-sdk')"], { timeout: 5000 })
      results['copilot'] = true
    } catch {
      results['copilot'] = false
    }

    res.json({ results })
  })

  // Check if API keys are configured
  router.get('/config/status', (_req: Request, res: Response) => {
    try {
      const config = loadConfig(defaultConfigPath) as Record<string, unknown>
      res.json({
        has_anthropic_key: !!config.anthropic_api_key,
        has_openai_key: !!config.openai_api_key,
        has_gemini_key: !!config.gemini_api_key,
        has_deepseek_key: !!config.deepseek_api_key,
        has_openrouter_key: !!config.openrouter_api_key,
        workspace_dir: config.workspace_dir,
        default_backend: config.default_backend,
        default_model: (config.default_backend as Record<string, unknown> | undefined)?.model,
        log_level: config.log_level,
      })
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : 'Unknown error' })
    }
  })

  // Get available providers
  router.get('/config/providers', (_req: Request, res: Response) => {
    res.json({
      providers: [
        { id: 'claude-sdk', name: 'Claude Code SDK', requires: ['anthropic_api_key'] },
        { id: 'codex-sdk', name: 'OpenAI Codex SDK', requires: ['openai_api_key'] },
        { id: 'gemini-cli', name: 'Gemini CLI', requires: ['gemini_api_key'] },
        { id: 'copilot', name: 'GitHub Copilot', requires: [] },
      ],
    })
  })

  return router
}
