// @vitest-environment happy-dom

import { describe, it, expect, vi, beforeEach, beforeAll } from 'vitest'

function mockPlugin() {
  return {
    settings: {
      inboxPath: 'inbox',
      rawPath: 'raw',
      wikiPath: 'wiki',
      indexPath: 'wiki/index.md',
      logPath: 'wiki/log.md',
    },
    app: {
      vault: {
        adapter: {
          list: vi.fn(async (dir: string) => {
            if (dir === 'inbox') return {
              files: ['nota1.md', 'nota2.md', 'nota3.md'],
              folders: [],
            }
            return { files: [], folders: [] }
          }),
          read: vi.fn(async (path: string) => {
            if (path === 'inbox/nota1.md') return '---\nstatus: inbox\n---\n\nconteudo 1'
            if (path === 'inbox/nota2.md') return '---\nstatus: approved\n---\n\nconteudo 2'
            if (path === 'inbox/nota3.md') return '---\nstatus: rejected\n---\n\nconteudo 3'
            return ''
          }),
        },
      },
      workspace: {
        getActiveFile: vi.fn(() => null),
      },
    },
    wiki: {
      approve: vi.fn(async () => {}),
      reject: vi.fn(async () => {}),
      ingestFile: vi.fn(async () => {}),
    },
    llm: {},
  }
}

describe('InboxView', () => {
  let InboxView: any
  let INBOX_VIEW_TYPE: string
  let plugin: ReturnType<typeof mockPlugin>

  beforeAll(async () => {
    const mod = await import('../views/inbox-view')
    InboxView = mod.InboxView
    INBOX_VIEW_TYPE = mod.INBOX_VIEW_TYPE
  })

  beforeEach(() => {
    plugin = mockPlugin()
  })

  it('has correct view type', () => {
    const leaf = { view: null }
    const view = new InboxView(leaf, plugin)
    expect(view.getViewType()).toBe('vault-keeper-inbox')
    expect(view.getDisplayText()).toBe('Inbox')
  })

  it('renders file list from inbox', async () => {
    const leaf = { view: null }
    const view = new InboxView(leaf, plugin)
    await view.onOpen()

    const html = view.contentEl.innerHTML
    expect(html).toContain('nota1.md')
    expect(html).toContain('nota2.md')
    expect(html).toContain('nota3.md')
  })

  it('shows status from frontmatter', async () => {
    const leaf = { view: null }
    const view = new InboxView(leaf, plugin)
    await view.onOpen()

    const html = view.contentEl.innerHTML
    expect(html).toContain('inbox')
    expect(html).toContain('approved')
    expect(html).toContain('rejected')
  })

  it('filter buttons filter by status', async () => {
    const leaf = { view: null }
    const view = new InboxView(leaf, plugin)
    await view.onOpen()

    const html = view.contentEl.innerHTML
    expect(html).toContain('Todos')
    expect(html.toLowerCase()).toContain('pendentes')
  })

  it('renders empty state when no files', async () => {
    plugin.app.vault.adapter.list.mockResolvedValue({ files: [], folders: [] })
    const leaf = { view: null }
    const view = new InboxView(leaf, plugin)
    await view.onOpen()

    const html = view.contentEl.innerHTML
    expect(html).toContain('Nenhuma')
  })

  it('approve and reject buttons are rendered for each item', async () => {
    const leaf = { view: null }
    const view = new InboxView(leaf, plugin)
    await view.onOpen()

    const html = view.contentEl.innerHTML
    expect(html).toContain('Approvar')
    expect(html).toContain('Rejeitar')
  })
})
