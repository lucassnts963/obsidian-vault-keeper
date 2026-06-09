// @vitest-environment happy-dom

import { describe, it, expect, vi, beforeEach, beforeAll } from 'vitest'

/** Full mock vault matching wiki-ops.test.ts style */
function mockVault() {
  const files: Record<string, string> = {}
  const dirs: string[] = []
  return {
    files, dirs,
    adapter: {
      read:  vi.fn(async (p: string) => { if (files[p] !== undefined) return files[p]; throw new Error('ENOENT') }),
      write: vi.fn(async (p: string, c: string) => { files[p] = c }),
      exists: vi.fn(async (p: string) => files[p] !== undefined || dirs.includes(p)),
      list:  vi.fn(async (_d: string) => ({ files: [], folders: [] })),
      mkdir: vi.fn(async (p: string) => { dirs.push(p) }),
    },
    read:   vi.fn(async (file: any) => { const p = typeof file === 'string' ? file : file.path; if (files[p] !== undefined) return files[p]; throw new Error('ENOENT') }),
    create: vi.fn(async (p: string, c: string) => { files[p] = c; const d = p.split('/').slice(0, -1).join('/'); if (d && !dirs.includes(d)) dirs.push(d) }),
    delete: vi.fn(async (f: any) => { const p = typeof f === 'string' ? f : f.path; delete files[p] }),
    modify: vi.fn(async (f: any, c: string) => { const p = typeof f === 'string' ? f : f.path; files[p] = c }),
  }
}

function settings() {
  return { wikiPath: 'wiki', inboxPath: 'inbox', rawPath: 'raw', indexPath: 'wiki/index.md', logPath: 'wiki/log.md' }
}

describe('ingestFile — rich frontmatter', () => {
  let WikiOps: any
  let vault: ReturnType<typeof mockVault>
  let s: ReturnType<typeof settings>

  beforeAll(async () => {
    ({ WikiOps } = await import('../wiki/ops'))
  })

  beforeEach(() => {
    vault = mockVault()
    s = settings()
    vault.files['raw/source.md'] = '# Source\n\nConteúdo da fonte aqui.'
  })

  const llmWithRich = () => ({
    chat: vi.fn().mockResolvedValue(JSON.stringify({
      title: 'Página Rica',
      category: 'conceito',
      tags: ['karpathy', 'memoria'],
      summary: 'Resumo gerado pelo LLM sobre o tema.',
      key_entities: ['Karpathy', 'LLM Wiki'],
      content: 'Conteúdo markdown da wiki page.',
      links: [],
    })),
  })

  // TEST-06
  it('frontmatter includes summary field', async () => {
    const ops = new WikiOps(vault as any, s)
    await ops.ingestFile({ path: 'raw/source.md' }, llmWithRich())

    const created = vault.files['wiki/pagina-rica.md']
    expect(created).toBeDefined()
    expect(created).toMatch(/^summary:/m)
    expect(created).toContain('Resumo gerado pelo LLM')
  })

  // TEST-07
  it('frontmatter includes key_entities field', async () => {
    const ops = new WikiOps(vault as any, s)
    await ops.ingestFile({ path: 'raw/source.md' }, llmWithRich())

    const created = vault.files['wiki/pagina-rica.md']
    expect(created).toMatch(/^key_entities:/m)
    expect(created).toContain('Karpathy')
  })

  it('omits summary field when LLM returns empty string', async () => {
    const llm = { chat: vi.fn().mockResolvedValue(JSON.stringify({
      title: 'Sem Summary', category: 'cat', tags: [], summary: '', key_entities: [], content: 'body', links: [],
    })) }
    const ops = new WikiOps(vault as any, s)
    await ops.ingestFile({ path: 'raw/source.md' }, llm)

    const created = vault.files['wiki/sem-summary.md']
    expect(created).not.toMatch(/^summary:/m)
  })

  it('omits key_entities field when LLM returns empty array', async () => {
    const llm = { chat: vi.fn().mockResolvedValue(JSON.stringify({
      title: 'Sem Entidades', category: 'cat', tags: [], summary: '', key_entities: [], content: 'body', links: [],
    })) }
    const ops = new WikiOps(vault as any, s)
    await ops.ingestFile({ path: 'raw/source.md' }, llm)

    const created = vault.files['wiki/sem-entidades.md']
    expect(created).not.toMatch(/^key_entities:/m)
  })

  // TEST-08
  it('ingestFile upserts the index JSON after creating the page', async () => {
    const ops = new WikiOps(vault as any, s)
    await ops.ingestFile({ path: 'raw/source.md' }, llmWithRich())

    const indexJson = vault.files['.vault-keeper/bm25-index.json']
    expect(indexJson).toBeDefined()
    const parsed = JSON.parse(indexJson)
    expect(parsed.entries).toHaveLength(1)
    expect(parsed.entries[0].path).toBe('wiki/pagina-rica.md')
    expect(parsed.entries[0].summary).toContain('Resumo')
    expect(parsed.entries[0].key_entities).toContain('Karpathy')
  })
})

describe('writePage — index JSON', () => {
  let WikiOps: any
  let vault: ReturnType<typeof mockVault>

  beforeAll(async () => {
    ({ WikiOps } = await import('../wiki/ops'))
  })

  beforeEach(() => {
    vault = mockVault()
  })

  // TEST-09
  it('writePage upserts the index JSON after creating the page', async () => {
    const ops = new WikiOps(vault as any, settings())
    await ops.writePage('Nova Página', 'Conteúdo.', ['tag1'], 'conceito')

    const indexJson = vault.files['.vault-keeper/bm25-index.json']
    expect(indexJson).toBeDefined()
    const parsed = JSON.parse(indexJson)
    expect(parsed.entries).toHaveLength(1)
    expect(parsed.entries[0].title).toBe('Nova Página')
    expect(parsed.entries[0].tags).toContain('tag1')
  })
})
