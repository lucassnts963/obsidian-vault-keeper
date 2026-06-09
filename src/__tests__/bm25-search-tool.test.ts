// @vitest-environment happy-dom

import { describe, it, expect, beforeAll, beforeEach, vi } from 'vitest'

const INDEX_PATH = '.vault-keeper/bm25-index.json'

function mockVault(indexJson?: object) {
  const files: Record<string, string> = {}
  if (indexJson) files[INDEX_PATH] = JSON.stringify(indexJson)
  const dirs: string[] = []
  return {
    files, dirs,
    adapter: {
      read:  vi.fn(async (p: string) => { if (files[p] !== undefined) return files[p]; throw new Error('ENOENT') }),
      write: vi.fn(async (p: string, c: string) => { files[p] = c }),
      exists: vi.fn(async (p: string) => files[p] !== undefined || dirs.includes(p)),
      mkdir:  vi.fn(async (p: string) => { dirs.push(p) }),
    },
  }
}

describe('bm25Search tool', () => {
  let tools: any

  beforeAll(async () => {
    tools = await import('../chat/tools')
  })

  // TEST-08
  it('returns ranked results from persisted index', async () => {
    const vault = mockVault({
      version: 1,
      entries: [
        { path: 'wiki/karpathy.md', title: 'Karpathy LLM Wiki', summary: 'Metodologia karpathy de wiki mantida por LLM', tags: ['karpathy', 'wiki'], key_entities: ['Karpathy'] },
        { path: 'wiki/bolo.md',     title: 'Receita de Bolo',   summary: 'Farinha açúcar ovos',                         tags: ['receita'],          key_entities: [] },
      ],
    })

    const result = await tools.bm25Search(vault, { query: 'karpathy wiki', topK: 3 })

    expect(result).toContain('wiki/karpathy.md')
    expect(result).toContain('Karpathy LLM Wiki')
    expect(result).not.toContain('Receita de Bolo')
  })

  // TEST-09
  it('returns empty-index message when no index JSON exists', async () => {
    const vault = mockVault()  // no index file
    const result = await tools.bm25Search(vault, { query: 'karpathy' })
    expect(result.toLowerCase()).toMatch(/empty|vazio|índice|index/)
  })

  // TEST-10
  it('returns no-results message when query matches nothing', async () => {
    const vault = mockVault({
      version: 1,
      entries: [
        { path: 'wiki/bolo.md', title: 'Bolo', summary: 'Receita de bolo', tags: ['receita'], key_entities: [] },
      ],
    })
    const result = await tools.bm25Search(vault, { query: 'agentes memória karpathy' })
    expect(result.toLowerCase()).toMatch(/no results|sem resultado|not found|nenhum/)
  })

  it('includes result count or ranking indicator', async () => {
    const vault = mockVault({
      version: 1,
      entries: [
        { path: 'wiki/a.md', title: 'Karpathy',  summary: 'Karpathy llm wiki', tags: ['k'], key_entities: [] },
        { path: 'wiki/b.md', title: 'Karpathy 2', summary: 'Outra nota karpathy', tags: ['k'], key_entities: [] },
      ],
    })
    const result = await tools.bm25Search(vault, { query: 'karpathy', topK: 2 })
    // Should contain at least one result reference
    expect(result).toContain('wiki/a.md')
  })
})

// TEST-11
describe('executeTool dispatches bm25_search', () => {
  let executeTool: any

  beforeAll(async () => {
    ({ executeTool } = await import('../chat/tools'))
  })

  it('executeTool handles bm25_search and returns a string', async () => {
    const vault = mockVault()  // empty index → returns message
    const result = await executeTool(vault, 'bm25_search', { query: 'test query' }, 'wiki/index.md')
    expect(typeof result).toBe('string')
    expect(result.length).toBeGreaterThan(0)
  })
})
