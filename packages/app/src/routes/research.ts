/**
 * Research Tools Routes — arXiv, Semantic Scholar, citations
 */

import { Router, Request, Response } from 'express'
import { searchArxiv, getArxivPaper, arxivToCitation } from '../research/tools/arxiv.js'
import { searchSemanticScholar, getS2Paper, getS2Citations, getS2References } from '../research/tools/semantic-scholar.js'
import { verifyCitation, verifyCitations, parseBibtex } from '../research/tools/citations.js'
import { Citation } from '../schemas.js'

function getParamId(req: Request): string {
  const id = req.params.id
  return Array.isArray(id) ? id[0] : id
}

export function createResearchRoutes(): Router {
  const router = Router()

  // ── arXiv ──────────────────────────────────────────

  router.get('/arxiv/search', async (req: Request, res: Response) => {
    try {
      const query = req.query.q as string
      const limit = parseInt(req.query.limit as string) || 10

      if (!query) {
        res.status(400).json({ error: 'query parameter q is required' })
        return
      }

      const papers = await searchArxiv({ query, maxResults: limit })
      res.json(papers)
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : 'Unknown error' })
    }
  })

  router.get('/arxiv/paper/:id', async (req: Request, res: Response) => {
    try {
      const paper = await getArxivPaper(getParamId(req))
      if (!paper) {
        res.status(404).json({ error: 'Paper not found' })
        return
      }
      res.json(paper)
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : 'Unknown error' })
    }
  })

  router.get('/arxiv/paper/:id/citation', async (req: Request, res: Response) => {
    try {
      const paper = await getArxivPaper(getParamId(req))
      if (!paper) {
        res.status(404).json({ error: 'Paper not found' })
        return
      }
      res.json(arxivToCitation(paper))
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : 'Unknown error' })
    }
  })

  // ── Semantic Scholar ───────────────────────────────

  router.get('/s2/search', async (req: Request, res: Response) => {
    try {
      const query = req.query.q as string
      const limit = parseInt(req.query.limit as string) || 10
      const year = req.query.year as string | undefined

      if (!query) {
        res.status(400).json({ error: 'query parameter q is required' })
        return
      }

      const papers = await searchSemanticScholar({ query, limit, year })
      res.json(papers)
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : 'Unknown error' })
    }
  })

  router.get('/s2/paper/:id', async (req: Request, res: Response) => {
    try {
      const paper = await getS2Paper(getParamId(req))
      if (!paper) {
        res.status(404).json({ error: 'Paper not found' })
        return
      }
      res.json(paper)
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : 'Unknown error' })
    }
  })

  router.get('/s2/paper/:id/citations', async (req: Request, res: Response) => {
    try {
      const limit = parseInt(req.query.limit as string) || 100
      const citations = await getS2Citations(getParamId(req), limit)
      res.json(citations)
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : 'Unknown error' })
    }
  })

  router.get('/s2/paper/:id/references', async (req: Request, res: Response) => {
    try {
      const limit = parseInt(req.query.limit as string) || 100
      const references = await getS2References(getParamId(req), limit)
      res.json(references)
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : 'Unknown error' })
    }
  })

  // ── Citation Verification ──────────────────────────

  router.post('/citations/verify', async (req: Request, res: Response) => {
    try {
      const citation = req.body as Citation
      if (!citation.title) {
        res.status(400).json({ error: 'title is required' })
        return
      }

      const result = await verifyCitation(citation)
      res.json(result)
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : 'Unknown error' })
    }
  })

  router.post('/citations/verify-batch', async (req: Request, res: Response) => {
    try {
      const citations = req.body as Citation[]
      if (!Array.isArray(citations)) {
        res.status(400).json({ error: 'request body must be an array of citations' })
        return
      }

      const results = await verifyCitations(citations)
      res.json(results)
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : 'Unknown error' })
    }
  })

  router.post('/citations/parse-bibtex', (req: Request, res: Response) => {
    try {
      const { bibtex } = req.body
      if (!bibtex) {
        res.status(400).json({ error: 'bibtex is required' })
        return
      }

      const citations = parseBibtex(bibtex)
      res.json(citations)
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : 'Unknown error' })
    }
  })

  return router
}
