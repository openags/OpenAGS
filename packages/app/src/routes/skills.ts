/**
 * Skills Routes — SOUL.md / SKILL.md management
 */

import { Router, Request, Response } from 'express'
import * as fs from 'fs'
import * as path from 'path'
import * as yaml from 'js-yaml'

interface SkillInfo {
  name: string
  path: string
  description?: string
  frontmatter?: Record<string, unknown>
}

interface SoulInfo {
  name: string
  path: string
  role?: string
  frontmatter?: Record<string, unknown>
}

export function createSkillsRoutes(skillsDir?: string): Router {
  const router = Router()
  const defaultSkillsDir = skillsDir || path.join(process.cwd(), 'skills')

  // List all skills
  router.get('/skills', (_req: Request, res: Response) => {
    try {
      const skills = discoverSkills(defaultSkillsDir)
      res.json(skills)
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : 'Unknown error' })
    }
  })

  // Get single skill
  router.get('/skills/:name', (req: Request, res: Response) => {
    try {
      const skills = discoverSkills(defaultSkillsDir)
      const skill = skills.find(s => s.name === req.params.name)
      if (!skill) {
        res.status(404).json({ error: 'Skill not found' })
        return
      }

      // Read full content
      const content = fs.readFileSync(skill.path, 'utf-8')
      res.json({ ...skill, content })
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : 'Unknown error' })
    }
  })

  // List all souls (agent definitions)
  router.get('/souls', (_req: Request, res: Response) => {
    try {
      const souls = discoverSouls(defaultSkillsDir)
      res.json(souls)
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : 'Unknown error' })
    }
  })

  // Get single soul
  router.get('/souls/:name', (req: Request, res: Response) => {
    try {
      const souls = discoverSouls(defaultSkillsDir)
      const soul = souls.find(s => s.name === req.params.name)
      if (!soul) {
        res.status(404).json({ error: 'Soul not found' })
        return
      }

      // Read full content
      const content = fs.readFileSync(soul.path, 'utf-8')
      res.json({ ...soul, content })
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : 'Unknown error' })
    }
  })

  return router
}

function discoverSkills(baseDir: string): SkillInfo[] {
  const skills: SkillInfo[] = []

  if (!fs.existsSync(baseDir)) {
    return skills
  }

  const walk = (dir: string) => {
    const entries = fs.readdirSync(dir, { withFileTypes: true })

    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name)

      if (entry.isDirectory()) {
        walk(fullPath)
      } else if (entry.name.endsWith('.skill.md') || entry.name === 'SKILL.md') {
        const skill = parseSkillFile(fullPath)
        if (skill) skills.push(skill)
      }
    }
  }

  walk(baseDir)
  return skills
}

function discoverSouls(baseDir: string): SoulInfo[] {
  const souls: SoulInfo[] = []

  if (!fs.existsSync(baseDir)) {
    return souls
  }

  const walk = (dir: string) => {
    const entries = fs.readdirSync(dir, { withFileTypes: true })

    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name)

      if (entry.isDirectory()) {
        walk(fullPath)
      } else if (entry.name.endsWith('.soul.md') || entry.name === 'SOUL.md') {
        const soul = parseSoulFile(fullPath)
        if (soul) souls.push(soul)
      }
    }
  }

  walk(baseDir)
  return souls
}

function parseSkillFile(filePath: string): SkillInfo | null {
  try {
    const content = fs.readFileSync(filePath, 'utf-8')
    const { frontmatter, body } = parseFrontmatter(content)

    const name = frontmatter?.name as string ||
      path.basename(filePath).replace(/\.skill\.md$/, '').replace(/^SKILL$/, path.basename(path.dirname(filePath)))

    // Extract description from first paragraph
    const description = frontmatter?.description as string ||
      body.split('\n\n')[0]?.slice(0, 200) || ''

    return {
      name,
      path: filePath,
      description,
      frontmatter: frontmatter ?? undefined,
    }
  } catch {
    return null
  }
}

function parseSoulFile(filePath: string): SoulInfo | null {
  try {
    const content = fs.readFileSync(filePath, 'utf-8')
    const { frontmatter } = parseFrontmatter(content)

    const name = frontmatter?.name as string ||
      path.basename(filePath).replace(/\.soul\.md$/, '').replace(/^SOUL$/, path.basename(path.dirname(filePath)))

    const role = frontmatter?.role as string || frontmatter?.description as string

    return {
      name,
      path: filePath,
      role,
      frontmatter: frontmatter ?? undefined,
    }
  } catch {
    return null
  }
}

function parseFrontmatter(content: string): { frontmatter: Record<string, unknown> | null; body: string } {
  const match = content.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/)
  if (!match) {
    return { frontmatter: null, body: content }
  }

  try {
    const frontmatter = yaml.load(match[1]) as Record<string, unknown>
    return { frontmatter, body: match[2] }
  } catch {
    return { frontmatter: null, body: content }
  }
}
