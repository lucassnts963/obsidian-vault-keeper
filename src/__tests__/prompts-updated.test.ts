import { describe, it, expect, beforeAll } from 'vitest'

describe('DEFAULT_AGENT_PROMPT', () => {
  let buildSystemPrompt: any
  let DEFAULT_AGENT_PROMPT: string

  beforeAll(async () => {
    const m = await import('../chat/prompts')
    buildSystemPrompt = m.buildSystemPrompt
    DEFAULT_AGENT_PROMPT = m.DEFAULT_AGENT_PROMPT
  })

  // TEST-12
  it('contains FAITHFULNESS rule', () => {
    expect(DEFAULT_AGENT_PROMPT.toUpperCase()).toContain('FAITHFULNESS')
  })

  // TEST-13
  it('contains bm25_search tool definition', () => {
    expect(DEFAULT_AGENT_PROMPT).toContain('bm25_search')
  })

  it('preserves knowledge vault identity (existing test guard)', () => {
    expect(DEFAULT_AGENT_PROMPT).toContain('knowledge vault')
  })

  it('includes routing table with bm25_search as first action for queries', () => {
    expect(DEFAULT_AGENT_PROMPT).toContain('bm25_search')
    // Routing table should mention topic-based search before read_file
    const bm25Pos = DEFAULT_AGENT_PROMPT.indexOf('bm25_search')
    const readFilePos = DEFAULT_AGENT_PROMPT.indexOf('read_file')
    expect(bm25Pos).toBeLessThan(readFilePos)
  })

  it('buildSystemPrompt with custom AGENTS.md appends TOOL_FORMAT', () => {
    const custom = '# My Custom Agent\nBe helpful.'
    const result = buildSystemPrompt(custom)
    expect(result).toContain('My Custom Agent')
    expect(result).toContain('bm25_search')
    expect(result).toContain('FAITHFULNESS')
  })
})
