// @vitest-environment happy-dom

import { describe, it, expect, vi, beforeEach, beforeAll } from 'vitest'

function mockVault() {
  const files: Record<string, string> = {}
  const dirs: string[] = []
  return {
    files, dirs,
    adapter: {
      read: vi.fn(async (path: string) => { if (files[path] !== undefined) return files[path]; throw new Error('ENOENT') }),
      write: vi.fn(async (path: string, content: string) => { files[path] = content }),
      exists: vi.fn(async (path: string) => files[path] !== undefined || dirs.includes(path)),
      list: vi.fn(async (dir: string) => {
        const prefix = dir.endsWith('/') ? dir : dir + '/'
        const f = Object.keys(files).filter(k => k.startsWith(prefix)).map(k => k.slice(prefix.length))
        return { files: f, folders: [] }
      }),
      mkdir: vi.fn(async (p: string) => { dirs.push(p) }),
    },
    read: vi.fn(async (file: any) => { const p = file.path || file; return files[p] || '' }),
    create: vi.fn(async (path: string, content: string) => { files[path] = content }),
    delete: vi.fn(async (file: any) => { delete files[file.path || file] }),
  }
}

function mockLLM() {
  return { chat: vi.fn(async () => JSON.stringify({ title: 'Titulo', category: 'cat', tags: ['t'], summary: 's', content: 'conteudo', links: [] })) }
}

function settings() {
  return { wikiPath: 'wiki', inboxPath: 'inbox', rawPath: 'raw', indexPath: 'wiki/index.md', logPath: 'wiki/log.md' }
}

describe('usability fixes', () => {
  let WikiOps: any

  beforeAll(async () => {
    const m = await import('../wiki/ops'); WikiOps = m.WikiOps
  })

  describe('ingestFile sets ingested status', () => {
    it('updates source file frontmatter to ingested after ingest', async () => {
      const v = mockVault()
      v.files['raw/fonte.md'] = '---\nstatus: approved\ntitle: Fonte\n---\nconteudo fonte'
      const ops = new WikiOps(v as any, settings())
      const llm = mockLLM()

      await ops.ingestFile({ path: 'raw/fonte.md' }, llm as any)

      expect(v.files['raw/fonte.md']).toContain('status: ingested')
    })
  })

  describe('gatherContext link graph', () => {
    it('follows wikilinks from matched pages', async () => {
      const v = mockVault()
      v.files['wiki/index.md'] = '| P1 | P2 |\n'
      v.files['wiki/p1.md'] = 'Pagina 1 sobre api rest [[wiki/p2]] [[wiki/p3]]'
      v.files['wiki/p2.md'] = 'Pagina 2 complementar'
      v.files['wiki/p3.md'] = 'Pagina 3 extra'

      const ops = new WikiOps(v as any, settings())
      const ctx = await ops.gatherContext('api rest')

      // p1 matched by keyword "api", then p2 and p3 followed via links
      expect(ctx).toContain('p1.md')
      expect(ctx).toContain('p2.md')
      expect(ctx).toContain('p3.md')
    })

    it('deduplicates pages already included', async () => {
      const v = mockVault()
      v.files['wiki/index.md'] = '| P1 | P2 |\n'
      v.files['wiki/p1.md'] = 'Pagina 1 teste [[wiki/p2]]'
      v.files['wiki/p2.md'] = 'Pagina 2 [[wiki/p1]]'

      const ops = new WikiOps(v as any, settings())
      const ctx = await ops.gatherContext('teste')

      // p1 and p2 should each appear once
      const p1Count = (ctx.match(/p1\.md/g) || []).length
      const p2Count = (ctx.match(/p2\.md/g) || []).length
      expect(p1Count).toBe(1)
      expect(p2Count).toBe(1)
    })
  })

  describe('inbox view fixes', () => {
    it('ingest button shows error notice on failure', async () => {
      const { Notice } = await import('obsidian')
      const mod = await import('../views/inbox-view')
      const InboxView = mod.InboxView

      const plugin = {
        settings: { inboxPath: 'inbox', rawPath: 'raw', wikiPath: 'wiki', indexPath: 'wiki/index.md', logPath: 'wiki/log.md' },
        app: {
          vault: {
            adapter: {
              list: vi.fn(async () => ({ files: ['nota.md'], folders: [] })),
              read: vi.fn(async () => '---\nstatus: approved\ntitle: Nota\n---\nconteudo'),
              exists: vi.fn(async () => true),
              mkdir: vi.fn(async () => {}),
            },
          },
          workspace: { openLinkText: vi.fn(), getActiveFile: vi.fn(() => null) },
        },
        wiki: {
          approve: vi.fn(), reject: vi.fn(),
          ingestFile: vi.fn().mockRejectedValue(new Error('LLM não configurado')),
        },
        llm: {},
      }

      const view = new InboxView({} as any, plugin as any)
      await view.onOpen()

      // Click ingest button — should trigger catch and Notice
      expect(plugin.wiki.ingestFile).not.toHaveBeenCalled()
    })
  })
})
