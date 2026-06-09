// @vitest-environment happy-dom

import { describe, it, expect, vi, beforeEach, beforeAll } from 'vitest'

function mockVault() {
  const files: Record<string, string> = {}
  const dirs: string[] = []
  return {
    files, dirs,
    adapter: {
      read: vi.fn(async (path: string) => { if (files[path] !== undefined) return files[path]; throw new Error('ENOENT') }),
      list: vi.fn(async (dir: string) => {
        const prefix = dir.endsWith('/') ? dir : dir + '/'
        const f = Object.keys(files).filter(k => k.startsWith(prefix)).map(k => k.slice(prefix.length))
        const d = dirs.filter(k => k !== prefix && k.startsWith(prefix.replace(/\/$/, ''))).map(k => k.replace(prefix, ''))
        return { files: f, folders: [...new Set(d)] }
      }),
      exists: vi.fn(async (path: string) => files[path] !== undefined || dirs.includes(path)),
    },
  }
}

function mockLLM(responses: string[]) {
  let i = 0
  return { chat: vi.fn(async () => responses[i++] || '{"type":"answer","content":"done"}') }
}

describe('VaultAgent', () => {
  let VaultAgent: any

  beforeAll(async () => {
    const m = await import('../chat/agent')
    VaultAgent = m.VaultAgent
  })

  it('falls back to DEFAULT_AGENT_PROMPT when AGENTS.md has no ## Vault Agent section', async () => {
    const v = mockVault()
    v.files['AGENTS.md'] = '# Dev Docs\n\nPlugin development content only — no vault agent section.'
    const llm = mockLLM(['{"type":"answer","content":"hello"}'])
    const agent = new VaultAgent(v as any, llm, { wikiPath: 'wiki', indexPath: 'wiki/index.md' })
    await agent.ensureConfig()
    // Full dev-docs AGENTS.md without ## Vault Agent → default prompt used (not dev docs)
    expect(agent.systemPrompt).toContain('knowledge vault')
    expect(agent.systemPrompt).not.toContain('Plugin development content')
  })

  it('extracts ## Vault Agent section when present in AGENTS.md', async () => {
    const v = mockVault()
    v.files['AGENTS.md'] = '# Dev Docs\n\nPlugin development content.\n\n## Vault Agent\n\nYou are a vault assistant.\n\n## Other Section\n\nOther content.'
    const llm = mockLLM([])
    const agent = new VaultAgent(v as any, llm, { wikiPath: 'wiki', indexPath: 'wiki/index.md' })
    await agent.ensureConfig()
    expect(agent.systemPrompt).toContain('vault assistant')
    expect(agent.systemPrompt).not.toContain('Plugin development content')
  })

  it('defaults when AGENTS.md missing', async () => {
    const v = mockVault()
    const llm = mockLLM(['{"type":"answer","content":"hello"}'])
    const agent = new VaultAgent(v as any, llm, { wikiPath: 'wiki', indexPath: 'wiki/index.md' })
    await agent.ensureConfig()
    expect(agent.systemPrompt).toContain('knowledge vault')
  })

  it('parses tool call JSON correctly', () => {
    const agent = new VaultAgent(mockVault() as any, mockLLM([]), {})
    const result = agent.parseResponse('{"type":"tool","tool":"read_file","args":{"path":"test.md"}}')
    expect(result.type).toBe('tool')
    expect(result.tool).toBe('read_file')
    expect(result.args.path).toBe('test.md')
  })

  it('falls back to answer on bad JSON', () => {
    const agent = new VaultAgent(mockVault() as any, mockLLM([]), {})
    const result = agent.parseResponse('not valid json at all')
    expect(result.type).toBe('answer')
    expect(result.content).toBe('not valid json at all')
  })

  it('agent.run loops until answer', async () => {
    const v = mockVault()
    v.files['wiki/note.md'] = 'some content here'
    v.files['wiki/index.md'] = '| index |'
    const llm = mockLLM([
      '{"type":"tool","tool":"read_file","args":{"path":"wiki/note.md"}}',
      '{"type":"answer","content":"Based on the file, the answer is X."}',
    ])
    const agent = new VaultAgent(v as any, llm, { wikiPath: 'wiki', indexPath: 'wiki/index.md' })
    await agent.ensureConfig()

    const response = await agent.run('question', [])
    expect(response.answer).toContain('Based on the file')
    expect(response.steps.length).toBe(1)
    expect(response.steps[0].tool).toBe('read_file')
  })

  it('stops at max iterations and makes final call', async () => {
    const v = mockVault()
    const llm = mockLLM([
      '{"type":"tool","tool":"read_file","args":{"path":"a.md"}}',
      '{"type":"tool","tool":"read_file","args":{"path":"b.md"}}',
      '{"type":"tool","tool":"read_file","args":{"path":"c.md"}}',
      '{"type":"answer","content":"final answer after limit"}',
    ])
    const agent = new VaultAgent(v as any, llm, { wikiPath: 'wiki', indexPath: 'wiki/index.md' }, null, 3, 2)
    await agent.ensureConfig()

    const response = await agent.run('q', [])
    expect(response.answer).toContain('final answer')
    expect(response.steps.length).toBe(3)
  })
})

describe('tools', () => {
  let tools: any

  beforeAll(async () => {
    tools = await import('../chat/tools')
  })

  it('read_file returns content truncated to maxChars', async () => {
    const v = mockVault()
    v.files['test.md'] = 'a'.repeat(5000)
    const result = await tools.readFile(v as any, 'test.md', 100)
    expect(result.length).toBeLessThanOrEqual(150) // content + error/truncation message
  })

  it('list_dir returns file list filtered by .md', async () => {
    const v = mockVault()
    v.files['wiki/a.md'] = ''
    v.files['wiki/b.md'] = ''
    v.files['wiki/c.yaml'] = ''
    const result = await tools.listDir(v as any, 'wiki')
    expect(result).toContain('a.md')
    expect(result).toContain('b.md')
    expect(result).not.toContain('c.yaml')
  })

  it('read_index returns index content', async () => {
    const v = mockVault()
    v.files['wiki/index.md'] = '| Page | Category |'
    const result = await tools.readIndex(v as any, 'wiki/index.md')
    expect(result).toContain('Page')
  })
})
