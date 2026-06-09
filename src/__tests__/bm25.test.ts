import { describe, it, expect, beforeAll } from 'vitest'
import { readFileSync } from 'fs'
import { resolve } from 'path'

describe('tokenize', () => {
  let tokenize: any

  beforeAll(async () => {
    ({ tokenize } = await import('../search/bm25'))
  })

  // TEST-04
  it('normalizes case and accents and drops tokens of length <= 2', () => {
    const tokens = tokenize('Memória de Agentes AI')
    // "Memória" -> "memoria" (accent stripped, lowercased)
    expect(tokens).toContain('memoria')
    expect(tokens).toContain('agentes')
    // "de" (len 2) and "AI" -> "ai" (len 2) are dropped
    expect(tokens).not.toContain('de')
    expect(tokens).not.toContain('ai')
  })

  it('matches accented and unaccented forms identically', () => {
    expect(tokenize('memória')).toEqual(tokenize('memoria'))
  })
})

describe('BM25Index', () => {
  let BM25Index: any

  beforeAll(async () => {
    ({ BM25Index } = await import('../search/bm25'))
  })

  // TEST-01
  it('indexes documents and returns known ids on search', () => {
    const idx = new BM25Index()
    idx.index([
      { id: 'a', text: 'karpathy llm wiki methodology' },
      { id: 'b', text: 'completely unrelated cooking recipes' },
    ])
    expect(idx.size).toBe(2)
    const results = idx.search('karpathy wiki', 5)
    expect(results.length).toBeGreaterThan(0)
    expect(results[0].id).toBe('a')
    expect(results[0].score).toBeGreaterThan(0)
  })

  // TEST-02
  it('respects topK limit', () => {
    const idx = new BM25Index()
    idx.index([
      { id: 'a', text: 'agent memory karpathy' },
      { id: 'b', text: 'agent memory wiki' },
      { id: 'c', text: 'agent memory methodology' },
    ])
    const results = idx.search('agent memory', 2)
    expect(results.length).toBe(2)
  })

  // TEST-03
  it('ranks a dense document above a passing mention', () => {
    const idx = new BM25Index()
    idx.index([
      { id: 'dense', text: 'karpathy wiki karpathy wiki karpathy wiki knowledge base synthesis cross linking' },
      { id: 'passing', text: 'this note is about cooking but mentions karpathy once near the end somewhere' },
    ])
    const results = idx.search('karpathy wiki', 5)
    expect(results[0].id).toBe('dense')
  })

  // TEST-05
  it('excludes documents with score 0 (no query term present)', () => {
    const idx = new BM25Index()
    idx.index([
      { id: 'relevant', text: 'agent memory karpathy methodology' },
      { id: 'recipes', text: 'flour sugar butter eggs oven baking cake' },
    ])
    const results = idx.search('agent memory', 5)
    expect(results.some((r: any) => r.id === 'recipes')).toBe(false)
    expect(results.every((r: any) => r.score > 0)).toBe(true)
  })

  // TEST-06
  it('does not unfairly penalize a short focused doc via length normalization', () => {
    const idx = new BM25Index()
    const longDiffuse = 'lorem ipsum '.repeat(80) + 'embeddings ' + 'dolor sit amet '.repeat(80)
    idx.index([
      { id: 'short', text: 'embeddings explained clearly' },
      { id: 'long', text: longDiffuse },
    ])
    const results = idx.search('embeddings', 5)
    expect(results[0].id).toBe('short')
  })

  it('returns empty array when there are no documents', () => {
    const idx = new BM25Index()
    idx.index([])
    expect(idx.search('anything', 5)).toEqual([])
  })

  it('returns empty array when query has no usable tokens', () => {
    const idx = new BM25Index()
    idx.index([{ id: 'a', text: 'agent memory karpathy' }])
    expect(idx.search('a an de', 5)).toEqual([])
  })
})

// TEST-12
describe('search module purity', () => {
  it('does not import obsidian or perform I/O', () => {
    const files = ['../search/bm25.ts', '../search/index-builder.ts']
    for (const rel of files) {
      const src = readFileSync(resolve(__dirname, rel), 'utf-8')
      expect(src).not.toMatch(/from\s+['"]obsidian['"]/)
      expect(src).not.toMatch(/require\(['"]obsidian['"]\)/)
      expect(src).not.toMatch(/from\s+['"]fs['"]/)
    }
  })
})
