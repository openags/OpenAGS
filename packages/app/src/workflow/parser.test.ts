import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import * as fs from 'fs'
import * as path from 'path'
import * as os from 'os'
import {
  parseStatusMd, parseDirectiveMd, isTerminalStatus,
  atomicWriteFile, writeFailedStatusMd,
} from './parser.js'

describe('isTerminalStatus', () => {
  it('identifies terminal statuses', () => {
    expect(isTerminalStatus('completed')).toBe(true)
    expect(isTerminalStatus('failed')).toBe(true)
    expect(isTerminalStatus('aborted')).toBe(true)
  })

  it('rejects non-terminal statuses', () => {
    expect(isTerminalStatus('idle')).toBe(false)
    expect(isTerminalStatus('running')).toBe(false)
    expect(isTerminalStatus('pending')).toBe(false)
    expect(isTerminalStatus('blocked')).toBe(false)
  })
})

describe('parseStatusMd', () => {
  let tmpDir: string

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'openags-parser-'))
  })

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true })
  })

  it('returns null when STATUS.md does not exist', () => {
    expect(parseStatusMd(tmpDir)).toBeNull()
  })

  it('parses well-formed STATUS.md with frontmatter (Layer 1)', () => {
    fs.writeFileSync(path.join(tmpDir, 'STATUS.md'), `---
directive_id: "d-001"
agent: "literature"
status: "completed"
exit_reason: "task_complete"
duration_seconds: 120
---

## Summary

Found 15 relevant papers.
`)

    const result = parseStatusMd(tmpDir)
    expect(result).not.toBeNull()
    expect(result!.directive_id).toBe('d-001')
    expect(result!.agent).toBe('literature')
    expect(result!.status).toBe('completed')
    expect(result!.exit_reason).toBe('task_complete')
    expect(result!.duration_seconds).toBe(120)
    expect(result!.summary).toBe('Found 15 relevant papers.')
  })

  it('parses STATUS.md with regex fallback (Layer 2)', () => {
    // Malformed YAML but has key: value lines
    fs.writeFileSync(path.join(tmpDir, 'STATUS.md'),
      'status: completed\ndirective_id: d-002\nagent: reviewer\n\n## Summary\n\nReview done.\n')

    const result = parseStatusMd(tmpDir)
    expect(result).not.toBeNull()
    expect(result!.status).toBe('completed')
    expect(result!.directive_id).toBe('d-002')
  })

  it('uses heuristic for "completed" keyword (Layer 3)', () => {
    fs.writeFileSync(path.join(tmpDir, 'STATUS.md'),
      'The task has been completed successfully.\n\n## Summary\n\nAll done.\n')

    const result = parseStatusMd(tmpDir)
    expect(result).not.toBeNull()
    expect(result!.status).toBe('completed')
    expect(result!.exit_reason).toBe('task_complete')
  })

  it('uses heuristic for "failed" keyword (Layer 3)', () => {
    fs.writeFileSync(path.join(tmpDir, 'STATUS.md'),
      'An error occurred during execution.\n')

    const result = parseStatusMd(tmpDir)
    expect(result).not.toBeNull()
    expect(result!.status).toBe('failed')
    expect(result!.exit_reason).toBe('error')
  })

  it('returns parse_error for unparseable content (Layer 4)', () => {
    fs.writeFileSync(path.join(tmpDir, 'STATUS.md'), 'just some random text\n')

    const result = parseStatusMd(tmpDir)
    expect(result).not.toBeNull()
    expect(result!.status).toBe('failed')
    expect(result!.exit_reason).toBe('parse_error')
  })

  it('handles artifacts array in frontmatter', () => {
    fs.writeFileSync(path.join(tmpDir, 'STATUS.md'), `---
directive_id: "d-003"
agent: "experimenter"
status: "completed"
artifacts:
- "results/output.csv"
- "results/plot.png"
---

## Summary

Experiment complete.
`)

    const result = parseStatusMd(tmpDir)
    expect(result).not.toBeNull()
    expect(result!.artifacts).toEqual(['results/output.csv', 'results/plot.png'])
  })
})

describe('parseDirectiveMd', () => {
  let tmpDir: string

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'openags-parser-'))
  })

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true })
  })

  it('returns null when DIRECTIVE.md does not exist', () => {
    expect(parseDirectiveMd(tmpDir)).toBeNull()
  })

  it('parses well-formed DIRECTIVE.md', () => {
    fs.writeFileSync(path.join(tmpDir, 'DIRECTIVE.md'), `---
directive_id: "d-100"
phase: "literature"
action: "execute"
decision: "PROCEED"
timeout_seconds: 600
max_attempts: 3
---

## Task

Search arXiv for papers on LLMs.

## Acceptance Criteria

At least 10 relevant papers found.
`)

    const result = parseDirectiveMd(tmpDir)
    expect(result).not.toBeNull()
    expect(result!.directive_id).toBe('d-100')
    expect(result!.phase).toBe('literature')
    expect(result!.action).toBe('execute')
    expect(result!.decision).toBe('PROCEED')
    expect(result!.timeout_seconds).toBe(600)
    expect(result!.max_attempts).toBe(3)
    expect(result!.task).toContain('Search arXiv')
    expect(result!.acceptance_criteria).toContain('10 relevant papers')
  })

  it('uses regex fallback for minimal DIRECTIVE.md', () => {
    fs.writeFileSync(path.join(tmpDir, 'DIRECTIVE.md'),
      'directive_id: d-200\nphase: experiments\n\n## Task\n\nRun the experiment.\n')

    const result = parseDirectiveMd(tmpDir)
    expect(result).not.toBeNull()
    expect(result!.directive_id).toBe('d-200')
    expect(result!.phase).toBe('experiments')
    expect(result!.task).toContain('Run the experiment')
  })

  it('returns null for content without directive_id', () => {
    fs.writeFileSync(path.join(tmpDir, 'DIRECTIVE.md'), 'no frontmatter here\n')
    expect(parseDirectiveMd(tmpDir)).toBeNull()
  })

  it('defaults action to execute for unknown values', () => {
    fs.writeFileSync(path.join(tmpDir, 'DIRECTIVE.md'), `---
directive_id: "d-300"
action: "unknown_action"
---

## Task

Something.
`)
    const result = parseDirectiveMd(tmpDir)
    expect(result).not.toBeNull()
    expect(result!.action).toBe('execute')
  })
})

describe('atomicWriteFile', () => {
  let tmpDir: string

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'openags-parser-'))
  })

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true })
  })

  it('writes content atomically', () => {
    const filePath = path.join(tmpDir, 'test.md')
    atomicWriteFile(filePath, 'hello world')
    expect(fs.readFileSync(filePath, 'utf-8')).toBe('hello world')
    // No .tmp file should remain
    expect(fs.existsSync(filePath + '.tmp')).toBe(false)
  })
})

describe('writeFailedStatusMd', () => {
  let tmpDir: string

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'openags-parser-'))
  })

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true })
  })

  it('writes a parseable failed STATUS.md', () => {
    writeFailedStatusMd(tmpDir, 'd-fail-001', 'literature', 'timeout', 'Timed out after 1800s')

    const result = parseStatusMd(tmpDir)
    expect(result).not.toBeNull()
    expect(result!.status).toBe('failed')
    expect(result!.directive_id).toBe('d-fail-001')
    expect(result!.agent).toBe('literature')
    expect(result!.exit_reason).toBe('timeout')
  })
})
