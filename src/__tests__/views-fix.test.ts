// @vitest-environment happy-dom

import { describe, it, expect, vi, beforeEach, beforeAll } from 'vitest'

function mockPlugin(inboxFiles: string[] = [], wikiFiles: string[] = []) {
  return {
    settings: {
      inboxPath: 'inbox', rawPath: 'raw', wikiPath: 'wiki',
      indexPath: 'wiki/index.md', logPath: 'wiki/log.md',
    },
    app: {
      vault: {
        adapter: {
          list: vi.fn(async (dir: string) => {
            if (dir === 'inbox') return { files: inboxFiles, folders: [] }
            if (dir === 'wiki') return { files: wikiFiles, folders: [] }
            return { files: [], folders: [] }
          }),
          read: vi.fn(async (path: string) => {
            if (path.startsWith('inbox/')) return `---\nstatus: inbox\ntitle: ${path}\n---\nconteudo`
            if (path === 'wiki/p1.md') return '---\ntitle: P1\n---\n[[wiki/p2]]'
            if (path === 'wiki/p2.md') return '---\ntitle: P2\n---\n[[wiki/p1]]'
            if (path === 'wiki/p3.md') return 'sem frontmatter'
            if (path === 'wiki/index.md') return '| [[wiki/p1|P1]] | cat |'
            return ''
          }),
          exists: vi.fn(async (_p: string) => true),
          mkdir: vi.fn(async () => {}),
        },
      },
      workspace: { getActiveFile: vi.fn(() => null) },
    },
    wiki: {
      approve: vi.fn(async () => {}),
      reject: vi.fn(async () => {}),
      ingestFile: vi.fn(async () => {}),
      gatherContext: vi.fn(async () => ''),
    },
    llm: { chat: vi.fn(async () => 'resposta') },
  }
}

describe('InboxView (fixed)', () => {
  let InboxView: any
  beforeAll(async () => { const m = await import('../views/inbox-view'); InboxView = m.InboxView })

  it('shows empty state for empty directory', async () => {
    const view = new InboxView({}, mockPlugin([]))
    await view.onOpen()
    expect(view.contentEl.innerHTML).toContain('Nenhuma')
  })

  it('shows loading state initially', async () => {
    const view = new InboxView({}, mockPlugin())
    // Before onOpen completes, should show loading
    expect(view.contentEl.innerHTML).toContain('Carregando')
  })

  it('does not crash when adapter throws', async () => {
    const plugin = mockPlugin()
    plugin.app.vault.adapter.list.mockRejectedValue(new Error('ENOENT'))
    const view = new InboxView({}, plugin)
    await expect(view.onOpen()).resolves.not.toThrow()
    expect(plugin.app.vault.adapter.mkdir).toHaveBeenCalled()
  })

  it('normalizes file paths with directory prefix', async () => {
    // Mobile sometimes returns 'inbox/nota.md' in list.files
    const plugin = mockPlugin(['nota1.md', 'inbox/nota2.md'])
    const view = new InboxView({}, plugin)
    await view.onOpen()
    expect(view.contentEl.innerHTML).toContain('nota1')
    expect(view.contentEl.innerHTML).toContain('nota2')
  })
})

describe('LintView (fixed)', () => {
  let LintView: any
  beforeAll(async () => { const m = await import('../views/lint-view'); LintView = m.LintView })

  it('detects orphans with 1 page', async () => {
    const plugin = mockPlugin([], ['p1.md'])
    const view = new LintView({}, plugin)
    await view.onOpen()
    expect(view.contentEl.innerHTML).toContain('órf')
  })

  it('detects broken frontmatter', async () => {
    const plugin = mockPlugin([], ['p3.md'])
    const view = new LintView({}, plugin)
    await view.onOpen()
    expect(view.contentEl.innerHTML).toContain('Frontmatter')
  })

  it('does not crash when wiki dir missing', async () => {
    const plugin = mockPlugin([], [])
    plugin.app.vault.adapter.list.mockRejectedValue(new Error('ENOENT'))
    const view = new LintView({}, plugin)
    await expect(view.onOpen()).resolves.not.toThrow()
    expect(view.contentEl.innerHTML).toContain('problema')
  })
})
