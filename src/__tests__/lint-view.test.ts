// @vitest-environment happy-dom

import { describe, it, expect, vi, beforeAll } from 'vitest'

function mockPlugin() {
  return {
    settings: { wikiPath: 'wiki', indexPath: 'wiki/index.md' },
    app: {
      vault: {
        adapter: {
          list: vi.fn(async (dir: string) => {
            if (dir === 'wiki') return { files: ['p1.md', 'p2.md', 'p3.md'], folders: [] }
            return { files: [], folders: [] }
          }),
          read: vi.fn(async (path: string) => {
            if (path === 'wiki/index.md') return '| [[wiki/p1|P1]] | cat | t1 |\n| [[wiki/p2|P2]] | cat | t2 |'
            if (path === 'wiki/p1.md') return '---\ntitle: P1\n---\nconteudo [[wiki/p2]]'
            if (path === 'wiki/p2.md') return '---\ntitle: P2\n---\nconteudo'
            if (path === 'wiki/p3.md') return 'frontmatter quebrado'
            return ''
          }),
          exists: vi.fn(async () => true),
          write: vi.fn(async () => {}),
        },
      },
      workspace: { openLinkText: vi.fn() },
    },
  }
}

describe('LintView', () => {
  let LintView: any

  beforeAll(async () => {
    const mod = await import('../views/lint-view')
    LintView = mod.LintView
  })

  it('has correct view type', () => {
    const view = new LintView({}, mockPlugin())
    expect(view.getViewType()).toBe('vault-keeper-lint')
    expect(view.getDisplayText()).toBe('Auditoria')
  })

  it('detects orphan pages', async () => {
    const plugin = mockPlugin()
    const view = new LintView({}, plugin)
    await view.onOpen()

    const html = view.contentEl.innerHTML
    expect(html).toContain('órf')
  })

  it('detects pages not in index', async () => {
    const plugin = mockPlugin()
    const view = new LintView({}, plugin)
    await view.onOpen()

    const html = view.contentEl.innerHTML
    expect(html).toContain('index')
  })

  it('renders Abrir button for each issue', async () => {
    const plugin = mockPlugin()
    const view = new LintView({}, plugin)
    await view.onOpen()

    const html = view.contentEl.innerHTML
    expect(html).toContain('Abrir')
  })

  it('renders Adicionar ao index button for missing-from-index issues', async () => {
    const plugin = mockPlugin()
    const view = new LintView({}, plugin)
    await view.onOpen()

    const html = view.contentEl.innerHTML
    expect(html).toContain('Adicionar')
  })

  it('renders Executar novamente refresh button', async () => {
    const plugin = mockPlugin()
    const view = new LintView({}, plugin)
    await view.onOpen()

    const html = view.contentEl.innerHTML
    expect(html).toContain('Executar novamente')
  })
})
