// @vitest-environment happy-dom

import { describe, it, expect, vi, beforeEach, beforeAll } from 'vitest'

function mockVault() {
  const files: Record<string, string> = {}
  const dirs: string[] = []
  return {
    files, dirs,
    adapter: {
      read:  vi.fn(async (p: string) => { if (files[p] !== undefined) return files[p]; throw new Error('ENOENT') }),
      write: vi.fn(async (p: string, c: string) => { files[p] = c }),
      exists: vi.fn(async (p: string) => files[p] !== undefined || dirs.includes(p)),
      list:  vi.fn(async (_d: string) => {
        const prefix = _d === '/' ? '' : `${_d}/`
        const f = Object.keys(files).filter(k => k.startsWith(prefix) && !k.includes('/', prefix.length)).map(k => k.replace(prefix, ''))
        return { files: f, folders: [] }
      }),
      mkdir: vi.fn(async (p: string) => { dirs.push(p) }),
    },
  }
}

function settings() {
  return { wikiPath: 'wiki', inboxPath: 'inbox', rawPath: 'raw', indexPath: 'wiki/index.md', logPath: 'wiki/log.md' }
}

const INDEX_PATH = '.vault-keeper/bm25-index.json'

describe('WikiOps.gatherContext — fast path', () => {
  let WikiOps: any
  let vault: ReturnType<typeof mockVault>
  let s: ReturnType<typeof settings>

  beforeAll(async () => {
    ({ WikiOps } = await import('../wiki/ops'))
  })

  beforeEach(() => {
    vault = mockVault()
    s = settings()
  })

  // TEST-10 — discriminant: with a persisted index the irrelevant pages must NOT be read.
  // The 3 noise pages are inserted first so the old O(N) path would touch them.
  it('fast path: only reads top-K pages, skips non-relevant ones entirely', async () => {
    // Persisted index JSON (already built; gatherContext should use this, not scan files)
    vault.files[INDEX_PATH] = JSON.stringify({
      version: 1,
      entries: [
        { path: 'wiki/noise1.md', title: 'Bolos',   summary: 'Receita de bolo',       tags: ['receita'],  key_entities: [] },
        { path: 'wiki/noise2.md', title: 'Clima',   summary: 'Previsão do tempo',      tags: ['tempo'],    key_entities: [] },
        { path: 'wiki/noise3.md', title: 'Futebol', summary: 'Campeonato de futebol',  tags: ['esporte'],  key_entities: [] },
        { path: 'wiki/rel1.md',   title: 'Karpathy LLM Wiki', summary: 'Metodologia karpathy wiki para conhecimento', tags: ['karpathy', 'wiki'], key_entities: ['Karpathy'] },
        { path: 'wiki/rel2.md',   title: 'Agentes e Memória', summary: 'Memória de agentes LLM karpathy', tags: ['agentes'], key_entities: ['LLM'] },
      ],
    })

    // The actual wiki pages exist on disk so traversal can load them
    vault.files['wiki/index.md'] = '| Página |\n|---|\n| [[wiki/rel1|Karpathy]] |'
    vault.files['wiki/noise1.md'] = '---\ntitle: "Bolos"\ntags: [receita]\n---\nReceita de bolo farinha ovos.'
    vault.files['wiki/noise2.md'] = '---\ntitle: "Clima"\ntags: [tempo]\n---\nPrevisão chuva sol.'
    vault.files['wiki/noise3.md'] = '---\ntitle: "Futebol"\ntags: [esporte]\n---\nCampeonato gol time.'
    vault.files['wiki/rel1.md']   = '---\ntitle: "Karpathy LLM Wiki"\ntags: [karpathy,wiki]\n---\nMetodologia karpathy.'
    vault.files['wiki/rel2.md']   = '---\ntitle: "Agentes e Memória"\ntags: [agentes]\n---\nMemória de agentes.'

    const ops = new WikiOps(vault as any, s)
    const ctx = await ops.gatherContext('karpathy wiki', 2)

    // The two relevant pages must be in the context
    expect(ctx).toContain('rel1.md')
    expect(ctx).toContain('rel2.md')

    // The noise pages must NOT have been read (fast path skips them entirely)
    const readPaths: string[] = vault.adapter.read.mock.calls.map((c: any[]) => c[0])
    expect(readPaths).not.toContain('wiki/noise1.md')
    expect(readPaths).not.toContain('wiki/noise2.md')
    expect(readPaths).not.toContain('wiki/noise3.md')
  })

  // TEST-11 — fallback: no index JSON → scan all files, still works correctly.
  it('fallback: scans all wiki files when no index JSON exists', async () => {
    vault.files['wiki/index.md'] = '| Página |\n|---|\n| items |'
    vault.files['wiki/karpathy.md'] = '---\ntitle: "Karpathy"\ntags: [karpathy]\n---\nKarpathy karpathy wiki metodologia.'
    vault.files['wiki/recipes.md']  = '---\ntitle: "Receitas"\ntags: [receita]\n---\nFarinha açúcar ovos bolo.'

    const ops = new WikiOps(vault as any, s)
    const ctx = await ops.gatherContext('karpathy wiki', 1)

    expect(ctx).toContain('karpathy.md')
    expect(ctx).not.toContain('recipes.md')

    // All wiki pages were scanned (fallback O(N) path)
    const readPaths: string[] = vault.adapter.read.mock.calls.map((c: any[]) => c[0])
    expect(readPaths).toContain('wiki/karpathy.md')
    expect(readPaths).toContain('wiki/recipes.md')
  })
})
