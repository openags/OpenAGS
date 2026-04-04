/**
 * OpenAGS Configuration — YAML config loading
 */

import * as fs from 'fs'
import * as path from 'path'
import * as os from 'os'
import yaml from 'js-yaml'
import { SystemConfig } from './schemas.js'
import { ConfigError } from './errors.js'

const DEFAULT_CONFIG_PATH = path.join(os.homedir(), '.openags', 'config.yaml')

/**
 * Load configuration from YAML file + environment variables.
 * Environment variables override YAML values.
 */
export function loadConfig(configPath?: string): SystemConfig {
  const filePath = configPath || process.env.OPENAGS_CONFIG || DEFAULT_CONFIG_PATH

  let fileConfig: Record<string, unknown> = {}

  if (fs.existsSync(filePath)) {
    try {
      const raw = fs.readFileSync(filePath, 'utf-8')
      fileConfig = yaml.load(raw) as Record<string, unknown> || {}
    } catch (err) {
      throw new ConfigError(`Failed to parse config file: ${filePath} - ${err}`)
    }
  }

  // Apply environment variable overrides
  const envOverrides: Record<string, unknown> = {}

  if (process.env.OPENAGS_WORKSPACE_DIR) {
    envOverrides.workspace_dir = process.env.OPENAGS_WORKSPACE_DIR
  }
  if (process.env.OPENAGS_LOG_LEVEL) {
    envOverrides.log_level = process.env.OPENAGS_LOG_LEVEL
  }
  if (process.env.OPENAGS_DEFAULT_BACKEND) {
    envOverrides.default_backend = { type: process.env.OPENAGS_DEFAULT_BACKEND }
  }

  const merged = { ...fileConfig, ...envOverrides }

  // Validate with Zod
  const result = SystemConfig.safeParse(merged)
  if (!result.success) {
    throw new ConfigError(`Invalid configuration: ${result.error.message}`)
  }

  return result.data
}

/**
 * Save configuration to YAML file.
 */
export function saveConfig(config: SystemConfig, configPath?: string): void {
  const filePath = configPath || DEFAULT_CONFIG_PATH
  const dir = path.dirname(filePath)

  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true, mode: 0o700 })
  }

  const yamlStr = yaml.dump(config, { indent: 2, lineWidth: 100 })
  fs.writeFileSync(filePath, yamlStr, { encoding: 'utf-8', mode: 0o600 })
}

/**
 * Get the workspace directory (resolved to absolute path).
 */
export function getWorkspaceDir(config: SystemConfig): string {
  let dir = config.workspace_dir
  if (dir.startsWith('~')) {
    dir = path.join(os.homedir(), dir.slice(1))
  }
  return path.resolve(dir)
}

/**
 * Ensure workspace directory exists with proper structure.
 */
export function ensureWorkspace(config: SystemConfig): string {
  const dir = getWorkspaceDir(config)

  const subdirs = ['projects', 'logs', 'sessions', 'plugins', 'skills']
  for (const sub of subdirs) {
    const subPath = path.join(dir, sub)
    if (!fs.existsSync(subPath)) {
      fs.mkdirSync(subPath, { recursive: true })
    }
  }

  return dir
}
