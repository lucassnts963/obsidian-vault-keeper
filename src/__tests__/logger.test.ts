import { describe, it, expect, vi } from 'vitest'

function mockVault(initial: Record<string, string> = {}) {
  const files: Record<string, string> = { ...initial }
  return {
    adapter: {
      exists: vi.fn(async (p: string) => files[p] !== undefined),
      read: vi.fn(async (p: string) => { if (files[p] !== undefined) return files[p]; throw new Error('ENOENT') }),
      write: vi.fn(async (p: string, c: string) => { files[p] = c }),
    },
    _files: files,
  } as any
}

describe('Logger', () => {
  it('writes to the injected logPath instead of the hardcoded default', async () => {
    const { Logger } = await import('../wiki/log')
    const vault = mockVault()
    const logger = new Logger(vault, 'custom/ops-log.md')
    await logger.log('ingest', 'Página de Teste')
    expect(vault._files['custom/ops-log.md']).toContain('ingest')
    expect(vault._files['custom/ops-log.md']).toContain('Página de Teste')
    expect(vault._files['wiki/log.md']).toBeUndefined()
  })

  it('falls back to wiki/log.md when no logPath is provided', async () => {
    const { Logger } = await import('../wiki/log')
    const vault = mockVault()
    const logger = new Logger(vault)
    await logger.log('approve', 'alguma coisa')
    expect(vault._files['wiki/log.md']).toContain('approve')
  })

  it('prepends new entry to existing log (most recent first)', async () => {
    const { Logger } = await import('../wiki/log')
    const vault = mockVault({ 'wiki/log.md': '# Log\n\n## [2026-01-01] old | entry\n' })
    const logger = new Logger(vault)
    await logger.log('ingest', 'nova entrada')
    const content = vault._files['wiki/log.md']
    const newPos = content.indexOf('nova entrada')
    const oldPos = content.indexOf('old | entry')
    expect(newPos).toBeLessThan(oldPos)
  })
})
