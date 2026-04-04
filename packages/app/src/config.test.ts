import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import * as fs from 'fs'
import * as path from 'path'
import * as os from 'os'
import { loadConfig, saveConfig, getWorkspaceDir, ensureWorkspace } from './config.js'
import { ConfigError } from './errors.js'

describe('loadConfig', () => {
  let tmpDir: string

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'openags-test-'))
  })

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true })
  })

  it('returns defaults when no config file exists', () => {
    const config = loadConfig(path.join(tmpDir, 'nonexistent.yaml'))
    expect(config.workspace_dir).toBe('~/.openags')
    expect(config.default_backend.type).toBe('claude_code')
    expect(config.log_level).toBe('INFO')
  })

  it('loads from a YAML config file', () => {
    const configPath = path.join(tmpDir, 'config.yaml')
    fs.writeFileSync(configPath, 'log_level: DEBUG\nworkspace_dir: /tmp/ws\n')

    const config = loadConfig(configPath)
    expect(config.log_level).toBe('DEBUG')
    expect(config.workspace_dir).toBe('/tmp/ws')
  })

  it('throws ConfigError on invalid config values', () => {
    const configPath = path.join(tmpDir, 'bad.yaml')
    fs.writeFileSync(configPath, 'log_level: INVALID_LEVEL\n')

    expect(() => loadConfig(configPath)).toThrow(ConfigError)
  })

  it('throws ConfigError on invalid config values', () => {
    const configPath = path.join(tmpDir, 'invalid.yaml')
    fs.writeFileSync(configPath, 'log_level: TRACE\n') // not a valid enum

    expect(() => loadConfig(configPath)).toThrow(ConfigError)
  })

  it('applies environment variable overrides', () => {
    const original = process.env.OPENAGS_LOG_LEVEL
    process.env.OPENAGS_LOG_LEVEL = 'ERROR'
    try {
      const config = loadConfig(path.join(tmpDir, 'nofile.yaml'))
      expect(config.log_level).toBe('ERROR')
    } finally {
      if (original === undefined) delete process.env.OPENAGS_LOG_LEVEL
      else process.env.OPENAGS_LOG_LEVEL = original
    }
  })
})

describe('saveConfig', () => {
  let tmpDir: string

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'openags-test-'))
  })

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true })
  })

  it('writes a config file that can be loaded back', () => {
    const configPath = path.join(tmpDir, 'config.yaml')
    const config = loadConfig(path.join(tmpDir, 'nofile.yaml')) // defaults

    saveConfig(config, configPath)

    expect(fs.existsSync(configPath)).toBe(true)
    const loaded = loadConfig(configPath)
    expect(loaded.log_level).toBe(config.log_level)
    expect(loaded.default_backend.type).toBe(config.default_backend.type)
  })

  it('creates parent directories if needed', () => {
    const configPath = path.join(tmpDir, 'nested', 'dir', 'config.yaml')
    const config = loadConfig(path.join(tmpDir, 'nofile.yaml'))

    saveConfig(config, configPath)
    expect(fs.existsSync(configPath)).toBe(true)
  })
})

describe('getWorkspaceDir', () => {
  it('expands ~ to home directory', () => {
    const config = loadConfig('/nonexistent/path.yaml')
    const dir = getWorkspaceDir(config)
    expect(dir).toBe(path.resolve(os.homedir(), '.openags'))
  })

  it('handles absolute paths', () => {
    const config = { ...loadConfig('/nonexistent/path.yaml'), workspace_dir: '/tmp/custom' }
    const dir = getWorkspaceDir(config)
    expect(dir).toBe('/tmp/custom')
  })
})

describe('ensureWorkspace', () => {
  let tmpDir: string

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'openags-test-'))
  })

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true })
  })

  it('creates workspace subdirectories', () => {
    const config = { ...loadConfig('/nonexistent/path.yaml'), workspace_dir: tmpDir }
    const dir = ensureWorkspace(config)

    expect(dir).toBe(tmpDir)
    expect(fs.existsSync(path.join(tmpDir, 'projects'))).toBe(true)
    expect(fs.existsSync(path.join(tmpDir, 'logs'))).toBe(true)
    expect(fs.existsSync(path.join(tmpDir, 'sessions'))).toBe(true)
    expect(fs.existsSync(path.join(tmpDir, 'plugins'))).toBe(true)
    expect(fs.existsSync(path.join(tmpDir, 'skills'))).toBe(true)
  })
})
