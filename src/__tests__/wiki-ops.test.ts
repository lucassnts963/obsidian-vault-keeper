// @vitest-environment happy-dom

import { describe, it, expect, vi, beforeEach, beforeAll } from 'vitest'

function mockVault() {
  const files: Record<string, string> = {}
  const binFiles: Record<string, ArrayBuffer> = {}
  const dirs: string[] = []

  return {
    files,
    binFiles,
    dirs,
    adapter: {
      read: vi.fn(async (path: string) => {
        if (files[path] !== undefined) return files[path]
        throw new Error('ENOENT')
      }),
      write: vi.fn(async (path: string, content: string) => {
        files[path] = content
      }),
      exists: vi.fn(async (path: string) => {
        return files[path] !== undefined || dirs.includes(path)
      }),
      list: vi.fn(async (_dir: string) => {
        const prefix = _dir === '/' ? '' : `${_dir}/`
        const f = Object.keys(files)
          .filter(k => k.startsWith(prefix) && !k.includes('/', prefix.length))
          .map(k => k.replace(prefix, ''))
        const d = dirs
          .filter(k => k.startsWith(prefix) && k !== prefix && !k.includes('/', prefix.length))
          .map(k => k.replace(prefix, ''))
        return { files: f, folders: d }
      }),
      mkdir: vi.fn(async (_p: string) => { dirs.push(_p) }),
      readBinary: vi.fn(async (path: string) => {
        if (binFiles[path]) return binFiles[path]
        const content = files[path]
        if (content !== undefined) return new TextEncoder().encode(content).buffer
        throw new Error('ENOENT')
      }),
      stat: vi.fn(async (_p: string) => ({ mtime: Date.now(), size: 0 })),
      remove: vi.fn(async (path: string) => { delete files[path]; delete binFiles[path] }),
    },
    read: vi.fn(async (file: any) => {
      const path = typeof file === 'string' ? file : file.path
      if (files[path] !== undefined) return files[path]
      throw new Error('ENOENT')
    }),
    create: vi.fn(async (path: string, content: string) => {
      files[path] = content
      const p = path.split('/').slice(0, -1).join('/')
      if (p && !dirs.includes(p)) dirs.push(p)
    }),
    delete: vi.fn(async (file: any) => {
      const path = typeof file === 'string' ? file : file.path
      delete files[path]
      delete binFiles[path]
    }),
    rename: vi.fn(async (file: any, newPath: string) => {
      const oldPath = typeof file === 'string' ? file : file.path
      files[newPath] = files[oldPath]
      delete files[oldPath]
    }),
    modify: vi.fn(async (file: any, content: string) => {
      const path = typeof file === 'string' ? file : file.path
      files[path] = content
    }),
  }
}

function settings() {
  return {
    wikiPath: 'wiki',
    inboxPath: 'inbox',
    rawPath: 'raw',
    indexPath: 'wiki/index.md',
    logPath: 'wiki/log.md',
  }
}

