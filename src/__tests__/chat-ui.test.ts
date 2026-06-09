// @vitest-environment happy-dom

import { describe, it, expect, beforeAll } from 'vitest'

describe('renderMarkdown', () => {
  let renderMarkdown: (text: string) => string

  beforeAll(async () => {
    const m = await import('../views/markdown')
    renderMarkdown = m.renderMarkdown
  })

  it('renders bold', () => {
    expect(renderMarkdown('**negrito**')).toContain('<strong>negrito</strong>')
  })

  it('renders italic', () => {
    expect(renderMarkdown('*italico*')).toContain('<em>italico</em>')
  })

  it('renders headings', () => {
    expect(renderMarkdown('## Titulo')).toContain('<h2>Titulo</h2>')
  })

  it('renders inline code', () => {
    expect(renderMarkdown('use `cmd` now')).toContain('<code>cmd</code>')
  })

  it('renders wikilinks as clickable', () => {
    const html = renderMarkdown('see [[wiki/page]] here')
    expect(html).toContain('wiki/page')
    expect(html).toContain('vk-wikilink')
    expect(html).toContain('data-path="wiki/page"')
  })

  it('renders unordered lists', () => {
    const html = renderMarkdown('- item 1\n- item 2')
    expect(html).toContain('<ul>')
    expect(html).toContain('<li>item 1</li>')
  })

  it('renders code blocks', () => {
    const html = renderMarkdown('```\ncode block\n```')
    expect(html).toContain('<pre>')
    expect(html).toContain('<code>code block')
  })

  it('renders horizontal rule', () => {
    expect(renderMarkdown('---')).toContain('<hr')
  })
})

describe('bubble', () => {
  let bubble: any

  beforeAll(async () => {
    const m = await import('../views/ui')
    bubble = m.bubble
  })

  it('creates user bubble with accent color', () => {
    const container = document.createElement('div')
    const b = bubble('user', container)
    expect(b.label.textContent).toBe('Você')
    expect(b.container.style.justifyContent).toBe('flex-end')
    expect(b.time).toBeDefined()
  })

  it('creates agent bubble with secondary color', () => {
    const container = document.createElement('div')
    const b = bubble('agent', container)
    expect(b.label.textContent).toBe('Agente')
    expect(b.container.style.justifyContent).toBe('flex-start')
  })
})

describe('collapsible', () => {
  let collapsible: any

  beforeAll(async () => {
    const m = await import('../views/ui')
    collapsible = m.collapsible
  })

  it('shows title and hidden body', () => {
    const container = document.createElement('div')
    const el = collapsible('title here', 'body content', container)
    expect(el.innerHTML).toContain('title here')
    expect(el.innerHTML).toContain('body content')
  })
})

describe('AgentResponse', () => {
  it('agent.run returns steps and answer', async () => {
    const { VaultAgent } = await import('../chat/agent')
    const v = {
      adapter: {
        read: async () => {
          throw new Error('no agents.md')
        },
      },
    }
    const llm = {
      chat: async () => '{"type":"answer","content":"hello world"}',
    }
    const agent = new VaultAgent(v, llm, { wikiPath: 'wiki', indexPath: 'wiki/index.md' })
    const response = await agent.run('hi', [])
    expect(response.answer).toContain('hello world')
    expect(Array.isArray(response.steps)).toBe(true)
  })
})
