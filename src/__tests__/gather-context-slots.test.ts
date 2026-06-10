// @vitest-environment happy-dom

import { describe, it, expect, beforeAll, beforeEach, vi } from 'vitest'

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
        const prefix = `${_d}/`
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

describe('WikiOps.gatherContext — wiki/_slots/ injection', () => {
  let WikiOps: any
  let vault: ReturnType<typeof mockVault>
  let s: ReturnType<typeof settings>

  beforeAll(async () => {
    ({ WikiOps } = await import('../wiki/ops'))
  })

  beforeEach(() => {
    vault = mockVault()
    s = settings()
    vault.files['wiki/index.md'] = '| Página | Categoria |\n|--|--|\n| [[wiki/a|A]] | geral |'
  })

  // TEST-06 — discriminant: focus content must appear in the context.
  it('prepends focus slot content when wiki/_slots/focus.md exists', async () => {
    vault.files['wiki/_slots/focus.md'] = '# Foco Atual\n\nProjeto Atlas — fase 2'

    const ops = new WikiOps(vault as any, s)
    const ctx = await ops.gatherContext('qualquer pergunta')

    expect(ctx).toContain('Projeto Atlas')
    expect(ctx).toContain('Foco Atual')
  })

  // TEST-07 — no error and normal context returned when slot absent.
  it('works normally when _slots/focus.md does not exist', async () => {
    vault.files['wiki/karpathy.md'] = '---\ntitle: "K"\ntags: [k]\n---\nKarpathy wiki.'
    const ops = new WikiOps(vault as any, s)
    const ctx = await ops.gatherContext('karpathy')

    expect(ctx).toBeTruthy()
    expect(ctx).toContain('## Index')
  })
})
