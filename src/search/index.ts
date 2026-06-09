/**
 * Local semantic search engine for vault pages.
 * Pure TypeScript — zero dependencies, works on mobile WebView.
 *
 * Builds an in-memory index from all wiki/*.md files:
 *   - Extracts frontmatter (title, tags, category)
 *   - Extracts first meaningful paragraph as summary
 *   - Computes TF-IDF vectors for search
 *
 * Query flow: tokenize → TF-IDF cosine → ranked results → top K
 */

export interface PageDigest {
  path: string           // e.g., 'wiki/analise-he-13c-10b.md'
  title: string          // from frontmatter or filename
  tags: string[]         // from frontmatter
  category: string       // from frontmatter
  summary: string        // first paragraph (max 300 chars)
  wordCount: number      // total words in page
}

interface SearchResult extends PageDigest {
  score: number          // 0-1 relevance score
}

export class SearchEngine {
  private digests: PageDigest[] = []
  private idf: Map<string, number> = new Map()  // token → IDF score
  private built = false

  /** Build the search index from all wiki/*.md files */
  async build(vault: any, wikiPath: string): Promise<void> {
    this.digests = []
    this.idf.clear()
    this.built = false

    try {
      const list = await vault.adapter.list(wikiPath)
      const mdFiles: string[] = (list.files || [])
        .filter((f: string) => f.endsWith('.md'))

      // Phase 1: extract all digests
      const docs: { path: string; tokens: string[] }[] = []

      for (const file of mdFiles) {
        const path = `${wikiPath}/${file}`
        try {
          const raw = await vault.adapter.read(path)
          const digest = this.extractDigest(path, raw)
          this.digests.push(digest)

          // Tokenize for IDF computation
          const tokens = this.tokenize(digest.title + ' ' + digest.tags.join(' ') + ' ' + digest.summary)
          docs.push({ path, tokens })
        } catch {
          // Skip unreadable files
        }
      }

      // Phase 2: compute IDF
      const N = docs.length
      const df = new Map<string, number>()
      for (const doc of docs) {
        const seen = new Set(doc.tokens)
        for (const t of seen) {
          df.set(t, (df.get(t) || 0) + 1)
        }
      }
      for (const [token, count] of df) {
        this.idf.set(token, Math.log((N + 1) / (count + 1)) + 1)
      }

      this.built = true
    } catch {
      // Vault might not have wiki/ yet — graceful degradation
    }
  }

  /** Search vault pages by query. Returns top K results sorted by relevance. */
  search(query: string, topK = 5): SearchResult[] {
    if (!this.built || this.digests.length === 0) return []

    const queryTokens = this.tokenize(query)
    if (queryTokens.length === 0) return []

    // Compute TF-IDF for query
    const queryVec = this.computeTfIdf(queryTokens)

    // Score each document
    const scored: SearchResult[] = this.digests.map(d => {
      const docTokens = this.tokenize(d.title + ' ' + d.tags.join(' ') + ' ' + d.summary)
      const docVec = this.computeTfIdf(docTokens)
      const score = this.cosineSimilarity(queryVec, docVec)

      // Boost exact tag matches
      let tagBoost = 1.0
      for (const qt of queryTokens) {
        if (d.tags.some(t => t.toLowerCase().includes(qt))) {
          tagBoost = 1.5
          break
        }
      }

      // Boost title matches
      let titleBoost = 1.0
      const titleLower = d.title.toLowerCase()
      for (const qt of queryTokens) {
        if (titleLower.includes(qt)) {
          titleBoost = 2.0
          break
        }
      }

      return { ...d, score: score * tagBoost * titleBoost }
    })

    // Sort by score descending, return top K with score > 0
    return scored
      .filter(r => r.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, topK)
  }

  /** Get all digests (for read_index enhanced view) */
  getAll(): PageDigest[] {
    return this.digests
  }

  /** Check if index is ready */
  isReady(): boolean {
    return this.built
  }

  /** Number of indexed pages */
  get pageCount(): number {
    return this.digests.length
  }

  // ─── Private helpers ──────────────────────────────────────────

