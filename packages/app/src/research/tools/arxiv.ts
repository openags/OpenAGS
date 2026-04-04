/**
 * arXiv API Tool — search and fetch papers
 */

import { XMLParser } from 'fast-xml-parser'
import { Citation } from '../../schemas.js'

const ARXIV_API = 'https://export.arxiv.org/api/query'

export interface ArxivSearchOptions {
  query: string
  maxResults?: number
  sortBy?: 'relevance' | 'lastUpdatedDate' | 'submittedDate'
  sortOrder?: 'ascending' | 'descending'
}

export interface ArxivPaper {
  id: string
  title: string
  summary: string
  authors: string[]
  published: string
  updated: string
  categories: string[]
  pdfUrl: string
  absUrl: string
  doi?: string
}

/**
 * Search arXiv for papers.
 */
export async function searchArxiv(options: ArxivSearchOptions): Promise<ArxivPaper[]> {
  const { query, maxResults = 10, sortBy = 'relevance', sortOrder = 'descending' } = options

  const params = new URLSearchParams({
    search_query: query,
    start: '0',
    max_results: String(maxResults),
    sortBy,
    sortOrder,
  })

  const response = await fetch(`${ARXIV_API}?${params}`)
  if (!response.ok) {
    throw new Error(`arXiv API error: ${response.status}`)
  }

  const xml = await response.text()
  const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: '@_',
  })
  const result = parser.parse(xml)

  const entries = result.feed?.entry
  if (!entries) return []

  const papers: ArxivPaper[] = []
  const entryList = Array.isArray(entries) ? entries : [entries]

  for (const entry of entryList) {
    const id = extractArxivId(entry.id)
    const authors = Array.isArray(entry.author)
      ? entry.author.map((a: { name: string }) => a.name)
      : entry.author?.name ? [entry.author.name] : []

    const categories = Array.isArray(entry.category)
      ? entry.category.map((c: { '@_term': string }) => c['@_term'])
      : entry.category?.['@_term'] ? [entry.category['@_term']] : []

    // Find PDF and abs links
    let pdfUrl = ''
    let absUrl = ''
    const links = Array.isArray(entry.link) ? entry.link : [entry.link]
    for (const link of links) {
      if (link?.['@_type'] === 'application/pdf') {
        pdfUrl = link['@_href']
      } else if (link?.['@_rel'] === 'alternate') {
        absUrl = link['@_href']
      }
    }

    papers.push({
      id,
      title: cleanText(entry.title || ''),
      summary: cleanText(entry.summary || ''),
      authors,
      published: entry.published || '',
      updated: entry.updated || '',
      categories,
      pdfUrl: pdfUrl || `https://arxiv.org/pdf/${id}.pdf`,
      absUrl: absUrl || `https://arxiv.org/abs/${id}`,
      doi: entry['arxiv:doi']?.['#text'],
    })
  }

  return papers
}

/**
 * Get a single paper by arXiv ID.
 */
export async function getArxivPaper(arxivId: string): Promise<ArxivPaper | null> {
  const cleanId = arxivId.replace('arXiv:', '').trim()
  const results = await searchArxiv({ query: `id:${cleanId}`, maxResults: 1 })
  return results[0] || null
}

/**
 * Convert arXiv paper to Citation format.
 */
export function arxivToCitation(paper: ArxivPaper): Citation {
  const year = paper.published ? parseInt(paper.published.slice(0, 4), 10) : null

  return {
    title: paper.title,
    authors: paper.authors,
    year,
    arxiv_id: paper.id,
    doi: paper.doi || null,
    venue: 'arXiv',
    bibtex: generateArxivBibtex(paper),
  }
}

function extractArxivId(url: string): string {
  // Extract ID from URL like http://arxiv.org/abs/2301.12345v1
  const match = url.match(/(\d{4}\.\d{4,5})(v\d+)?$/)
  return match ? match[1] : url
}

function cleanText(text: string): string {
  return text.replace(/\s+/g, ' ').trim()
}

function generateArxivBibtex(paper: ArxivPaper): string {
  const authorStr = paper.authors.join(' and ')
  const year = paper.published ? paper.published.slice(0, 4) : '2024'
  const key = `${paper.authors[0]?.split(' ').pop()?.toLowerCase() || 'unknown'}${year}${paper.title.split(' ')[0]?.toLowerCase() || ''}`

  return `@article{${key},
  title   = {${paper.title}},
  author  = {${authorStr}},
  journal = {arXiv preprint arXiv:${paper.id}},
  year    = {${year}},
  url     = {${paper.absUrl}},
}`
}
