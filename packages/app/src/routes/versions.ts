/**
 * Version Control Routes — git-based history for manuscript/proposal modules.
 *
 * Each module directory (manuscript/, proposal/) is an independent git repo.
 * Auto-initialized on first access. Every save creates a commit.
 */

import { Router, Request, Response } from 'express'
import { execFile } from 'child_process'
import { promisify } from 'util'
import * as fs from 'fs'
import * as path from 'path'
import * as os from 'os'

const execFileAsync = promisify(execFile)

// ── Git helpers ──────────────────────────────────────

async function git(cwd: string, args: string[]): Promise<string> {
  try {
    const { stdout } = await execFileAsync('git', args, {
      cwd,
      env: {
        ...process.env,
        GIT_AUTHOR_NAME: 'OpenAGS',
        GIT_AUTHOR_EMAIL: 'openags@local',
        GIT_COMMITTER_NAME: 'OpenAGS',
        GIT_COMMITTER_EMAIL: 'openags@local',
      },
      maxBuffer: 10 * 1024 * 1024, // 10MB for large diffs
    })
    return stdout
  } catch (err) {
    const msg = err instanceof Error ? (err as NodeJS.ErrnoException & { stderr?: string }).stderr || err.message : String(err)
    throw new Error(msg)
  }
}

async function isGitRepo(dir: string): Promise<boolean> {
  try {
    await git(dir, ['rev-parse', '--git-dir'])
    return true
  } catch {
    return false
  }
}

async function ensureGitRepo(dir: string): Promise<void> {
  if (await isGitRepo(dir)) return
  await git(dir, ['init'])
  // Create .gitignore for LaTeX build artifacts
  const gitignore = path.join(dir, '.gitignore')
  if (!fs.existsSync(gitignore)) {
    fs.writeFileSync(gitignore, [
      '*.aux', '*.log', '*.out', '*.toc', '*.lof', '*.lot',
      '*.bbl', '*.blg', '*.fls', '*.fdb_latexmk', '*.synctex.gz',
      '*.nav', '*.snm', '*.vrb', '*.bcf', '*.run.xml',
      '*.pdf', '.DS_Store',
    ].join('\n') + '\n', 'utf-8')
  }
  await git(dir, ['add', '-A'])
  await git(dir, ['commit', '-m', 'Initial version', '--allow-empty'])
}

async function hasChanges(dir: string): Promise<boolean> {
  const status = await git(dir, ['status', '--porcelain'])
  return status.trim().length > 0
}

async function autoCommit(dir: string, message: string): Promise<string | null> {
  await ensureGitRepo(dir)
  if (!(await hasChanges(dir))) return null
  await git(dir, ['add', '-A'])
  await git(dir, ['commit', '-m', message])
  const hash = (await git(dir, ['rev-parse', 'HEAD'])).trim()
  return hash
}

// ── Types ────────────────────────────────────────────

interface CommitInfo {
  hash: string
  short_hash: string
  message: string
  date: string
  relative_date: string
  files_changed: number
  insertions: number
  deletions: number
  labels: string[]
}

interface DiffEntry {
  file: string
  status: string // 'A' added, 'M' modified, 'D' deleted
  diff: string   // unified diff text
}

// ── Route factory ────────────────────────────────────

function param(val: string | string[]): string {
  return Array.isArray(val) ? val[0] : val
}

