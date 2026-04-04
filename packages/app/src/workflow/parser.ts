/**
 * DIRECTIVE.md / STATUS.md parser — four-layer fallback for resilience.
 */

import * as fs from 'fs'
import * as path from 'path'
import type { DirectiveModel, StatusModel, AgentStatusValue, ExitReason } from './types.js'

// We use a simple YAML frontmatter parser (no external dependency needed)
function extractFrontmatter(raw: string): { fm: Record<string, unknown>; body: string } | null {
  const match = raw.match(/^---\n([\s\S]*?)\n---/)
  if (!match) return null

  const fmText = match[1]
  const body = raw.slice(match[0].length)

  // Simple YAML parser for flat key-value (covers our protocol files)
  const fm: Record<string, unknown> = {}
  let currentKey = ''
  let inList = false
  const listItems: string[] = []

  for (const line of fmText.split('\n')) {
    const trimmed = line.trim()

    // List item
    if (inList && trimmed.startsWith('- ')) {
      listItems.push(trimmed.slice(2).replace(/^["']|["']$/g, ''))
      continue
    }

    // End of previous list
    if (inList && !trimmed.startsWith('- ')) {
      fm[currentKey] = [...listItems]
      listItems.length = 0
      inList = false
    }

    // Key: value
    const kvMatch = trimmed.match(/^(\w[\w_]*)\s*:\s*(.*)$/)
    if (kvMatch) {
      const key = kvMatch[1]
      const val = kvMatch[2].trim()

      if (val === '' || val === '[]') {
        // Could be start of a list or empty
        currentKey = key
        if (val === '[]') {
          fm[key] = []
        } else {
          inList = true
          listItems.length = 0
        }
      } else {
        // Scalar value
        let parsed: unknown = val.replace(/^["']|["']$/g, '')
        if (parsed === 'true') parsed = true
        else if (parsed === 'false') parsed = false
        else if (parsed === 'null') parsed = null
        else if (/^\d+$/.test(val)) parsed = parseInt(val, 10)
        else if (/^\d+\.\d+$/.test(val)) parsed = parseFloat(val)
        fm[key] = parsed
      }
    }
  }

  // Flush remaining list
  if (inList && listItems.length > 0) {
    fm[currentKey] = [...listItems]
  }

  return { fm, body }
}

function regexField(text: string, field: string): string | null {
  const m = text.match(new RegExp(`^${field}:\\s*["']?(.+?)["']?\\s*$`, 'm'))
  return m ? m[1].trim() : null
}

function extractSection(text: string, heading: string): string {
  const escaped = heading.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const m = text.match(new RegExp(`^## ${escaped}\\s*\\n([\\s\\S]*?)(?=^## |$)`, 'm'))
  return m ? m[1].trim() : ''
}

const TERMINAL_STATUSES: AgentStatusValue[] = ['completed', 'failed', 'aborted']

export function isTerminalStatus(status: AgentStatusValue): boolean {
  return TERMINAL_STATUSES.includes(status)
}

// ── STATUS.md Parser (4-layer) ─────────────────────

export function parseStatusMd(agentDir: string): StatusModel | null {
  const filePath = path.join(agentDir, 'STATUS.md')
  if (!fs.existsSync(filePath)) return null

  const raw = fs.readFileSync(filePath, 'utf-8')

  // Layer 1: Full frontmatter parse
  const parsed = extractFrontmatter(raw)
  if (parsed && parsed.fm.status) {
    return buildStatusFromParsed(parsed.fm, parsed.body)
  }

  // Layer 2: Regex extraction
  const statusVal = regexField(raw, 'status')
  const directiveId = regexField(raw, 'directive_id')
  if (statusVal) {
    return {
      directive_id: directiveId || 'unknown',
      agent: regexField(raw, 'agent') || 'unknown',
      status: safeStatus(statusVal),
      started_at: regexField(raw, 'started_at') || '',
      completed_at: regexField(raw, 'completed_at') || '',
      duration_seconds: 0,
      exit_reason: safeExitReason(regexField(raw, 'exit_reason')),
      error_message: regexField(raw, 'error_message'),
      artifacts: [],
      quality_self_assessment: 0,
      summary: extractSection(raw, 'Summary'),
      issues: '',
      recommendations: '',
    }
  }

  // Layer 3: Heuristic
  const lower = raw.toLowerCase()
  if (['completed', 'finished', 'done', 'task_complete'].some(kw => lower.includes(kw))) {
    return {
      directive_id: 'synthesized', agent: 'unknown', status: 'completed',
      started_at: '', completed_at: '', duration_seconds: 0,
      exit_reason: 'task_complete', error_message: null,
      artifacts: [], quality_self_assessment: 0,
      summary: extractSection(raw, 'Summary') || raw.slice(0, 200),
      issues: '', recommendations: '',
    }
  }
  if (['failed', 'error', 'exception'].some(kw => lower.includes(kw))) {
    return {
      directive_id: 'synthesized', agent: 'unknown', status: 'failed',
      started_at: '', completed_at: '', duration_seconds: 0,
      exit_reason: 'error', error_message: raw.slice(0, 200),
      artifacts: [], quality_self_assessment: 0,
      summary: '', issues: '', recommendations: '',
    }
  }

  // Layer 4: Parse error
  return {
    directive_id: 'parse_error', agent: 'unknown', status: 'failed',
    started_at: '', completed_at: '', duration_seconds: 0,
    exit_reason: 'parse_error', error_message: 'Could not parse STATUS.md',
    artifacts: [], quality_self_assessment: 0,
    summary: raw.slice(0, 200), issues: '', recommendations: '',
  }
}

function buildStatusFromParsed(fm: Record<string, unknown>, body: string): StatusModel {
  return {
    directive_id: String(fm.directive_id || 'unknown'),
    agent: String(fm.agent || 'unknown'),
    status: safeStatus(String(fm.status || 'idle')),
    started_at: String(fm.started_at || ''),
    completed_at: String(fm.completed_at || ''),
    duration_seconds: Number(fm.duration_seconds || 0),
    exit_reason: safeExitReason(fm.exit_reason as string | null),
    error_message: fm.error_message ? String(fm.error_message) : null,
    artifacts: Array.isArray(fm.artifacts) ? fm.artifacts.map(String) : [],
    quality_self_assessment: Number(fm.quality_self_assessment || 0),
    summary: extractSection(body, 'Summary'),
    issues: extractSection(body, 'Issues'),
    recommendations: extractSection(body, 'Recommendations'),
  }
}

function safeStatus(val: string): AgentStatusValue {
  const valid: AgentStatusValue[] = ['idle', 'pending', 'running', 'completed', 'failed', 'blocked', 'aborted']
  const lower = val.trim().toLowerCase() as AgentStatusValue
  return valid.includes(lower) ? lower : 'idle'
}

function safeExitReason(val: string | null | undefined): ExitReason | null {
  if (!val) return null
  const valid: ExitReason[] = [
    'task_complete', 'max_steps', 'timeout', 'error',
    'user_abort', 'agent_abort', 'parse_error', 'stale_after_crash',
    'wait_user', 'project_complete',
  ]
  const lower = val.trim().toLowerCase() as ExitReason
  return valid.includes(lower) ? lower : 'error'
}

// ── DIRECTIVE.md Parser ────────────────────────────

export function parseDirectiveMd(agentDir: string): DirectiveModel | null {
  const filePath = path.join(agentDir, 'DIRECTIVE.md')
  if (!fs.existsSync(filePath)) return null

  const raw = fs.readFileSync(filePath, 'utf-8')

  const parsed = extractFrontmatter(raw)
  if (parsed && parsed.fm.directive_id) {
    const fm = parsed.fm
    return {
      directive_id: String(fm.directive_id),
      phase: String(fm.phase || ''),
      action: (['execute', 'revise', 'abort'].includes(String(fm.action)) ? String(fm.action) : 'execute') as 'execute' | 'revise' | 'abort',
      priority: (['critical', 'high', 'normal', 'low'].includes(String(fm.priority)) ? String(fm.priority) : 'normal') as 'critical' | 'high' | 'normal' | 'low',
      created_at: String(fm.created_at || ''),
      timeout_seconds: Number(fm.timeout_seconds || 1800),
      max_attempts: Number(fm.max_attempts || 2),
      attempt: Number(fm.attempt || 1),
      decision: (['PROCEED', 'REFINE', 'PIVOT'].includes(String(fm.decision)) ? String(fm.decision) : 'PROCEED') as 'PROCEED' | 'REFINE' | 'PIVOT',
      decision_reason: String(fm.decision_reason || ''),
      depends_on: Array.isArray(fm.depends_on) ? fm.depends_on.map(String) : [],
      task: extractSection(parsed.body, 'Task'),
      acceptance_criteria: extractSection(parsed.body, 'Acceptance Criteria'),
      context: extractSection(parsed.body, 'Context'),
      upstream_data: extractSection(parsed.body, 'Upstream Data'),
    }
  }

  // Regex fallback
  const did = regexField(raw, 'directive_id')
  if (did) {
    return {
      directive_id: did,
      phase: regexField(raw, 'phase') || '',
      action: 'execute', priority: 'normal',
      created_at: '', timeout_seconds: 1800,
      max_attempts: 2, attempt: 1,
      decision: 'PROCEED', decision_reason: '',
      depends_on: [],
      task: extractSection(raw, 'Task') || raw.slice(0, 500),
      acceptance_criteria: '', context: '', upstream_data: '',
    }
  }

  return null
}

// ── Atomic write helper ────────────────────────────

export function atomicWriteFile(filePath: string, content: string): void {
  const tmpPath = filePath + '.tmp'
  fs.writeFileSync(tmpPath, content, 'utf-8')
  fs.renameSync(tmpPath, filePath)
}

// ── Write failed STATUS.md (orchestrator fallback) ─

export function writeFailedStatusMd(
  agentDir: string,
  directiveId: string,
  agentName: string,
  reason: ExitReason,
  errorMessage: string,
): void {
  const now = new Date().toISOString()
  const content = `---
directive_id: "${directiveId}"
agent: "${agentName}"
status: "failed"
completed_at: "${now}"
exit_reason: "${reason}"
error_message: "${errorMessage.replace(/"/g, '\\"')}"
---

## Summary

Failed: ${errorMessage}
`
  atomicWriteFile(path.join(agentDir, 'STATUS.md'), content)
}
