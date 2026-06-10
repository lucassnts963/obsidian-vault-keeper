import { describe, it, expect, beforeEach, beforeAll, vi, afterEach } from 'vitest'

function mockAdapter(files: Record<string, string> = {}, dirs: string[] = []) {
  const store: Record<string, string> = { ...files }
  return {
    read:   vi.fn(async (p: string) => { if (store[p] !== undefined) return store[p]; throw new Error('ENOENT') }),
    write:  vi.fn(async (p: string, c: string) => { store[p] = c }),
    exists: vi.fn(async (p: string) => store[p] !== undefined || dirs.includes(p)),
    mkdir:  vi.fn(async () => {}),
    store,
  }
}

function mockVault(wikiFiles: Record<string, string> = {}) {
  const handlers: Map<string, ((file: any) => void)[]> = new Map()
  return {
    on: vi.fn((event: string, handler: (file: any) => void) => {
      if (!handlers.has(event)) handlers.set(event, [])
      handlers.get(event)!.push(handler)
      return { event, handler }
    }),
    emit: (event: string, file: any) => {
      const hs = handlers.get(event) || []
      for (const h of hs) h(file)
    },
    adapter: {
      read: vi.fn(async (p: string) => {
        if (wikiFiles[p] !== undefined) return wikiFiles[p]
        throw new Error('ENOENT')
      }),
    },
  }
}

function mockPlugin() {
  const registered: any[] = []
  return {
    registerEvent: vi.fn((event: any) => { registered.push(event) }),
    registered,
  }
}

