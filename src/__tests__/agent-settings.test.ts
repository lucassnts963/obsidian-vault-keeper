// @vitest-environment happy-dom

import { describe, it, expect, vi, beforeAll } from 'vitest'

describe('agent settings defaults', () => {
  let DEFAULT_SETTINGS: any

  beforeAll(async () => {
    const m = await import('../settings')
    DEFAULT_SETTINGS = m.DEFAULT_SETTINGS
  })

  it('has agent section with defaults', () => {
    expect(DEFAULT_SETTINGS.agent).toBeDefined()
    expect(DEFAULT_SETTINGS.agent.maxIterations).toBe(5)
    expect(DEFAULT_SETTINGS.agent.maxFileChars).toBe(3000)
    expect(DEFAULT_SETTINGS.agent.resetContext).toBe(true)
  })
})

describe('tools respect maxFileChars', () => {
  let executeTool: any

  beforeAll(async () => {
    const m = await import('../chat/tools')
    executeTool = m.executeTool
  })

  it('readFile truncates at maxFileChars', async () => {
    const v = { adapter: { read: vi.fn(async () => 'a'.repeat(5000)) } }
    const r = await executeTool(v, 'read_file', { path: 'test.md' }, '', null, null, 100)
    expect(r.length).toBeLessThan(200)
  })

  it('readIndex truncates at maxFileChars', async () => {
    const v = { adapter: { read: vi.fn(async () => 'b'.repeat(5000)) } }
    const r = await executeTool(v, 'read_index', {}, '', null, null, 50)
    expect(r.length).toBeLessThan(150)
  })
})

describe('chat view context reset', () => {
  it('agent.run called with empty history', async () => {
    const { VaultAgent } = await import('../chat/agent')
    const v = { adapter: { read: async () => { throw new Error('no') } } }
    const llm = { chat: vi.fn(async () => '{"type":"answer","content":"ok"}') }
    const agent = new VaultAgent(v, llm, { wikiPath: 'w', indexPath: 'w/i.md' }, null, 5, 1000)

    const response = await agent.run('question', [])
    expect(response.answer).toBe('ok')
  })
})
