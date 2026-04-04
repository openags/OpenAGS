/**
 * Adapter — converts SOUL.md + skills + memory into CLI agent config files.
 *
 * Before sending a message to Claude Code / Codex / Gemini, this reads the
 * OpenAGS folder structure and generates the config file the CLI agent auto-loads.
 *
 * Mapping:
 *   Claude Code → CLAUDE.md
 *   Codex       → AGENTS.md
 *   Gemini CLI  → GEMINI.md
 *   Cursor      → CLAUDE.md (same as Claude)
 */

import * as fs from 'fs'
import * as path from 'path'

/** Read SOUL.md body (strip YAML frontmatter, keep the prompt). */
function readSoulBody(folder: string): string {
  const soulPath = path.join(folder, 'SOUL.md')
  if (!fs.existsSync(soulPath)) return ''

  const text = fs.readFileSync(soulPath, 'utf-8')
  // Strip frontmatter
  if (text.startsWith('---')) {
    const end = text.indexOf('---', 3)
    if (end !== -1) return text.slice(end + 3).trim()
  }
  return text.trim()
}

/** Read all skill .md files from folder/skills/ (body only, strip frontmatter). */
function readSkills(folder: string): string[] {
  const skillsDir = path.join(folder, 'skills')
  if (!fs.existsSync(skillsDir) || !fs.statSync(skillsDir).isDirectory()) return []

  const bodies: string[] = []
  for (const file of fs.readdirSync(skillsDir).sort()) {
    if (!file.endsWith('.md')) continue
    let text = fs.readFileSync(path.join(skillsDir, file), 'utf-8')
    if (text.startsWith('---')) {
      const end = text.indexOf('---', 3)
      if (end !== -1) text = text.slice(end + 3)
    }
    text = text.trim()
    if (text) bodies.push(text)
  }
  return bodies
}

/** Read memory.md content. */
function readMemory(folder: string): string {
  const memPath = path.join(folder, 'memory.md')
  if (!fs.existsSync(memPath)) return ''
  return fs.readFileSync(memPath, 'utf-8').trim()
}

/** Read MEMORY.md (auto-learned, max 200 lines). */
function readAutoMemory(folder: string): string {
  const memPath = path.join(folder, 'MEMORY.md')
  if (!fs.existsSync(memPath)) return ''
  const lines = fs.readFileSync(memPath, 'utf-8').trim().split('\n')
  return lines.slice(0, 200).join('\n')
}

/** Build combined prompt from SOUL.md + skills + memory. */
function buildPrompt(folder: string): string {
  const parts: string[] = []

  const soul = readSoulBody(folder)
  if (soul) parts.push(soul)

  const skills = readSkills(folder)
  if (skills.length > 0) {
    parts.push('## Skills\n')
    parts.push(...skills)
  }

  const memory = readMemory(folder)
  if (memory) parts.push(`## Project Memory\n\n${memory}`)

  const autoMem = readAutoMemory(folder)
  if (autoMem && autoMem !== memory) parts.push(`## Learned Knowledge\n\n${autoMem}`)

  return parts.join('\n\n')
}

/** All config files that should stay in sync. */
const CONFIG_FILES: Record<string, string> = {
  'SOUL.md': 'soul',
  'CLAUDE.md': 'claude_code',
  'AGENTS.md': 'codex',
  'GEMINI.md': 'gemini_cli',
}

/**
 * Sync all config files in a folder.
 * Finds the most recently modified one, uses it as source, updates the rest.
 * If SOUL.md is the source → extract body (strip frontmatter) for others.
 * If CLAUDE.md/AGENTS.md/GEMINI.md is the source → update SOUL.md body (keep frontmatter).
 */