describe('WikiOps', () => {
  let WikiOps: any
  let vault: ReturnType<typeof mockVault>
  let s: ReturnType<typeof settings>

  beforeAll(async () => {
    const mod = await import('../wiki/ops')
    WikiOps = mod.WikiOps
  })

  beforeEach(() => {
    vault = mockVault()
    s = settings()
  })

  describe('approve', () => {
    it('moves file from inbox to raw with status approved', async () => {
      vault.files['inbox/nota.md'] = '---\ntitle: Nota\n---\n\nconteudo'

      const ops = new WikiOps(vault as any, s)
      await ops.approve({ path: 'inbox/nota.md' })

      expect(vault.files['inbox/nota.md']).toBeUndefined()
      expect(vault.files['raw/nota.md']).toBeDefined()
      expect(vault.files['raw/nota.md']).toContain('status: approved')
    })

    it('updates existing status frontmatter', async () => {
      vault.files['inbox/teste.md'] = '---\ntitle: Teste\nstatus: inbox\n---\n\nconteudo'

      const ops = new WikiOps(vault as any, s)
      await ops.approve({ path: 'inbox/teste.md' })

      expect(vault.files['raw/teste.md']).toContain('status: approved')
      expect(vault.files['raw/teste.md']).not.toContain('status: inbox')
    })

    it('adds frontmatter to file without one', async () => {
      vault.files['inbox/sem-frontmatter.md'] = 'conteudo puro sem frontmatter'

      const ops = new WikiOps(vault as any, s)
      await ops.approve({ path: 'inbox/sem-frontmatter.md' })

      expect(vault.files['raw/sem-frontmatter.md']).toContain('---')
      expect(vault.files['raw/sem-frontmatter.md']).toContain('status: approved')
    })

    it('uses adapter.remove — works with fake TFile (no real vault.delete needed)', async () => {
      vault.files['inbox/nota.md'] = '---\ntitle: Nota\n---\n\nconteudo'

      const ops = new WikiOps(vault as any, s)
      await ops.approve({ path: 'inbox/nota.md' })

      expect(vault.adapter.remove).toHaveBeenCalledWith('inbox/nota.md')
      expect(vault.delete).not.toHaveBeenCalled()
    })

    it('moves project inbox file to project raw (not vault root raw)', async () => {
      vault.files['projects/alpha/inbox/nota.md'] = '---\ntitle: Nota\nstatus: inbox\n---\n\nconteudo do projeto'

      const ops = new WikiOps(vault as any, s)
      await ops.approve({ path: 'projects/alpha/inbox/nota.md' })

      expect(vault.files['projects/alpha/inbox/nota.md']).toBeUndefined()
      expect(vault.files['projects/alpha/raw/nota.md']).toBeDefined()
      expect(vault.files['projects/alpha/raw/nota.md']).toContain('status: approved')
      // must NOT land in vault root raw/
      expect(vault.files['raw/nota.md']).toBeUndefined()
      expect(vault.adapter.mkdir).toHaveBeenCalledWith('projects/alpha/raw')
    })
  })

  describe('reject', () => {
    it('sets status to rejected without moving', async () => {
      vault.files['inbox/lixo.md'] = '---\ntitle: Lixo\n---\n\nconteudo'

      const ops = new WikiOps(vault as any, s)
      await ops.reject({ path: 'inbox/lixo.md' })

      expect(vault.files['inbox/lixo.md']).toBeDefined()
      expect(vault.files['inbox/lixo.md']).toContain('status: rejected')
      expect(vault.files['raw/lixo.md']).toBeUndefined()
    })

    it('adds frontmatter if file has none', async () => {
      vault.files['inbox/sem-ft.md'] = 'apenas conteudo'

      const ops = new WikiOps(vault as any, s)
      await ops.reject({ path: 'inbox/sem-ft.md' })

      expect(vault.files['inbox/sem-ft.md']).toContain('status: rejected')
    })
  })

  describe('gatherContext', () => {
    it('returns index content as context', async () => {
      vault.files['wiki/index.md'] = '| Pagina | Categoria | Tags |\n|--------|-----------|------|\n| [[wiki/p1\|P1]] | cat | t1 |'

      const ops = new WikiOps(vault as any, s)
      const ctx = await ops.gatherContext('pergunta')

      expect(ctx).toContain('Pagina')
      expect(ctx).toContain('wiki/p1')
    })

    it('returns empty string when index does not exist', async () => {
      const ops = new WikiOps(vault as any, s)
      const ctx = await ops.gatherContext('pergunta')

      expect(ctx).toBe('')
    })
  })

  describe('ingestFile validation', () => {
    it('handles invalid JSON gracefully', async () => {
      vault.files['raw/fonte.md'] = 'conteudo fonte'

      const llm = { chat: vi.fn().mockResolvedValue('invalid json response') }
      const ops = new WikiOps(vault as any, s)

      await expect(
        ops.ingestFile({ path: 'raw/fonte.md' }, llm)
      ).rejects.toThrow(/json/i)
    })

    it('validates required fields in LLM response', async () => {
      vault.files['raw/fonte.md'] = 'conteudo fonte'

      const llm = {
        chat: vi.fn().mockResolvedValue(
          JSON.stringify({ title: 'Titulo' })
        ),
      }
      const ops = new WikiOps(vault as any, s)

      await expect(
        ops.ingestFile({ path: 'raw/fonte.md' }, llm)
      ).rejects.toThrow()
    })

    it('detects duplicate wiki page before creating', async () => {
      vault.files['raw/fonte.md'] = 'conteudo fonte'
      vault.files['wiki/titulo.md'] = 'existente'

      const llm = {
        chat: vi.fn().mockResolvedValue(
          JSON.stringify({ title: 'Titulo', category: 'cat', tags: ['t'], summary: 's', content: 'c', links: [] })
        ),
      }
      const ops = new WikiOps(vault as any, s)

      await expect(
        ops.ingestFile({ path: 'raw/fonte.md' }, llm)
      ).rejects.toThrow(/existe|duplicad|já exist/i)
    })

    it('T-01: project source → writes to project wiki and project index', async () => {
      vault.files['projects/alpha/raw/nota.md'] = 'conteudo do projeto'

      const llm = {
        chat: vi.fn().mockResolvedValue(
          JSON.stringify({ title: 'Reunião Alpha', category: 'meeting', tags: ['alpha'], summary: 's', content: 'c', links: [] })
        ),
      }
      const ops = new WikiOps(vault as any, s)

      await ops.ingestFile({ path: 'projects/alpha/raw/nota.md' }, llm)

      expect(vault.files['projects/alpha/wiki/reuniao-alpha.md']).toBeDefined()
      expect(vault.files['projects/alpha/wiki/index.md']).toContain('wiki/reuniao-alpha')
      expect(vault.files['wiki/reuniao-alpha.md']).toBeUndefined()
    })

    it('T-02: root source without focus → writes to root wiki, no prefix', async () => {
      vault.files['raw/nota.md'] = 'nota raiz'

      const llm = {
        chat: vi.fn().mockResolvedValue(
          JSON.stringify({ title: 'Nota Raiz', category: 'general', tags: [], summary: 's', content: 'c', links: [] })
        ),
      }
      const ops = new WikiOps(vault as any, s)

      await ops.ingestFile({ path: 'raw/nota.md' }, llm, undefined)

      expect(vault.files['wiki/nota-raiz.md']).toBeDefined()
      expect(vault.files['wiki/index.md']).toContain('wiki/nota-raiz')
    })

    it('T-03: root source with focused project → slug prefixed with project name', async () => {
      vault.files['raw/nota.md'] = 'nota sobre montisol'

      const llm = {
        chat: vi.fn().mockResolvedValue(
          JSON.stringify({ title: 'Timeline', category: 'planning', tags: [], summary: 's', content: 'c', links: [] })
        ),
      }
      const ops = new WikiOps(vault as any, s)

      await ops.ingestFile({ path: 'raw/nota.md' }, llm, 'projects/montisol')

      expect(vault.files['wiki/montisol-timeline.md']).toBeDefined()
      expect(vault.files['wiki/index.md']).toContain('wiki/montisol-timeline')
      expect(vault.files['wiki/timeline.md']).toBeUndefined()
    })
  })
})
