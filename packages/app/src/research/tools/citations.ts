/**
 * Citation Verification Tool — verify citation accuracy
 */

import { Citation, VerifyResult } from '../../schemas.js'
import { getArxivPaper, arxivToCitation } from './arxiv.js'
import { getS2PaperByDOI, s2ToCitation, searchSemanticScholar } from './semantic-scholar.js'

/**
 * Verify a citation by checking against arXiv and Semantic Scholar.
 */
export async function verifyCitation(citation: Citation): Promise<VerifyResult> {
  // Try to find the paper in databases
  let verified: Citation | null = null
  let confidence = 0
  let reason = ''

  // 1. Try DOI lookup (most reliable)
  if (citation.doi) {
    try {
      const paper = await getS2PaperByDOI(citation.doi)
      if (paper) {
        verified = s2ToCitation(paper)
        confidence = 0.95
        reason = 'Verified via DOI lookup in Semantic Scholar'
      }
    } catch {
      // Continue to next method
    }
  }

  // 2. Try arXiv ID lookup
  if (!verified && citation.arxiv_id) {
    try {
      const paper = await getArxivPaper(citation.arxiv_id)
      if (paper) {
        verified = arxivToCitation(paper)
        confidence = 0.9
        reason = 'Verified via arXiv ID lookup'
      }
    } catch {
      // Continue to next method
    }
  }

  // 3. Try title + author search
  if (!verified && citation.title) {
    try {
      const query = citation.title
      const results = await searchSemanticScholar({ query, limit: 5 })

      for (const paper of results) {
        const titleSimilarity = computeSimilarity(citation.title.toLowerCase(), paper.title.toLowerCase())
        if (titleSimilarity > 0.8) {
          // Check authors match
          const authorMatch = citation.authors.length === 0 ||
            citation.authors.some((a: string) =>
              paper.authors.some(pa =>
                pa.name.toLowerCase().includes(a.toLowerCase().split(' ').pop() || '')
              )
            )

          if (authorMatch) {
            verified = s2ToCitation(paper)
            confidence = titleSimilarity * 0.85
            reason = `Verified via title search (similarity: ${(titleSimilarity * 100).toFixed(0)}%)`
            break
          }
        }
      }
    } catch {
      // Search failed
    }
  }

  // Return result
  if (verified) {
    return {
      valid: true,
      confidence,
      reason,
      verified_citation: verified,
    }
  }

  return {
    valid: false,
    confidence: 0,
    reason: 'Could not verify citation against arXiv or Semantic Scholar',
    verified_citation: null,
  }
}

/**
 * Verify multiple citations in batch.
 */
export async function verifyCitations(citations: Citation[]): Promise<VerifyResult[]> {
  const results: VerifyResult[] = []

  for (const citation of citations) {
    // Add small delay between requests to avoid rate limiting
    if (results.length > 0) {
      await sleep(200)
    }
    const result = await verifyCitation(citation)
    results.push(result)
  }

  return results
}

/**
 * Extract citations from BibTeX string.
 */
export function parseBibtex(bibtex: string): Citation[] {
  const citations: Citation[] = []
  const entryRegex = /@(\w+)\s*\{([^,]+),([^}]+)\}/g

  let match
  while ((match = entryRegex.exec(bibtex)) !== null) {
    const fields = match[3]

    const title = extractField(fields, 'title')
    const authorField = extractField(fields, 'author')
    const yearField = extractField(fields, 'year')
    const doi = extractField(fields, 'doi')
    const journal = extractField(fields, 'journal')

    const authors = authorField
      ? authorField.split(/\s+and\s+/i).map(a => a.trim())
      : []

    const year = yearField ? parseInt(yearField, 10) : null

    // Check for arXiv ID in journal field or eprint
    let arxiv_id: string | null = null
    const eprint = extractField(fields, 'eprint')
    if (eprint && /\d{4}\.\d{4,5}/.test(eprint)) {
      arxiv_id = eprint
    } else if (journal && journal.toLowerCase().includes('arxiv')) {
      const arxivMatch = journal.match(/(\d{4}\.\d{4,5})/)
      if (arxivMatch) arxiv_id = arxivMatch[1]
    }

    if (title) {
      citations.push({
        title,
        authors,
        year: year && !isNaN(year) ? year : null,
        doi: doi || null,
        arxiv_id,
        venue: journal || null,
        bibtex: match[0],
      })
    }
  }

  return citations
}

function extractField(fields: string, name: string): string {
  const regex = new RegExp(`${name}\\s*=\\s*[{"]([^}"]+)[}"]`, 'i')
  const match = fields.match(regex)
  return match ? match[1].trim() : ''
}

function computeSimilarity(a: string, b: string): number {
  // Simple Jaccard similarity on word sets
  const setA = new Set(a.split(/\s+/).filter(w => w.length > 2))
  const setB = new Set(b.split(/\s+/).filter(w => w.length > 2))

  const intersection = new Set([...setA].filter(x => setB.has(x)))
  const union = new Set([...setA, ...setB])

  return union.size > 0 ? intersection.size / union.size : 0
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}
