// @vitest-environment happy-dom

import { describe, it, expect, vi, beforeEach, beforeAll } from 'vitest'

function mockPlugin() {
  return {
    settings: { wikiPath: 'wiki', indexPath: 'wiki/index.md' },
    app: {
      vault: {
        adapter: {
          read: vi.fn(async () => ''),
          list: vi.fn(async () => ({ files: [], folders: [] })),
        },
      },
      workspace: {
        getActiveFile: vi.fn(() => null),
      },
    },
    wiki: {
      gatherContext: vi.fn(async () => 'index content\n\npage content'),
    },
    llm: {
      chat: vi.fn(async () => 'Resposta do LLM com [[wiki/pagina]]'),
    },
  }
}

describe('ChatView', () => {
  let ChatView: any

  beforeAll(async () => {
    const mod = await import('../views/chat-view')
    ChatView = mod.ChatView
  })

  beforeEach(() => {
  })

  it('has correct view type', () => {
    const plugin = mockPlugin()
    const view = new ChatView({}, plugin)
    expect(view.getViewType()).toBe('vault-keeper-chat')
    expect(view.getDisplayText()).toBe('Vault Chat')
  })

  it('renders input and send button', async () => {
    const plugin = mockPlugin()
    const view = new ChatView({}, plugin)
    await view.onOpen()

    const html = view.contentEl.innerHTML
    expect(html).toContain('Enviar')
  })

  it('shows "LLM nao configurado" when llm is null', async () => {
    const plugin = mockPlugin()
    plugin.llm = null as any
    const view = new ChatView({}, plugin)
    await view.onOpen()

    const html = view.contentEl.innerHTML
    expect(html).toContain('configurado')
  })
})
