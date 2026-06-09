// @vitest-environment happy-dom

import { describe, it, expect, vi, beforeAll } from 'vitest'

describe('chat-view JSON extraction', () => {
  let extractAnswerContent: (text: string) => string | null

  beforeAll(async () => {
    const m = await import('../views/chat-view')
    extractAnswerContent = (m as any).extractAnswerContent
  })

  it('extracts content from JSON at start', () => {
    const result = extractAnswerContent('{"type":"answer","content":"hello"}')
    expect(result).toBe('hello')
  })

  it('extracts content from JSON anywhere in text', () => {
    const result = extractAnswerContent('Here is the response: {"type":"answer","content":"the answer"}')
    expect(result).toBe('the answer')
  })

  it('returns null for non-JSON text', () => {
    const result = extractAnswerContent('just plain text')
    expect(result).toBeNull()
  })

  it('handles markdown content in JSON', () => {
    const result = extractAnswerContent('{"type":"answer","content":"## Title\\n\\n**bold** text\\n\\n- list item"}')
    expect(result).toContain('## Title')
    expect(result).toContain('**bold**')
    expect(result).toContain('list item')
  })
})

describe('agent tools', () => {
  let executeTool: any

  beforeAll(async () => {
    const m = await import('../chat/tools')
    executeTool = m.executeTool
  })

  it('has approve_file tool registered', async () => {
    const v = { adapter: { read: vi.fn(async () => 'content'), write: vi.fn(async () => {}), delete: vi.fn(async () => {}) } }
    const r = await executeTool(v, 'approve_file', { path: 'inbox/test.md' }, 'wiki/index.md')
    expect(typeof r).toBe('string')
  })

  it('has run_lint tool registered', async () => {
    const v = { adapter: { list: vi.fn(async () => ({ files: [], folders: [] })), read: vi.fn(async () => '| index |') } }
    const r = await executeTool(v, 'run_lint', {}, 'wiki/index.md')
    expect(typeof r).toBe('string')
  })
})

describe('WikiOps write page', () => {
  let WikiOps: any

  beforeAll(async () => {
    const m = await import('../wiki/ops')
    WikiOps = m.WikiOps
  })

  it('writePage creates wiki file with frontmatter', async () => {
    const files: Record<string, string> = {}
    const v = {
      adapter: {
        write: vi.fn(async (p: string, c: string) => { files[p] = c }),
        read: vi.fn(async () => '| old | index |'),
        exists: vi.fn(async (p: string) => p === 'wiki/index.md'),
        mkdir: vi.fn(async () => {}),
      },
      create: vi.fn(async (p: string, c: string) => { files[p] = c }),
    }
    const ops = new WikiOps(v, { wikiPath: 'wiki', indexPath: 'wiki/index.md', logPath: 'wiki/log.md' })

    await ops.writePage('Meu Titulo', 'Conteudo da pagina', ['tag1', 'tag2'], 'categoria')

    expect(files['wiki/meu-titulo.md']).toContain('title: "Meu Titulo"')
    expect(files['wiki/meu-titulo.md']).toContain('category: categoria')
    expect(files['wiki/meu-titulo.md']).toContain('tags: [tag1, tag2]')
    expect(files['wiki/meu-titulo.md']).toContain('Conteudo da pagina')
  })
})
