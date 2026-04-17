/**
 * Manuscript/Proposal Routes — file operations and LaTeX compilation.
 *
 * Handles file tree, read/write, create, delete, rename, compile, and PDF serving
 * for the manuscript and proposal module directories.
 */

import { Router, Request, Response } from 'express'
import * as fs from 'fs'
import * as path from 'path'
import * as os from 'os'
import { execFile } from 'child_process'
import { promisify } from 'util'
import archiver from 'archiver'
import { resolveProjectWorkspace } from '../research/project.js'

const execFileAsync = promisify(execFile)

function param(val: string | string[]): string {
  return Array.isArray(val) ? val[0] : val
}

interface FileEntry {
  name: string
  path: string
  is_dir: boolean
  size: number
  children: FileEntry[]
}

// Files/dirs hidden from both the file tree AND the zip export.
const SKIP_FILES = new Set(['SOUL.md', 'STATUS.md', 'TASKS.md', 'memory.md'])
const SKIP_DIRS = new Set(['sessions', 'skills', '.openags'])
const AUX_EXTENSIONS = new Set([
  '.aux', '.log', '.out', '.toc', '.bbl', '.blg',
  '.fdb_latexmk', '.fls', '.lof', '.lot', '.idx', '.ind', '.ilg', '.nav', '.snm',
])

function isAuxFile(name: string): boolean {
  const lower = name.toLowerCase()
  if (lower.endsWith('.synctex.gz')) return true
  return AUX_EXTENSIONS.has(path.extname(lower))
}

function shouldSkipFile(name: string): boolean {
  return SKIP_FILES.has(name) || isAuxFile(name)
}

function shouldSkipDir(name: string): boolean {
  return SKIP_DIRS.has(name) || name.startsWith('.')
}

function buildTree(dir: string, relativeTo: string): FileEntry[] {
  if (!fs.existsSync(dir)) return []
  const entries: FileEntry[] = []

  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory() ? shouldSkipDir(entry.name) : shouldSkipFile(entry.name)) continue
    const fullPath = path.join(dir, entry.name)
    const relPath = path.relative(relativeTo, fullPath)

    if (entry.isDirectory()) {
      entries.push({
        name: entry.name,
        path: relPath,
        is_dir: true,
        size: 0,
        children: buildTree(fullPath, relativeTo),
      })
    } else {
      const stat = fs.statSync(fullPath)
      entries.push({
        name: entry.name,
        path: relPath,
        is_dir: false,
        size: stat.size,
        children: [],
      })
    }
  }

  // Sort: folders first, then files, alphabetical
  entries.sort((a, b) => {
    if (a.is_dir !== b.is_dir) return a.is_dir ? -1 : 1
    return a.name.localeCompare(b.name)
  })

  return entries
}

function cleanAuxFiles(dir: string): { removed: string[] } {
  const removed: string[] = []
  if (!fs.existsSync(dir)) return { removed }
  const walk = (current: string): void => {
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const full = path.join(current, entry.name)
      if (entry.isDirectory()) {
        if (shouldSkipDir(entry.name)) continue
        walk(full)
      } else if (isAuxFile(entry.name)) {
        try {
          fs.unlinkSync(full)
          removed.push(path.relative(dir, full))
        } catch { /* ignore */ }
      }
    }
  }
  walk(dir)
  return { removed }
}