export function createVersionRoutes(workspaceDir?: string): Router {
  const router = Router()
  const baseDir = path.join(workspaceDir || path.join(os.homedir(), '.openags'), 'projects')

  function resolveModuleDir(projectId: string, module: string): string | null {
    const projectDir = path.join(baseDir, projectId)
    if (!fs.existsSync(path.join(projectDir, '.openags', 'meta.yaml'))) return null
    const moduleDir = path.join(projectDir, module)
    if (!fs.existsSync(moduleDir)) return null
    return moduleDir
  }

  // Initialize git repo (idempotent)
  router.post('/projects/:id/versions/:module/init', async (req: Request, res: Response) => {
    const dir = resolveModuleDir(param(req.params.id), param(req.params.module))
    if (!dir) { res.status(404).json({ error: 'Module not found' }); return }
    try {
      await ensureGitRepo(dir)
      res.json({ status: 'ok' })
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : 'Git init failed' })
    }
  })

  // Commit current changes
  router.post('/projects/:id/versions/:module/commit', async (req: Request, res: Response) => {
    const dir = resolveModuleDir(param(req.params.id), param(req.params.module))
    if (!dir) { res.status(404).json({ error: 'Module not found' }); return }
    const { message } = req.body as { message?: string }
    try {
      const hash = await autoCommit(dir, message || 'Save')
      if (hash) {
        res.json({ hash, message: message || 'Save' })
      } else {
        res.json({ hash: null, message: 'No changes to commit' })
      }
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : 'Commit failed' })
    }
  })

  // Get commit history
  router.get('/projects/:id/versions/:module/history', async (req: Request, res: Response) => {
    const dir = resolveModuleDir(param(req.params.id), param(req.params.module))
    if (!dir) { res.status(404).json({ error: 'Module not found' }); return }
    const limit = parseInt(req.query.limit as string) || 50

    try {
      await ensureGitRepo(dir)

      // Get commits with stats
      const logOutput = await git(dir, [
        'log', `--max-count=${limit}`,
        '--format=%H|%h|%s|%aI|%ar',
        '--shortstat',
      ])

      // Get all tags
      let tagsOutput = ''
      try { tagsOutput = await git(dir, ['tag', '-l', '--format=%(refname:short)|%(objectname:short)']) } catch { /* no tags */ }
      const tagMap = new Map<string, string[]>()
      for (const line of tagsOutput.trim().split('\n')) {
        if (!line) continue
        const [tagName, tagHash] = line.split('|')
        if (!tagMap.has(tagHash)) tagMap.set(tagHash, [])
        tagMap.get(tagHash)!.push(tagName)
      }

      // Parse log output
      const commits: CommitInfo[] = []
      const lines = logOutput.trim().split('\n')
      let i = 0
      while (i < lines.length) {
        const line = lines[i]
        if (!line.includes('|')) { i++; continue }
        const parts = line.split('|')
        if (parts.length < 5) { i++; continue }

        const [hash, short_hash, message, date, relative_date] = parts
        let files_changed = 0, insertions = 0, deletions = 0

        // Next line might be stat line
        if (i + 1 < lines.length && lines[i + 1].trim() !== '' && !lines[i + 1].includes('|')) {
          const statLine = lines[i + 1].trim()
          const filesMatch = statLine.match(/(\d+) files? changed/)
          const insMatch = statLine.match(/(\d+) insertions?/)
          const delMatch = statLine.match(/(\d+) deletions?/)
          if (filesMatch) files_changed = parseInt(filesMatch[1])
          if (insMatch) insertions = parseInt(insMatch[1])
          if (delMatch) deletions = parseInt(delMatch[1])
          i += 2
        } else {
          i++
        }

        commits.push({
          hash, short_hash, message, date, relative_date,
          files_changed, insertions, deletions,
          labels: tagMap.get(short_hash) || [],
        })
      }

      res.json(commits)
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : 'Failed to get history' })
    }
  })

  // Get diff for a single commit
  router.get('/projects/:id/versions/:module/diff/:hash', async (req: Request, res: Response) => {
    const dir = resolveModuleDir(param(req.params.id), param(req.params.module))
    if (!dir) { res.status(404).json({ error: 'Module not found' }); return }
    const hash = param(req.params.hash)

    try {
      await ensureGitRepo(dir)
      const diffOutput = await git(dir, ['diff', `${hash}~1..${hash}`, '--', '.'])
      const nameStatus = await git(dir, ['diff', '--name-status', `${hash}~1..${hash}`, '--', '.'])

      const entries: DiffEntry[] = []
      for (const line of nameStatus.trim().split('\n')) {
        if (!line.trim()) continue
        const [status, ...fileParts] = line.split('\t')
        const file = fileParts.join('\t')
        // Extract per-file diff
        const fileRegex = new RegExp(`diff --git a/${file.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}.*?(?=diff --git|$)`, 's')
        const match = diffOutput.match(fileRegex)
        entries.push({ file, status: status || 'M', diff: match?.[0] || '' })
      }

      res.json({ hash, entries })
    } catch (err) {
      // First commit has no parent
      try {
        const diffOutput = await git(dir, ['diff', '--root', hash, '--', '.'])
        res.json({ hash, entries: [{ file: '*', status: 'A', diff: diffOutput }] })
      } catch {
        res.status(500).json({ error: err instanceof Error ? err.message : 'Diff failed' })
      }
    }
  })

  // Compare two commits
  router.get('/projects/:id/versions/:module/diff/:hash1/:hash2', async (req: Request, res: Response) => {
    const dir = resolveModuleDir(param(req.params.id), param(req.params.module))
    if (!dir) { res.status(404).json({ error: 'Module not found' }); return }

    try {
      await ensureGitRepo(dir)
      const hash1 = param(req.params.hash1)
      const hash2 = param(req.params.hash2)
      const diffOutput = await git(dir, ['diff', hash1, hash2, '--', '.'])
      const nameStatus = await git(dir, ['diff', '--name-status', hash1, hash2, '--', '.'])

      const entries: DiffEntry[] = []
      for (const line of nameStatus.trim().split('\n')) {
        if (!line.trim()) continue
        const [status, ...fileParts] = line.split('\t')
        entries.push({ file: fileParts.join('\t'), status: status || 'M', diff: '' })
      }

      res.json({ hash1, hash2, full_diff: diffOutput, entries })
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : 'Diff failed' })
    }
  })

  // Get uncommitted changes (working directory diff)
  router.get('/projects/:id/versions/:module/changes', async (req: Request, res: Response) => {
    const dir = resolveModuleDir(param(req.params.id), param(req.params.module))
    if (!dir) { res.status(404).json({ error: 'Module not found' }); return }

    try {
      await ensureGitRepo(dir)
      const diffOutput = await git(dir, ['diff', 'HEAD', '--', '.'])
      const untrackedOutput = await git(dir, ['ls-files', '--others', '--exclude-standard'])
      const has_changes = diffOutput.trim().length > 0 || untrackedOutput.trim().length > 0
      res.json({ has_changes, diff: diffOutput, untracked: untrackedOutput.trim().split('\n').filter(Boolean) })
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : 'Failed to get changes' })
    }
  })

  // Restore to a specific version
  router.post('/projects/:id/versions/:module/restore/:hash', async (req: Request, res: Response) => {
    const dir = resolveModuleDir(param(req.params.id), param(req.params.module))
    if (!dir) { res.status(404).json({ error: 'Module not found' }); return }
    const hash = param(req.params.hash)

    try {
      await ensureGitRepo(dir)
      // Save current state first
      await autoCommit(dir, 'Auto-save before restore')
      // Restore files from the target commit
      await git(dir, ['checkout', hash, '--', '.'])
      // Commit the restoration
      await git(dir, ['add', '-A'])
      await git(dir, ['commit', '-m', `Restored to ${hash.slice(0, 7)}`])
      const newHash = (await git(dir, ['rev-parse', 'HEAD'])).trim()
      res.json({ hash: newHash, restored_from: hash })
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : 'Restore failed' })
    }
  })

  // Add a label (git tag)
  router.post('/projects/:id/versions/:module/label', async (req: Request, res: Response) => {
    const dir = resolveModuleDir(param(req.params.id), param(req.params.module))
    if (!dir) { res.status(404).json({ error: 'Module not found' }); return }
    const { name, hash } = req.body as { name?: string; hash?: string }
    if (!name) { res.status(400).json({ error: 'name is required' }); return }

    // Sanitize tag name
    const safeName = name.replace(/[^a-zA-Z0-9._-]/g, '-')

    try {
      await ensureGitRepo(dir)
      // Commit any pending changes first
      await autoCommit(dir, 'Save before label')
      const target = hash || 'HEAD'
      // Delete existing tag with same name (allow re-label)
      try { await git(dir, ['tag', '-d', safeName]) } catch { /* tag doesn't exist */ }
      await git(dir, ['tag', safeName, target])
      res.json({ name: safeName, hash: (await git(dir, ['rev-parse', target])).trim() })
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : 'Label failed' })
    }
  })

  // List labels
  router.get('/projects/:id/versions/:module/labels', async (req: Request, res: Response) => {
    const dir = resolveModuleDir(param(req.params.id), param(req.params.module))
    if (!dir) { res.status(404).json({ error: 'Module not found' }); return }

    try {
      await ensureGitRepo(dir)
      const output = await git(dir, ['tag', '-l', '--format=%(refname:short)|%(objectname:short)|%(creatordate:iso)'])
      const labels = output.trim().split('\n').filter(Boolean).map((line) => {
        const [name, hash, date] = line.split('|')
        return { name, hash, date }
      })
      res.json(labels)
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : 'Failed to list labels' })
    }
  })

  // Delete a label
  router.delete('/projects/:id/versions/:module/label/:name', async (req: Request, res: Response) => {
    const dir = resolveModuleDir(param(req.params.id), param(req.params.module))
    if (!dir) { res.status(404).json({ error: 'Module not found' }); return }

    try {
      await git(dir, ['tag', '-d', param(req.params.name)])
      res.status(204).send()
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : 'Delete label failed' })
    }
  })

  // Read file at a specific version
  router.get('/projects/:id/versions/:module/file/:hash/:filePath', async (req: Request, res: Response) => {
    const dir = resolveModuleDir(param(req.params.id), param(req.params.module))
    if (!dir) { res.status(404).json({ error: 'Module not found' }); return }
    const hash = param(req.params.hash)
    const filePath = param(req.params.filePath)

    try {
      const content = await git(dir, ['show', `${hash}:${filePath}`])
      res.json({ content, hash, path: filePath })
    } catch (err) {
      res.status(404).json({ error: err instanceof Error ? err.message : 'File not found at this version' })
    }
  })

  return router
}