describe('VaultIntegrityMonitor', () => {
  let VaultIntegrityMonitor: any
  let IndexPersistence: any

  beforeAll(async () => {
    ;({ VaultIntegrityMonitor } = await import('../agents/monitor'))
    ;({ IndexPersistence } = await import('../search/index-persistence'))
  })

  afterEach(() => { vi.clearAllMocks() })

  // T-11: monitor re-indexes wiki page on vault modify event
  it('re-indexes a wiki page when vault emits modify event', async () => {
    const adapter = mockAdapter()
    const persistence = new IndexPersistence(adapter)
    const upsertSpy = vi.spyOn(persistence, 'upsert')

    const wikiContent = '---\ntitle: Minha Página\nsummary: Resumo aqui\ntags: [tag1, tag2]\n---\n\nConteúdo.'
    const vault = mockVault({ 'wiki/minha-pagina.md': wikiContent })
    const plugin = mockPlugin()

    const monitor = new VaultIntegrityMonitor(vault, 'wiki', persistence, 0) // 0ms debounce for tests
    monitor.register(plugin)

    expect(plugin.registerEvent).toHaveBeenCalledTimes(2)

    vault.emit('modify', { path: 'wiki/minha-pagina.md' })

    // Wait for async reindex
    await new Promise(r => setTimeout(r, 20))

    expect(upsertSpy).toHaveBeenCalledWith(expect.objectContaining({
      path: 'wiki/minha-pagina.md',
      title: 'Minha Página',
      summary: 'Resumo aqui',
    }))
  })

  it('re-indexes on create event too', async () => {
    const adapter = mockAdapter()
    const persistence = new IndexPersistence(adapter)
    const upsertSpy = vi.spyOn(persistence, 'upsert')

    const vault = mockVault({ 'wiki/nova.md': '---\ntitle: Nova\n---\n\nTexto.' })
    const plugin = mockPlugin()

    const monitor = new VaultIntegrityMonitor(vault, 'wiki', persistence, 0)
    monitor.register(plugin)

    vault.emit('create', { path: 'wiki/nova.md' })
    await new Promise(r => setTimeout(r, 20))

    expect(upsertSpy).toHaveBeenCalledWith(expect.objectContaining({ path: 'wiki/nova.md', title: 'Nova' }))
  })

  // T-12: monitor debounces rapid writes
  it('debounces rapid writes — single upsert for multiple events', async () => {
    const adapter = mockAdapter()
    const persistence = new IndexPersistence(adapter)
    const upsertSpy = vi.spyOn(persistence, 'upsert')

    const vault = mockVault({ 'wiki/artigo.md': '---\ntitle: Artigo\n---\n\nTexto.' })
    const plugin = mockPlugin()

    const monitor = new VaultIntegrityMonitor(vault, 'wiki', persistence, 50) // 50ms debounce
    monitor.register(plugin)

    // Fire 5 rapid events
    for (let i = 0; i < 5; i++) {
      vault.emit('modify', { path: 'wiki/artigo.md' })
    }

    await new Promise(r => setTimeout(r, 100))

    expect(upsertSpy).toHaveBeenCalledTimes(1)
  })

  // T-13: monitor ignores non-wiki paths
  it('ignores files outside the wiki path', async () => {
    const adapter = mockAdapter()
    const persistence = new IndexPersistence(adapter)
    const upsertSpy = vi.spyOn(persistence, 'upsert')

    const vault = mockVault({ 'inbox/rascunho.md': '# Rascunho', 'raw/nota.md': '# Nota' })
    const plugin = mockPlugin()

    const monitor = new VaultIntegrityMonitor(vault, 'wiki', persistence, 0)
    monitor.register(plugin)

    vault.emit('modify', { path: 'inbox/rascunho.md' })
    vault.emit('modify', { path: 'raw/nota.md' })
    vault.emit('modify', { path: 'settings.json' })

    await new Promise(r => setTimeout(r, 20))

    expect(upsertSpy).not.toHaveBeenCalled()
  })

  it('ignores non-.md files in wiki path', async () => {
    const adapter = mockAdapter()
    const persistence = new IndexPersistence(adapter)
    const upsertSpy = vi.spyOn(persistence, 'upsert')

    const vault = mockVault({})
    const plugin = mockPlugin()

    const monitor = new VaultIntegrityMonitor(vault, 'wiki', persistence, 0)
    monitor.register(plugin)

    vault.emit('modify', { path: 'wiki/imagem.png' })
    await new Promise(r => setTimeout(r, 20))

    expect(upsertSpy).not.toHaveBeenCalled()
  })

  it('extracts tags array from frontmatter correctly', async () => {
    const adapter = mockAdapter()
    const persistence = new IndexPersistence(adapter)
    const upsertSpy = vi.spyOn(persistence, 'upsert')

    const content = '---\ntitle: T\ntags: [ia, machine-learning, nlp]\nkey_entities: [BERT, GPT]\n---\n\nCorpo.'
    const vault = mockVault({ 'wiki/t.md': content })
    const plugin = mockPlugin()

    const monitor = new VaultIntegrityMonitor(vault, 'wiki', persistence, 0)
    monitor.register(plugin)

    vault.emit('modify', { path: 'wiki/t.md' })
    await new Promise(r => setTimeout(r, 20))

    expect(upsertSpy).toHaveBeenCalledWith(expect.objectContaining({
      tags: ['ia', 'machine-learning', 'nlp'],
      key_entities: ['BERT', 'GPT'],
    }))
  })

  it('falls back to filename as title when frontmatter title is missing', async () => {
    const adapter = mockAdapter()
    const persistence = new IndexPersistence(adapter)
    const upsertSpy = vi.spyOn(persistence, 'upsert')

    const vault = mockVault({ 'wiki/sem-titulo.md': '# Conteúdo sem frontmatter' })
    const plugin = mockPlugin()

    const monitor = new VaultIntegrityMonitor(vault, 'wiki', persistence, 0)
    monitor.register(plugin)

    vault.emit('modify', { path: 'wiki/sem-titulo.md' })
    await new Promise(r => setTimeout(r, 20))

    expect(upsertSpy).toHaveBeenCalledWith(expect.objectContaining({ title: 'sem-titulo' }))
  })
})
