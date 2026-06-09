// @vitest-environment happy-dom

import { describe, it, expect, beforeAll, beforeEach, vi } from 'vitest'

function mockVault() {
  const files: Record<string, string> = {}
  const dirs: string[] = []
  return {
    files,
    dirs,
    adapter: {
      read: vi.fn(async (path: string) => {
        if (files[path] !== undefined) return files[path]
        throw new Error('ENOENT')
      }),
      write: vi.fn(async (path: string, content: string) => { files[path] = content }),
      exists: vi.fn(async (path: string) => files[path] !== undefined || dirs.includes(path)),
      list: vi.fn(async (_dir: string) => {
        const prefix = _dir === '/' ? '' : `${_dir}/`
        const f = Object.keys(files)
          .filter(k => k.startsWith(prefix) && !k.includes('/', prefix.length))
          .map(k => k.replace(prefix, ''))
        return { files: f, folders: [] }
      }),
    },
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

describe('WikiOps.gatherContext (BM25 selection)', () => {
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

  // TEST-10 — discriminates BM25 ranking from naive substring+filesystem-order.
  // The weakly-relevant page is inserted FIRST; the naive matcher would pick it
  // (first match within the maxPages budget), BM25 must pick the dense one.
  it('picks the most relevant page by score, not by filesystem order', async () => {
    vault.files['wiki/index.md'] = '| Página | Categoria |\n|--|--|\n| [[wiki/x|X]] | geral |'
    // Inserted FIRST, but only a single passing mention of the term.
    vault.files['wiki/weak.md'] =
      '---\ntitle: "Notas Gerais"\ntags: [diversos]\n---\n\n' +
      'Texto longo sobre muitos assuntos distintos e variados que por acaso cita karpathy uma vez e segue falando de outras coisas completamente diferentes durante vários parágrafos.'
    // Inserted SECOND, densely about the term.
    vault.files['wiki/dense.md'] =
      '---\ntitle: "Karpathy LLM Wiki"\ntags: [karpathy, wiki]\n---\n\n' +
      'Karpathy karpathy wiki metodologia karpathy de wiki para conhecimento mantido por LLM.'

    const ops = new WikiOps(vault as any, s)
    const ctx = await ops.gatherContext('karpathy', 1)

    expect(ctx).toContain('dense.md')
    expect(ctx).not.toContain('weak.md')
  })

  // TEST-11 — preservation guard: index prepend + 1-level wikilink traversal still work.
  it('preserves index prepend and 1-level link traversal', async () => {
    vault.files['wiki/index.md'] = '| Página | Categoria |\n|--|--|\n| [[wiki/hub|Hub]] | geral |'
    vault.files['wiki/hub.md'] =
      '---\ntitle: "Karpathy Synthesis"\ntags: [karpathy]\n---\n\nSobre karpathy synthesis e cross linking. Veja [[wiki/leaf]] para detalhes.'
    vault.files['wiki/leaf.md'] =
      '---\ntitle: "Detalhes Internos"\ntags: [detalhe]\n---\n\nConteúdo aprofundado sem os termos da busca original.'

    const ops = new WikiOps(vault as any, s)
    const ctx = await ops.gatherContext('karpathy synthesis', 5)

    expect(ctx).toContain('## Index')
    expect(ctx).toContain('hub.md')
    expect(ctx).toContain('leaf.md')   // followed via wikilink traversal
  })
})
