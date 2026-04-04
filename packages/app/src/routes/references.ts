/**
 * References Routes — per-project reference library (mini-Zotero).
 *
 * Every reference stores its BibTeX so agents can cite accurately.
 * references.json = source of truth, references.bib = auto-generated.
 */

import { Router, Request, Response } from 'express'
import * as fs from 'fs'
import * as path from 'path'
import * as os from 'os'
import * as crypto from 'crypto'

// ── Types ────────────────────────────────────────────

interface Reference {
  id: string
  title: string
  authors: string[]
  year: number | null
  doi: string | null
  arxiv_id: string | null
  venue: string | null
  bibtex_key: string
  bibtex: string
  pdf_path: string | null
  url: string | null
  tags: string[]
  notes: string
  added_at: string
}

// ── Helpers ──────────────────────────────────────────

function getRefsPath(projectDir: string): string {
  return path.join(projectDir, 'literature', 'references.json')
}

function getBibPath(projectDir: string): string {
  return path.join(projectDir, 'literature', 'references.bib')
}

function loadRefs(projectDir: string): Reference[] {
  const p = getRefsPath(projectDir)
  if (!fs.existsSync(p)) return []
  try {
    return JSON.parse(fs.readFileSync(p, 'utf-8'))
  } catch {
    return []
  }
}

function saveRefs(projectDir: string, refs: Reference[]): void {
  const dir = path.dirname(getRefsPath(projectDir))
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
  fs.writeFileSync(getRefsPath(projectDir), JSON.stringify(refs, null, 2), 'utf-8')
  // Auto-regenerate .bib file
  regenerateBib(projectDir, refs)
}

function regenerateBib(projectDir: string, refs: Reference[]): void {
  const bib = refs
    .filter((r) => r.bibtex)
    .map((r) => r.bibtex)
    .join('\n\n')
  fs.writeFileSync(getBibPath(projectDir), bib, 'utf-8')
}

function generateBibtexKey(ref: { authors: string[]; year: number | null; title: string }): string {
  const firstAuthor = ref.authors[0]?.split(/[, ]+/).pop()?.toLowerCase() || 'unknown'
  const year = ref.year || 'xxxx'
  const word = ref.title.split(/\s+/).find((w) => w.length > 3)?.toLowerCase().replace(/[^a-z]/g, '') || 'paper'
  return `${firstAuthor}${year}${word}`
}

function generateBibtex(ref: Reference): string {
  const authorStr = ref.authors.join(' and ')
  return `@article{${ref.bibtex_key},
  title   = {${ref.title}},
  author  = {${authorStr}},
  year    = {${ref.year || ''}},${ref.doi ? `\n  doi     = {${ref.doi}},` : ''}${ref.arxiv_id ? `\n  eprint  = {${ref.arxiv_id}},\n  archivePrefix = {arXiv},` : ''}${ref.venue ? `\n  journal = {${ref.venue}},` : ''}${ref.url ? `\n  url     = {${ref.url}},` : ''}
}`
}

/**
 * Parse a BibTeX string into reference entries.
 */
function parseBibtexEntries(bibtex: string): Partial<Reference>[] {
  const entries: Partial<Reference>[] = []
  // Match @type{key, ... }
  const entryRegex = /@(\w+)\s*\{([^,]*),([^@]*)\}/g
  let match: RegExpExecArray | null

  while ((match = entryRegex.exec(bibtex)) !== null) {
    const bibtexKey = match[2].trim()
    const body = match[3]

    const field = (name: string): string | null => {
      const m = body.match(new RegExp(`${name}\\s*=\\s*[{"]([^}"]*)[}"]`, 'i'))
      return m ? m[1].trim() : null
    }

    const title = field('title') || ''
    const authorStr = field('author') || ''
    const authors = authorStr ? authorStr.split(/\s+and\s+/i).map((a) => a.trim()) : []
    const yearStr = field('year')
    const year = yearStr ? parseInt(yearStr, 10) : null

    entries.push({
      title,
      authors,
      year: year && !isNaN(year) ? year : null,
      doi: field('doi'),
      arxiv_id: field('eprint'),
      venue: field('journal') || field('booktitle'),
      bibtex_key: bibtexKey,
      bibtex: match[0],
      url: field('url'),
    })
  }

  return entries
}