export function syncConfigFiles(folder: string): void {
  // Find which config file is newest
  let newestFile = ''
  let newestMtime = 0

  for (const filename of Object.keys(CONFIG_FILES)) {
    const p = path.join(folder, filename)
    try {
      const mtime = fs.statSync(p).mtimeMs
      if (mtime > newestMtime) {
        newestMtime = mtime
        newestFile = filename
      }
    } catch { /* doesn't exist */ }
  }

  if (!newestFile) {
    // No config files exist — nothing to sync
    return
  }

  if (newestFile === 'SOUL.md') {
    // SOUL.md is the source → generate others from it (+ skills + memory)
    const content = buildPrompt(folder)
      || `You are an AI assistant working in the ${path.basename(folder)} directory.`

    for (const filename of Object.keys(CONFIG_FILES)) {
      if (filename === 'SOUL.md') continue
      fs.writeFileSync(path.join(folder, filename), content + '\n', 'utf-8')
    }
  } else {
    // A CLI config file is newest → use its content to update all others
    const sourcePath = path.join(folder, newestFile)
    const content = fs.readFileSync(sourcePath, 'utf-8').trim()

    // Update other CLI config files
    for (const filename of Object.keys(CONFIG_FILES)) {
      if (filename === newestFile || filename === 'SOUL.md') continue
      fs.writeFileSync(path.join(folder, filename), content + '\n', 'utf-8')
    }

    // Update SOUL.md body (keep frontmatter)
    const soulPath = path.join(folder, 'SOUL.md')
    if (fs.existsSync(soulPath)) {
      const soulText = fs.readFileSync(soulPath, 'utf-8')
      if (soulText.startsWith('---')) {
        const end = soulText.indexOf('---', 3)
        if (end !== -1) {
          const frontmatter = soulText.slice(0, end + 3)
          fs.writeFileSync(soulPath, frontmatter + '\n\n' + content + '\n', 'utf-8')
        }
      }
    }
  }
}

/**
 * Sync all config files + skill symlinks across an entire project.
 */
export function syncProjectConfigs(projectDir: string): void {
  // Sync module config files (not root — root CLAUDE.md is project-level)
  try {
    for (const entry of fs.readdirSync(projectDir, { withFileTypes: true })) {
      if (!entry.isDirectory() || entry.name.startsWith('.')) continue
      const sub = path.join(projectDir, entry.name)
      const hasSoul = fs.existsSync(path.join(sub, 'SOUL.md'))
      const hasClaude = fs.existsSync(path.join(sub, 'CLAUDE.md'))
      if (hasSoul || hasClaude) {
        syncConfigFiles(sub)
      }
    }
  } catch { /* ignore */ }

  // Sync skill symlinks for Claude Code discovery
  syncSkillSymlinks(projectDir)
}

/**
 * Create .claude/skills/ symlinks so Claude Code can discover our skills.
 * Links project-level skills and module-level skills.
 */
function syncSkillSymlinks(projectDir: string): void {
  // Project-level skills: skills/ → .claude/skills/
  const projectSkills = path.join(projectDir, 'skills')
  if (fs.existsSync(projectSkills) && fs.statSync(projectSkills).isDirectory()) {
    const claudeSkills = path.join(projectDir, '.claude', 'skills')
    fs.mkdirSync(claudeSkills, { recursive: true })

    for (const entry of fs.readdirSync(projectSkills, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue
      const skillDir = path.join(projectSkills, entry.name)
      if (!fs.existsSync(path.join(skillDir, 'SKILL.md'))) continue

      const link = path.join(claudeSkills, entry.name)
      if (!fs.existsSync(link)) {
        try { fs.symlinkSync(skillDir, link) } catch { /* ignore */ }
      }
    }
  }

  // Module-level skills: module/skills/ → module/.claude/skills/
  try {
    for (const entry of fs.readdirSync(projectDir, { withFileTypes: true })) {
      if (!entry.isDirectory() || entry.name.startsWith('.')) continue
      const modDir = path.join(projectDir, entry.name)
      const modSkills = path.join(modDir, 'skills')

      if (!fs.existsSync(modSkills) || !fs.statSync(modSkills).isDirectory()) continue

      const claudeModSkills = path.join(modDir, '.claude', 'skills')
      fs.mkdirSync(claudeModSkills, { recursive: true })

      for (const skill of fs.readdirSync(modSkills, { withFileTypes: true })) {
        if (!skill.isDirectory()) continue
        const skillDir = path.join(modSkills, skill.name)
        if (!fs.existsSync(path.join(skillDir, 'SKILL.md'))) continue

        const link = path.join(claudeModSkills, skill.name)
        if (!fs.existsSync(link)) {
          try { fs.symlinkSync(skillDir, link) } catch { /* ignore */ }
        }
      }
    }
  } catch { /* ignore */ }
}