export function createManuscriptRoutes(workspaceDir?: string): Router {
  const router = Router()
  const workspaceRoot = workspaceDir || path.join(os.homedir(), '.openags')

  function resolveModuleDir(projectId: string, module: string): string | null {
    const projectDir = resolveProjectWorkspace(workspaceRoot, projectId)
    if (!projectDir) return null
    const moduleDir = path.join(projectDir, module)
    if (!fs.existsSync(moduleDir)) {
      fs.mkdirSync(moduleDir, { recursive: true })
    }
    return moduleDir
  }

  // File tree
  router.get('/manuscript/:projectId/tree', (req: Request, res: Response) => {
    const module = (req.query.module as string) || 'manuscript'
    const dir = resolveModuleDir(param(req.params.projectId), module)
    if (!dir) { res.status(404).json({ error: 'Module not found' }); return }
    res.json(buildTree(dir, dir))
  })

  // Read file
  router.get('/manuscript/:projectId/file', (req: Request, res: Response) => {
    const module = (req.query.module as string) || 'manuscript'
    const filePath = req.query.path as string
    if (!filePath) { res.status(400).json({ error: 'path is required' }); return }

    const dir = resolveModuleDir(param(req.params.projectId), module)
    if (!dir) { res.status(404).json({ error: 'Module not found' }); return }

    const fullPath = path.join(dir, filePath)
    // Security: ensure path is within module dir
    if (!fullPath.startsWith(dir)) { res.status(403).json({ error: 'Path outside module directory' }); return }

    if (!fs.existsSync(fullPath)) { res.status(404).json({ error: 'File not found' }); return }

    try {
      const content = fs.readFileSync(fullPath, 'utf-8')
      res.json({ content })
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : 'Read failed' })
    }
  })

  // Write file
  router.put('/manuscript/:projectId/file', (req: Request, res: Response) => {
    const module = (req.query.module as string) || 'manuscript'
    const { path: filePath, content } = req.body as { path?: string; content?: string }
    if (!filePath || content === undefined) { res.status(400).json({ error: 'path and content required' }); return }

    const dir = resolveModuleDir(param(req.params.projectId), module)
    if (!dir) { res.status(404).json({ error: 'Module not found' }); return }

    const fullPath = path.join(dir, filePath)
    if (!fullPath.startsWith(dir)) { res.status(403).json({ error: 'Path outside module directory' }); return }

    try {
      fs.mkdirSync(path.dirname(fullPath), { recursive: true })
      fs.writeFileSync(fullPath, content, 'utf-8')
      res.json({ success: true })
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : 'Write failed' })
    }
  })

  // Create file or directory
  router.post('/manuscript/:projectId/create', (req: Request, res: Response) => {
    const module = (req.query.module as string) || 'manuscript'
    const { path: filePath, is_dir } = req.body as { path?: string; is_dir?: boolean }
    if (!filePath) { res.status(400).json({ error: 'path required' }); return }

    const dir = resolveModuleDir(param(req.params.projectId), module)
    if (!dir) { res.status(404).json({ error: 'Module not found' }); return }

    const fullPath = path.join(dir, filePath)
    if (!fullPath.startsWith(dir)) { res.status(403).json({ error: 'Path outside module directory' }); return }

    try {
      if (is_dir) {
        fs.mkdirSync(fullPath, { recursive: true })
      } else {
        fs.mkdirSync(path.dirname(fullPath), { recursive: true })
        if (!fs.existsSync(fullPath)) fs.writeFileSync(fullPath, '', 'utf-8')
      }
      res.json({ success: true })
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : 'Create failed' })
    }
  })

  // Delete file or directory
  router.delete('/manuscript/:projectId/file', (req: Request, res: Response) => {
    const module = (req.query.module as string) || 'manuscript'
    const filePath = req.query.path as string
    if (!filePath) { res.status(400).json({ error: 'path required' }); return }

    const dir = resolveModuleDir(param(req.params.projectId), module)
    if (!dir) { res.status(404).json({ error: 'Module not found' }); return }

    const fullPath = path.join(dir, filePath)
    if (!fullPath.startsWith(dir)) { res.status(403).json({ error: 'Path outside module directory' }); return }

    try {
      fs.rmSync(fullPath, { recursive: true, force: true })
      res.status(204).send()
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : 'Delete failed' })
    }
  })

  // Rename file or directory
  router.post('/manuscript/:projectId/rename', (req: Request, res: Response) => {
    const module = (req.query.module as string) || 'manuscript'
    const { old_path, new_path } = req.body as { old_path?: string; new_path?: string }
    if (!old_path || !new_path) { res.status(400).json({ error: 'old_path and new_path required' }); return }

    const dir = resolveModuleDir(param(req.params.projectId), module)
    if (!dir) { res.status(404).json({ error: 'Module not found' }); return }

    const oldFull = path.join(dir, old_path)
    const newFull = path.join(dir, new_path)
    if (!oldFull.startsWith(dir) || !newFull.startsWith(dir)) { res.status(403).json({ error: 'Path outside module directory' }); return }

    try {
      fs.renameSync(oldFull, newFull)
      res.json({ success: true })
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : 'Rename failed' })
    }
  })

  // Compile LaTeX
  router.post('/manuscript/:projectId/compile', async (req: Request, res: Response) => {
    const module = (req.query.module as string) || 'manuscript'
    const texPath = (req.query.path as string) || 'main.tex'

    const dir = resolveModuleDir(param(req.params.projectId), module)
    if (!dir) { res.status(404).json({ error: 'Module not found' }); return }

    const texFile = path.join(dir, texPath)
    if (!fs.existsSync(texFile)) { res.status(404).json({ error: `${texPath} not found` }); return }

    try {
      // Try pdflatex first, fall back to xelatex
      let compiler = 'pdflatex'
      try { await execFileAsync('which', ['pdflatex']) } catch {
        try { await execFileAsync('which', ['xelatex']); compiler = 'xelatex' } catch {
          res.json({ success: false, log: 'No LaTeX compiler found. Install TeX Live or BasicTeX.', errors: ['pdflatex/xelatex not found'], pdf_path: null })
          return
        }
      }

      const { stdout, stderr } = await execFileAsync(compiler, [
        '-interaction=nonstopmode',
        '-synctex=1',
        '-output-directory=' + dir,
        texFile,
      ], { cwd: dir, timeout: 60000, maxBuffer: 5 * 1024 * 1024 })

      const log = stdout + '\n' + stderr
      const baseName = path.basename(texPath, '.tex')
      const pdfPath = `${baseName}.pdf`
      const pdfFull = path.join(dir, pdfPath)

      if (fs.existsSync(pdfFull)) {
        // Run bibtex + second pass if references exist
        const bibFile = path.join(dir, 'references.bib')
        if (fs.existsSync(bibFile)) {
          try {
            await execFileAsync('bibtex', [path.join(dir, baseName)], { cwd: dir, timeout: 30000 })
            await execFileAsync(compiler, ['-interaction=nonstopmode', '-output-directory=' + dir, texFile], { cwd: dir, timeout: 60000, maxBuffer: 5 * 1024 * 1024 })
          } catch { /* bibtex errors are non-fatal */ }
        }

        res.json({ success: true, pdf_path: pdfPath, log, errors: [] })
      } else {
        // Extract errors from log
        const errors = log.split('\n').filter(l => l.startsWith('!')).slice(0, 10)
        res.json({ success: false, pdf_path: null, log, errors })
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Compilation failed'
      const stderr = (err as NodeJS.ErrnoException & { stderr?: string }).stderr || ''
      res.json({ success: false, pdf_path: null, log: msg + '\n' + stderr, errors: [msg] })
    }
  })

  // Serve PDF file (inline by default, attachment when ?download=1)
  router.get('/manuscript/:projectId/pdf/:pdfPath', (req: Request, res: Response) => {
    const module = (req.query.module as string) || 'manuscript'
    const pdfPath = param(req.params.pdfPath)
    const download = req.query.download === '1' || req.query.download === 'true'

    const dir = resolveModuleDir(param(req.params.projectId), module)
    if (!dir) { res.status(404).json({ error: 'Module not found' }); return }

    const fullPath = path.join(dir, pdfPath)
    if (!fullPath.startsWith(dir)) { res.status(403).json({ error: 'Path outside module directory' }); return }

    if (!fs.existsSync(fullPath)) { res.status(404).json({ error: 'PDF not found' }); return }

    const downloadName = download
      ? `${param(req.params.projectId)}-${module}.pdf`
      : pdfPath
    const disposition = download ? 'attachment' : 'inline'
    res.setHeader('Content-Type', 'application/pdf')
    res.setHeader('Content-Disposition', `${disposition}; filename="${downloadName}"`)
    fs.createReadStream(fullPath).pipe(res)
  })

  // Export module as a ZIP (LaTeX source + optional compiled PDF, excludes aux + agent files)
  router.get('/manuscript/:projectId/export', (req: Request, res: Response) => {
    const module = (req.query.module as string) || 'manuscript'
    const includePdf = req.query.include_pdf !== 'false' && req.query.include_pdf !== '0'

    const dir = resolveModuleDir(param(req.params.projectId), module)
    if (!dir) { res.status(404).json({ error: 'Module not found' }); return }

    const fileName = `${param(req.params.projectId)}-${module}.zip`
    res.setHeader('Content-Type', 'application/zip')
    res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`)

    const archive = archiver('zip', { zlib: { level: 9 } })
    archive.on('error', (err) => {
      if (!res.headersSent) {
        res.status(500).json({ error: err.message }); return
      }
      res.end()
    })
    archive.pipe(res)

    const walk = (currentDir: string, archivePrefix: string): void => {
      for (const entry of fs.readdirSync(currentDir, { withFileTypes: true })) {
        const name = entry.name
        if (entry.isDirectory()) {
          if (shouldSkipDir(name)) continue
          walk(path.join(currentDir, name), path.join(archivePrefix, name))
        } else {
          if (shouldSkipFile(name)) continue
          if (!includePdf && name.toLowerCase().endsWith('.pdf')) continue
          archive.file(path.join(currentDir, name), { name: path.join(archivePrefix, name) })
        }
      }
    }

    walk(dir, module)
    void archive.finalize()
  })

  // Delete LaTeX build artifacts (aux files) — tree-wide, keeps sources and PDF.
  router.delete('/manuscript/:projectId/aux', (req: Request, res: Response) => {
    const module = (req.query.module as string) || 'manuscript'
    const dir = resolveModuleDir(param(req.params.projectId), module)
    if (!dir) { res.status(404).json({ error: 'Module not found' }); return }
    try {
      const result = cleanAuxFiles(dir)
      res.json({ success: true, removed: result.removed, count: result.removed.length })
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : 'Clean failed' })
    }
  })

  // SyncTeX: PDF position → LaTeX source position
  router.post('/manuscript/:projectId/synctex', async (req: Request, res: Response) => {
    const module = (req.query.module as string) || 'manuscript'
    const { page, x, y, pdf } = req.body as { page: number; x: number; y: number; pdf?: string }

    if (!page || x === undefined || y === undefined) {
      res.status(400).json({ error: 'page, x, y are required' }); return
    }

    const dir = resolveModuleDir(param(req.params.projectId), module)
    if (!dir) { res.status(404).json({ error: 'Module not found' }); return }

    const pdfFile = path.join(dir, pdf || 'main.pdf')
    if (!fs.existsSync(pdfFile)) {
      res.status(404).json({ error: 'PDF not found. Compile first.' }); return
    }

    try {
      // Check if synctex is available
      await execFileAsync('which', ['synctex'])

      // synctex edit -o page:x:y:pdffile
      const { stdout } = await execFileAsync('synctex', [
        'edit',
        '-o', `${page}:${x}:${y}:${pdfFile}`,
      ], { cwd: dir, timeout: 5000 })

      // Parse synctex output: Input:/path/to/file.tex\nLine:42\nColumn:0
      const inputMatch = stdout.match(/Input:(.+)/)
      const lineMatch = stdout.match(/Line:(\d+)/)
      const columnMatch = stdout.match(/Column:(\d+)/)

      if (inputMatch && lineMatch) {
        let file = inputMatch[1].trim()
        // Make path relative to module dir
        if (file.startsWith(dir)) {
          file = path.relative(dir, file)
        }
        res.json({
          file,
          line: parseInt(lineMatch[1], 10),
          column: columnMatch ? parseInt(columnMatch[1], 10) : 0,
        })
      } else {
        res.json({ file: null, line: null, column: null, raw: stdout })
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'SyncTeX failed'
      // If synctex command not found, give helpful message
      if (msg.includes('ENOENT') || msg.includes('not found')) {
        res.status(404).json({ error: 'synctex command not found. It comes with TeX Live.' })
      } else {
        res.status(500).json({ error: msg })
      }
    }
  })

  return router
}
