/**
 * Pure-TypeScript Okapi BM25 ranking. No external deps, no I/O — runs identically
 * on Electron desktop and Android WebView. The search module never imports `obsidian`.
 */

export interface BM25Doc {
  id: string
  text: string
}

export interface BM25Result {
  id: string
  score: number
}

/** Lowercase, strip accents (NFD), keep word chars, drop tokens of length <= 2. */
export function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9\s]+/g, ' ')
    .split(/\s+/)
    .filter(t => t.length > 2)
}

interface IndexedDoc {
  id: string
  len: number
  tf: Map<string, number>
}

export class BM25Index {
  private readonly k1: number
  private readonly b: number
  private docs: IndexedDoc[] = []
  private df = new Map<string, number>()
  private avgdl = 0

  constructor(opts: { k1?: number; b?: number } = {}) {
    this.k1 = opts.k1 ?? 1.5
    this.b = opts.b ?? 0.75
  }

  /** (Re)build the index from a document set. */
  index(docs: BM25Doc[]): void {
    this.docs = []
    this.df = new Map()
    let totalLen = 0

    for (const d of docs) {
      const tokens = tokenize(d.text)
      const tf = new Map<string, number>()
      for (const t of tokens) tf.set(t, (tf.get(t) ?? 0) + 1)
      for (const t of tf.keys()) this.df.set(t, (this.df.get(t) ?? 0) + 1)
      this.docs.push({ id: d.id, len: tokens.length, tf })
      totalLen += tokens.length
    }

    this.avgdl = this.docs.length ? totalLen / this.docs.length : 0
  }

  /** Probabilistic IDF, always >= 0 (the +1 keeps rare terms from going negative). */
  private idf(term: string): number {
    const n = this.docs.length
    const df = this.df.get(term) ?? 0
    return Math.log(1 + (n - df + 0.5) / (df + 0.5))
  }

  /** BM25 score of one indexed document against the query. */
  score(query: string, docIndex: number): number {
    const doc = this.docs[docIndex]
    if (!doc || this.avgdl === 0) return 0

    const terms = new Set(tokenize(query))
    let sum = 0
    for (const t of terms) {
      const f = doc.tf.get(t) ?? 0
      if (f === 0) continue
      const num = f * (this.k1 + 1)
      const den = f + this.k1 * (1 - this.b + this.b * (doc.len / this.avgdl))
      sum += this.idf(t) * (num / den)
    }
    return sum
  }

  /** Top-K documents by score (descending). Documents scoring 0 are excluded. */
  search(query: string, topK = 5): BM25Result[] {
    const results: BM25Result[] = []
    for (let i = 0; i < this.docs.length; i++) {
      const score = this.score(query, i)
      if (score > 0) results.push({ id: this.docs[i].id, score })
    }
    results.sort((a, b) => b.score - a.score)
    return results.slice(0, topK)
  }

  get size(): number {
    return this.docs.length
  }
}