// ── Route factory ────────────────────────────────────

function param(val: string | string[]): string {
  return Array.isArray(val) ? val[0] : val
}

export function createReferencesRoutes(workspaceDir?: string): Router {
  const router = Router()
  const baseDir = path.join(workspaceDir || path.join(os.homedir(), '.openags'), 'projects')

  function resolveProjectDir(projectId: string): string | null {
    const dir = path.join(baseDir, projectId)
    if (fs.existsSync(path.join(dir, '.openags', 'meta.yaml'))) return dir
    return null
  }

  // List all references
  router.get('/projects/:id/references', (req: Request, res: Response) => {
    const dir = resolveProjectDir(param(req.params.id))
    if (!dir) { res.status(404).json({ error: 'Project not found' }); return }
    res.json(loadRefs(dir))
  })

  // Add reference (by DOI, arXiv, or manual)
  router.post('/projects/:id/references', async (req: Request, res: Response) => {
    const dir = resolveProjectDir(param(req.params.id))
    if (!dir) { res.status(404).json({ error: 'Project not found' }); return }

    const refs = loadRefs(dir)
    const body = req.body as Partial<Reference> & { doi_lookup?: string; arxiv_lookup?: string }

    let newRef: Reference

    try {
      // Auto-fetch by DOI
      if (body.doi_lookup) {
        const { getS2PaperByDOI, s2ToCitation } = await import('../research/tools/semantic-scholar.js')
        const paper = await getS2PaperByDOI(body.doi_lookup)
        if (!paper) { res.status(404).json({ error: 'Paper not found by DOI' }); return }
        const c = s2ToCitation(paper)
        const key = generateBibtexKey(c)
        newRef = {
          id: crypto.randomUUID(), title: c.title, authors: c.authors, year: c.year,
          doi: c.doi || body.doi_lookup, arxiv_id: c.arxiv_id, venue: c.venue,
          bibtex_key: key, bibtex: '', pdf_path: null, url: paper.url || null,
          tags: body.tags || [], notes: body.notes || '', added_at: new Date().toISOString(),
        }
        newRef.bibtex = c.bibtex || generateBibtex(newRef)
      }
      // Auto-fetch by arXiv ID
      else if (body.arxiv_lookup) {
        const { getArxivPaper, arxivToCitation } = await import('../research/tools/arxiv.js')
        const paper = await getArxivPaper(body.arxiv_lookup)
        if (!paper) { res.status(404).json({ error: 'Paper not found on arXiv' }); return }
        const c = arxivToCitation(paper)
        const key = generateBibtexKey(c)
        newRef = {
          id: crypto.randomUUID(), title: c.title, authors: c.authors, year: c.year,
          doi: c.doi, arxiv_id: c.arxiv_id || body.arxiv_lookup, venue: c.venue,
          bibtex_key: key, bibtex: '', pdf_path: null, url: paper.absUrl,
          tags: body.tags || [], notes: body.notes || '', added_at: new Date().toISOString(),
        }
        newRef.bibtex = c.bibtex || generateBibtex(newRef)
      }
      // Manual entry
      else {
        if (!body.title) { res.status(400).json({ error: 'title is required' }); return }
        const key = body.bibtex_key || generateBibtexKey({
          authors: body.authors || [],
          year: body.year ?? null,
          title: body.title,
        })
        const stub: Reference = {
          id: crypto.randomUUID(),
          title: body.title,
          authors: body.authors || [],
          year: body.year ?? null,
          doi: body.doi ?? null,
          arxiv_id: body.arxiv_id ?? null,
          venue: body.venue ?? null,
          bibtex_key: key,
          bibtex: '',
          pdf_path: body.pdf_path ?? null,
          url: body.url ?? null,
          tags: body.tags || [],
          notes: body.notes || '',
          added_at: new Date().toISOString(),
        }
        stub.bibtex = body.bibtex || generateBibtex(stub)
        newRef = stub
      }

      // Deduplicate by DOI or arXiv ID
      if (newRef.doi && refs.some((r) => r.doi === newRef.doi)) {
        res.status(409).json({ error: 'Reference with this DOI already exists' })
        return
      }
      if (newRef.arxiv_id && refs.some((r) => r.arxiv_id === newRef.arxiv_id)) {
        res.status(409).json({ error: 'Reference with this arXiv ID already exists' })
        return
      }

      refs.push(newRef)
      saveRefs(dir, refs)
      res.status(201).json(newRef)
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : 'Failed to add reference' })
    }
  })

  // Import BibTeX (multiple entries at once)
  router.post('/projects/:id/references/import-bibtex', (req: Request, res: Response) => {
    const dir = resolveProjectDir(param(req.params.id))
    if (!dir) { res.status(404).json({ error: 'Project not found' }); return }

    const { bibtex } = req.body as { bibtex?: string }
    if (!bibtex) { res.status(400).json({ error: 'bibtex field is required' }); return }

    const refs = loadRefs(dir)
    const parsed = parseBibtexEntries(bibtex)
    const added: Reference[] = []

    for (const entry of parsed) {
      if (!entry.title) continue
      // Skip duplicates by bibtex_key
      if (refs.some((r) => r.bibtex_key === entry.bibtex_key)) continue

      const newRef: Reference = {
        id: crypto.randomUUID(),
        title: entry.title || '',
        authors: entry.authors || [],
        year: entry.year ?? null,
        doi: entry.doi ?? null,
        arxiv_id: entry.arxiv_id ?? null,
        venue: entry.venue ?? null,
        bibtex_key: entry.bibtex_key || generateBibtexKey({ authors: entry.authors || [], year: entry.year ?? null, title: entry.title || '' }),
        bibtex: entry.bibtex || '',
        pdf_path: null,
        url: entry.url ?? null,
        tags: [],
        notes: '',
        added_at: new Date().toISOString(),
      }
      refs.push(newRef)
      added.push(newRef)
    }

    saveRefs(dir, refs)
    res.json({ added: added.length, references: added })
  })

  // Upload PDF
  router.post('/projects/:id/references/upload-pdf', (req: Request, res: Response) => {
    const dir = resolveProjectDir(param(req.params.id))
    if (!dir) { res.status(404).json({ error: 'Project not found' }); return }

    // Read raw body as buffer
    const chunks: Buffer[] = []
    req.on('data', (chunk: Buffer) => chunks.push(chunk))
    req.on('end', () => {
      const buffer = Buffer.concat(chunks)
      const filename = (req.headers['x-filename'] as string) || `paper-${Date.now()}.pdf`
      const papersDir = path.join(dir, 'literature', 'papers')
      if (!fs.existsSync(papersDir)) fs.mkdirSync(papersDir, { recursive: true })

      const safeName = filename.replace(/[^a-zA-Z0-9._-]/g, '_')
      const destPath = path.join(papersDir, safeName)
      fs.writeFileSync(destPath, buffer)

      res.json({ path: `papers/${safeName}`, size: buffer.length })
    })
  })

  // Update reference
  router.put('/projects/:id/references/:refId', (req: Request, res: Response) => {
    const dir = resolveProjectDir(param(req.params.id))
    if (!dir) { res.status(404).json({ error: 'Project not found' }); return }

    const refs = loadRefs(dir)
    const idx = refs.findIndex((r) => r.id === param(req.params.refId))
    if (idx === -1) { res.status(404).json({ error: 'Reference not found' }); return }

    const updates = req.body as Partial<Reference>
    const ref = refs[idx]

    // Apply updates (only allowed fields)
    if (updates.title !== undefined) ref.title = updates.title
    if (updates.authors !== undefined) ref.authors = updates.authors
    if (updates.year !== undefined) ref.year = updates.year
    if (updates.doi !== undefined) ref.doi = updates.doi
    if (updates.arxiv_id !== undefined) ref.arxiv_id = updates.arxiv_id
    if (updates.venue !== undefined) ref.venue = updates.venue
    if (updates.bibtex_key !== undefined) ref.bibtex_key = updates.bibtex_key
    if (updates.bibtex !== undefined) ref.bibtex = updates.bibtex
    if (updates.pdf_path !== undefined) ref.pdf_path = updates.pdf_path
    if (updates.url !== undefined) ref.url = updates.url
    if (updates.tags !== undefined) ref.tags = updates.tags
    if (updates.notes !== undefined) ref.notes = updates.notes

    // Regenerate BibTeX if metadata changed but bibtex wasn't explicitly set
    if (updates.bibtex === undefined && (updates.title || updates.authors || updates.year)) {
      ref.bibtex = generateBibtex(ref)
    }

    saveRefs(dir, refs)
    res.json(ref)
  })

  // Delete reference
  router.delete('/projects/:id/references/:refId', (req: Request, res: Response) => {
    const dir = resolveProjectDir(param(req.params.id))
    if (!dir) { res.status(404).json({ error: 'Project not found' }); return }

    const refs = loadRefs(dir)
    const idx = refs.findIndex((r) => r.id === param(req.params.refId))
    if (idx === -1) { res.status(404).json({ error: 'Reference not found' }); return }

    const removed = refs.splice(idx, 1)[0]

    // Delete associated PDF if exists
    if (removed.pdf_path) {
      const pdfFull = path.join(dir, 'literature', removed.pdf_path)
      if (fs.existsSync(pdfFull)) fs.unlinkSync(pdfFull)
    }

    saveRefs(dir, refs)
    res.status(204).send()
  })

  // Export BibTeX
  router.get('/projects/:id/references/export-bibtex', (req: Request, res: Response) => {
    const dir = resolveProjectDir(param(req.params.id))
    if (!dir) { res.status(404).json({ error: 'Project not found' }); return }

    const refs = loadRefs(dir)
    const bib = refs.filter((r) => r.bibtex).map((r) => r.bibtex).join('\n\n')

    res.setHeader('Content-Type', 'application/x-bibtex')
    res.setHeader('Content-Disposition', 'attachment; filename="references.bib"')
    res.send(bib)
  })

  // Lookup (preview before adding — no save)
  router.post('/projects/:id/references/lookup', async (req: Request, res: Response) => {
    const { doi, arxiv_id, title } = req.body as { doi?: string; arxiv_id?: string; title?: string }

    try {
      if (doi) {
        const { getS2PaperByDOI, s2ToCitation } = await import('../research/tools/semantic-scholar.js')
        const paper = await getS2PaperByDOI(doi)
        if (paper) { res.json(s2ToCitation(paper)); return }
      }
      if (arxiv_id) {
        const { getArxivPaper, arxivToCitation } = await import('../research/tools/arxiv.js')
        const paper = await getArxivPaper(arxiv_id)
        if (paper) { res.json(arxivToCitation(paper)); return }
      }
      if (title) {
        const { searchSemanticScholar, s2ToCitation } = await import('../research/tools/semantic-scholar.js')
        const results = await searchSemanticScholar({ query: title, limit: 1 })
        if (results.length > 0) { res.json(s2ToCitation(results[0])); return }
      }
      res.status(404).json({ error: 'Paper not found' })
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : 'Lookup failed' })
    }
  })

  return router
}