  /** Extract digest from a markdown page */
  private extractDigest(path: string, raw: string): PageDigest {
    let title = ''
    let tags: string[] = []
    let category = 'uncategorized'
    let summary = ''

    // Parse frontmatter
    if (raw.startsWith('---')) {
      const end = raw.indexOf('---', 3)
      if (end !== -1) {
        const fm = raw.substring(3, end)
        title = this.extractYamlField(fm, 'title') || ''
        const tagsStr = this.extractYamlField(fm, 'tags')
        if (tagsStr) {
          // Support both [tag1, tag2] and tag1, tag2
          tags = tagsStr
            .replace(/^\[|\]$/g, '')
            .split(',')
            .map(t => t.trim().replace(/"/g, '').replace(/'/g, ''))
            .filter(Boolean)
        }
        category = this.extractYamlField(fm, 'category') || 'uncategorized'
      }
    }

    // Fallback title from filename
    if (!title) {
      const fileName = path.split('/').pop() || path
      title = fileName.replace(/\.md$/, '').replace(/-/g, ' ')
    }

    // Extract first meaningful paragraph after frontmatter
    const bodyStart = raw.startsWith('---')
      ? raw.indexOf('---', 3) + 3
      : 0
    const body = raw.slice(bodyStart)

    // Skip heading lines (#, ##) and blank lines
    const paragraphs = body.split(/\n\n+/)
    for (const para of paragraphs) {
      const cleaned = para
        .replace(/^#+\s+.*$/gm, '')   // remove headings
        .replace(/\[\[([^\]]+)\]\]/g, '$1')  // strip wiki links
        .replace(/\*\*|__/g, '')      // strip bold
        .replace(/\*|_/g, '')         // strip italic
        .replace(/`[^`]*`/g, '')     // strip inline code
        .trim()
      if (cleaned.length > 30) {
        summary = cleaned.slice(0, 300)
        break
      }
    }

    // Word count
    const wordCount = body.split(/\s+/).filter(w => w.length > 1).length

    return { path, title, tags, category, summary, wordCount }
  }

  /** Extract a YAML field value from frontmatter string */
  private extractYamlField(fm: string, field: string): string | null {
    const regex = new RegExp(`^${field}:\\s*(.+)$`, 'm')
    const match = fm.match(regex)
    return match ? match[1].trim() : null
  }

  /** Tokenize text into lowercase word tokens (min 2 chars, Portuguese-aware) */
  private tokenize(text: string): string[] {
    return text
      .toLowerCase()
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '')  // strip accents
      .replace(/[^a-z0-9\s]/g, ' ')  // keep only alphanumeric
      .split(/\s+/)
      .filter(t => t.length >= 2)    // filter single chars (but keep numbers)
  }

  /** Compute TF-IDF vector for tokens */
  private computeTfIdf(tokens: string[]): Map<string, number> {
    // TF
    const tf = new Map<string, number>()
    for (const t of tokens) {
      tf.set(t, (tf.get(t) || 0) + 1)
    }
    // Normalize
    const norm = Math.sqrt([...tf.values()].reduce((s, v) => s + v * v, 0)) || 1

    // TF-IDF
    const vec = new Map<string, number>()
    for (const [token, count] of tf) {
      const idf = this.idf.get(token) || 0
      vec.set(token, (count / norm) * idf)
    }
    return vec
  }

  /** Cosine similarity between two sparse vectors */
  private cosineSimilarity(a: Map<string, number>, b: Map<string, number>): number {
    let dot = 0
    let normA = 0
    let normB = 0

    for (const [token, valA] of a) {
      normA += valA * valA
      const valB = b.get(token) || 0
      dot += valA * valB
    }
    for (const valB of b.values()) {
      normB += valB * valB
    }

    const denom = Math.sqrt(normA) * Math.sqrt(normB)
    return denom === 0 ? 0 : dot / denom
  }
}

/**
 * Format search results as a readable string for the LLM agent.
 * Each result includes title, relevance score, category, tags, and summary.
 */
export function formatSearchResults(results: SearchResult[]): string {
  if (results.length === 0) return 'No matching pages found.'

  const lines = [`Found ${results.length} relevant pages:`]
  for (let i = 0; i < results.length; i++) {
    const r = results[i]
    const pct = Math.round(r.score * 100)
    lines.push(`${i + 1}. [[${r.path.replace('.md', '')}|${r.title}]] (${pct}%) — ${r.category}`)
    if (r.tags.length > 0) lines.push(`   tags: ${r.tags.join(', ')}`)
    if (r.summary) lines.push(`   summary: ${r.summary.slice(0, 150)}`)
    lines.push('')
  }
  return lines.join('\n')
}
