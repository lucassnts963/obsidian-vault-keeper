// @vitest-environment happy-dom

import { describe, it, expect, vi, beforeEach, beforeAll, afterEach } from 'vitest'

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

  it('send() renders error message when agent.run() rejects', async () => {
    const plugin = {
      ...mockPlugin(),
      settings: { wikiPath: 'wiki', indexPath: 'wiki/index.md', agent: { resetContext: false } },
      agent: { run: vi.fn().mockRejectedValue(new Error('LLM timeout')) },
    }
    const view = new ChatView({}, plugin)
    await view.onOpen()

    // Call private send() via cast — obsidian mock creates divs for all tags,
    // so we pass a fake input object directly instead of querying the DOM.
    const fakeInput = { value: 'test question', disabled: false, focus: vi.fn() }
    await (view as any).send(fakeInput)

    expect(view.contentEl.innerHTML).toContain('Erro')
  })
})
