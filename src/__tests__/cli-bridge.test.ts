import { describe, it, expect, vi, beforeAll } from 'vitest'

describe('CLIBridge', () => {
  let CLIBridge: any
  let VAULT_METHODOLOGY_INSTRUCTIONS: string

  beforeAll(async () => {
    const m = await import('../agents/cli-bridge')
    CLIBridge = m.CLIBridge
    VAULT_METHODOLOGY_INSTRUCTIONS = m.VAULT_METHODOLOGY_INSTRUCTIONS
  })

  // T-01: detect returns a valid AgentCLI or null — never throws
  it('detect() returns a valid AgentCLI type or null', async () => {
    const result = await CLIBridge.detect()
    const validValues = ['claude', 'opencode', 'gemini', 'custom', null]
    expect(validValues).toContain(result)
  })

  // T-02: buildInstructions returns all three file keys
  it('buildInstructions() returns CLAUDE.md, GEMINI.md, AGENTS.md keys', () => {
    const files = CLIBridge.buildInstructions()
    expect(files).toHaveProperty('CLAUDE.md')
    expect(files).toHaveProperty('GEMINI.md')
    expect(files).toHaveProperty('AGENTS.md')
  })

  // T-03: all instruction files contain vault structure section
  it('all instruction files contain vault structure section', () => {
    const files = CLIBridge.buildInstructions()
    for (const [name, content] of Object.entries(files)) {
      expect(content as string, `${name} should contain inbox/ section`).toContain('inbox/')
      expect(content as string, `${name} should contain wiki/ section`).toContain('wiki/')
      expect(content as string, `${name} should contain raw/ section`).toContain('raw/')
      expect(content as string, `${name} should contain _slots/ section`).toContain('_slots/')
    }
  })

  it('all instruction files contain methodology flow names', () => {
    const files = CLIBridge.buildInstructions()
    for (const [name, content] of Object.entries(files)) {
      expect(content as string, `${name} should contain Ingest`).toContain('Ingest')
      expect(content as string, `${name} should contain Lint`).toContain('Lint')
      expect(content as string, `${name} should contain Query`).toContain('Query')
    }
  })

  it('AGENTS.md contains ## Vault Agent section', () => {
    const files = CLIBridge.buildInstructions()
    expect(files['AGENTS.md']).toContain('## Vault Agent')
  })

  // T-04: buildCommand includes file path for ingest
  it('buildCommand("ingest", {file}) includes the file path', () => {
    const settings = { cli: { preferred: 'claude', customBinaryPath: '', autoDetect: false } } as any
    const bridge = new CLIBridge(settings)
    const cmd = bridge.buildCommand('ingest', { file: 'raw/meu-artigo.md' })
    expect(cmd).toContain('raw/meu-artigo.md')
    expect(cmd).toContain('claude')
  })

  it('buildCommand("lint") includes lint keyword', () => {
    const settings = { cli: { preferred: 'claude', customBinaryPath: '', autoDetect: false } } as any
    const bridge = new CLIBridge(settings)
    const cmd = bridge.buildCommand('lint')
    expect(cmd.toLowerCase()).toMatch(/lint/)
  })

  it('buildCommand("query", {question}) includes the question', () => {
    const settings = { cli: { preferred: 'gemini', customBinaryPath: '', autoDetect: false } } as any
    const bridge = new CLIBridge(settings)
    const cmd = bridge.buildCommand('query', { question: 'O que é BM25?' })
    expect(cmd).toContain('O que é BM25?')
    expect(cmd).toContain('gemini')
  })

  it('buildCommand returns empty string when preferred is none', () => {
    const settings = { cli: { preferred: 'none', customBinaryPath: '', autoDetect: false } } as any
    const bridge = new CLIBridge(settings)
    const cmd = bridge.buildCommand('ingest', { file: 'raw/test.md' })
    expect(cmd).toBe('')
  })

  it('buildCommand uses custom binary path when preferred is custom', () => {
    const settings = { cli: { preferred: 'custom', customBinaryPath: '/usr/local/bin/myai', autoDetect: false } } as any
    const bridge = new CLIBridge(settings)
    const cmd = bridge.buildCommand('lint')
    expect(cmd).toContain('/usr/local/bin/myai')
  })

  it('VAULT_METHODOLOGY_INSTRUCTIONS contains bm25-index.json reference', () => {
    expect(VAULT_METHODOLOGY_INSTRUCTIONS).toContain('bm25-index.json')
  })

  it('module does not import obsidian', async () => {
    const { readFileSync } = await import('fs')
    const { resolve } = await import('path')
    const src = readFileSync(resolve(__dirname, '../agents/cli-bridge.ts'), 'utf-8')
    expect(src).not.toMatch(/from\s+['"]obsidian['"]/)
  })
})
