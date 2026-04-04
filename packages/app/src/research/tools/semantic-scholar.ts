/**
 * Semantic Scholar API Tool — search and fetch papers
 */

import { Citation } from '../../schemas.js'

const S2_API = 'https://api.semanticscholar.org/graph/v1'

export interface S2SearchOptions {
  query: string
  limit?: number
  offset?: number
  fields?: string[]
  year?: string // e.g., "2020-2024" or "2023"
}

export interface S2Paper {
  paperId: string
  title: string
  abstract?: string
  authors: Array<{ authorId: string; name: string }>
  year?: number
  venue?: string
  citationCount?: number
  referenceCount?: number
  influentialCitationCount?: number
  isOpenAccess?: boolean
  openAccessPdf?: { url: string }
  externalIds?: {
    DOI?: string
    ArXiv?: string
    PubMed?: string
  }
  publicationTypes?: string[]
  url: string
}

const DEFAULT_FIELDS = [
  'paperId', 'title', 'abstract', 'authors', 'year', 'venue',
  'citationCount', 'referenceCount', 'influentialCitationCount',
  'isOpenAccess', 'openAccessPdf', 'externalIds', 'publicationTypes', 'url'
]

/**
 * Search Semantic Scholar for papers.
 */
export async function searchSemanticScholar(options: S2SearchOptions): Promise<S2Paper[]> {
  const { query, limit = 10, offset = 0, fields = DEFAULT_FIELDS, year } = options

  const params = new URLSearchParams({
    query,
    limit: String(limit),
    offset: String(offset),
    fields: fields.join(','),
  })

  if (year) {
    params.set('year', year)
  }

  const response = await fetch(`${S2_API}/paper/search?${params}`, {
    headers: {
      'Accept': 'application/json',
    },
  })

  if (!response.ok) {
    if (response.status === 429) {
      throw new Error('Semantic Scholar rate limit exceeded. Please wait and try again.')
    }
    throw new Error(`Semantic Scholar API error: ${response.status}`)
  }

  const data = await response.json() as { data: S2Paper[] }
  return data.data || []
}

/**
 * Get a single paper by Semantic Scholar paper ID.
 */
export async function getS2Paper(paperId: string): Promise<S2Paper | null> {
  const params = new URLSearchParams({
    fields: DEFAULT_FIELDS.join(','),
  })

  const response = await fetch(`${S2_API}/paper/${paperId}?${params}`, {
    headers: {
      'Accept': 'application/json',
    },
  })

  if (!response.ok) {
    if (response.status === 404) return null
    throw new Error(`Semantic Scholar API error: ${response.status}`)
  }

  return await response.json() as S2Paper
}

/**
 * Get paper by DOI.
 */
export async function getS2PaperByDOI(doi: string): Promise<S2Paper | null> {
  return getS2Paper(`DOI:${doi}`)
}

/**
 * Get paper by arXiv ID.
 */
export async function getS2PaperByArxiv(arxivId: string): Promise<S2Paper | null> {
  const cleanId = arxivId.replace('arXiv:', '').trim()
  return getS2Paper(`ARXIV:${cleanId}`)
}

/**
 * Get paper citations.
 */
export async function getS2Citations(paperId: string, limit = 100): Promise<S2Paper[]> {
  const params = new URLSearchParams({
    fields: 'paperId,title,authors,year,venue,citationCount',
    limit: String(limit),
  })

  const response = await fetch(`${S2_API}/paper/${paperId}/citations?${params}`, {
    headers: {
      'Accept': 'application/json',
    },
  })

  if (!response.ok) {
    throw new Error(`Semantic Scholar API error: ${response.status}`)
  }

  const data = await response.json() as { data: Array<{ citingPaper: S2Paper }> }
  return data.data?.map(d => d.citingPaper) || []
}

/**
 * Get paper references.
 */
export async function getS2References(paperId: string, limit = 100): Promise<S2Paper[]> {
  const params = new URLSearchParams({
    fields: 'paperId,title,authors,year,venue,citationCount',
    limit: String(limit),
  })

  const response = await fetch(`${S2_API}/paper/${paperId}/references?${params}`, {
    headers: {
      'Accept': 'application/json',
    },
  })

  if (!response.ok) {
    throw new Error(`Semantic Scholar API error: ${response.status}`)
  }

  const data = await response.json() as { data: Array<{ citedPaper: S2Paper }> }
  return data.data?.map(d => d.citedPaper) || []
}

/**
 * Convert S2 paper to Citation format.
 */
export function s2ToCitation(paper: S2Paper): Citation {
  return {
    title: paper.title,
    authors: paper.authors.map(a => a.name),
    year: paper.year || null,
    doi: paper.externalIds?.DOI || null,
    arxiv_id: paper.externalIds?.ArXiv || null,
    venue: paper.venue || null,
    bibtex: generateS2Bibtex(paper),
  }
}

function generateS2Bibtex(paper: S2Paper): string {
  const authorStr = paper.authors.map(a => a.name).join(' and ')
  const year = paper.year || 2024
  const firstAuthor = paper.authors[0]?.name.split(' ').pop()?.toLowerCase() || 'unknown'
  const firstWord = paper.title.split(' ')[0]?.toLowerCase().replace(/[^a-z]/g, '') || ''
  const key = `${firstAuthor}${year}${firstWord}`

  const venue = paper.venue || (paper.externalIds?.ArXiv ? `arXiv:${paper.externalIds.ArXiv}` : 'Unknown')

  return `@article{${key},
  title   = {${paper.title}},
  author  = {${authorStr}},
  journal = {${venue}},
  year    = {${year}},
  url     = {${paper.url}},
}`
}
