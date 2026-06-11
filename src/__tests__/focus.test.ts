// @vitest-environment node

import { describe, it, expect, vi } from 'vitest'
import { SlotsManager } from '../slots/manager'

function mockAdapter(files: Record<string, string> = {}) {
  const dirs: string[] = []
  const f = { ...files }
  return {
    files: f,
    adapter: {
      read: vi.fn(async (p: string) => { if (f[p] !== undefined) return f[p]; throw new Error('ENOENT') }),
      write: vi.fn(async (p: string, c: string) => { f[p] = c }),
      exists: vi.fn(async (p: string) => f[p] !== undefined || dirs.includes(p)),
      mkdir: vi.fn(async (p: string) => { dirs.push(p) }),
    },
  }
}

describe('SlotsManager.getFocus', () => {
  it('returns empty focus when file does not exist', async () => {
    const { adapter } = mockAdapter()
    const f = await new SlotsManager(adapter).getFocus()
    expect(f.projects).toEqual([])
    expect(f.includeRoot).toBe(false)
  })

  it('parses single project from frontmatter', async () => {
    const { adapter } = mockAdapter({
      'wiki/_slots/focus.md': '---\nprojects: ["projects/alpha"]\nincludeRoot: false\n---\n\nFoco: alpha',
    })
    const f = await new SlotsManager(adapter).getFocus()
    expect(f.projects).toEqual(['projects/alpha'])
    expect(f.includeRoot).toBe(false)
  })

  it('parses multiple projects and includeRoot', async () => {
    const { adapter } = mockAdapter({
      'wiki/_slots/focus.md': '---\nprojects: ["projects/alpha", "projects/beta"]\nincludeRoot: true\n---\n\nbody',
    })
    const f = await new SlotsManager(adapter).getFocus()
    expect(f.projects).toEqual(['projects/alpha', 'projects/beta'])
    expect(f.includeRoot).toBe(true)
  })

  it('returns empty focus when file has no projects frontmatter', async () => {
    const { adapter } = mockAdapter({
      'wiki/_slots/focus.md': 'Foco atual: trabalhar no relatório mensal.',
    })
    const f = await new SlotsManager(adapter).getFocus()
    expect(f.projects).toEqual([])
  })
})

describe('SlotsManager.setFocus', () => {
  it('writes frontmatter with project paths', async () => {
    const { adapter, files } = mockAdapter({ 'wiki/_slots': '' })
    await new SlotsManager(adapter).setFocus({ projects: ['projects/alpha'], includeRoot: false })
    expect(files['wiki/_slots/focus.md']).toContain('projects: ["projects/alpha"]')
    expect(files['wiki/_slots/focus.md']).toContain('includeRoot: false')
    expect(files['wiki/_slots/focus.md']).toContain('alpha')
  })

  it('round-trips: setFocus then getFocus returns same state', async () => {
    const { adapter } = mockAdapter()
    const sm = new SlotsManager(adapter)
    const state = { projects: ['projects/alpha', 'projects/beta'], includeRoot: true }
    await sm.setFocus(state)
    const read = await sm.getFocus()
    expect(read.projects).toEqual(state.projects)
    expect(read.includeRoot).toBe(true)
  })

  it('writes vault-wide state when projects is empty', async () => {
    const { adapter, files } = mockAdapter({ 'wiki/_slots': '' })
    await new SlotsManager(adapter).setFocus({ projects: [], includeRoot: false })
    expect(files['wiki/_slots/focus.md']).toContain('projects: []')
    expect(files['wiki/_slots/focus.md']).toContain('vault-wide')
  })
})

describe('bm25Search with focusedPaths', () => {
  const entries = [
    { path: 'wiki/page-root.md', title: 'Root Page', summary: 'root content here', tags: [], key_entities: [] },
    { path: 'projects/alpha/wiki/page-alpha.md', title: 'Alpha Page', summary: 'alpha content here', tags: [], key_entities: [] },
    { path: 'projects/beta/wiki/page-beta.md', title: 'Beta Page', summary: 'beta content here', tags: [], key_entities: [] },
  ]

  function makeVault() {
    return {
      adapter: {
        read: vi.fn(async () => JSON.stringify({ version: 1, entries })),
        exists: vi.fn(async () => true),
        write: vi.fn(),
        mkdir: vi.fn(),
      },
    }
  }

  it('filters to focused project only', async () => {
    const { bm25Search } = await import('../chat/tools')
    const result = await bm25Search(makeVault(), { query: 'content', topK: 5 }, ['projects/alpha'])
    expect(result).toContain('Alpha Page')
    expect(result).not.toContain('Root Page')
    expect(result).not.toContain('Beta Page')
  })

  it('returns all entries when no focusedPaths given', async () => {
    const { bm25Search } = await import('../chat/tools')
    const result = await bm25Search(makeVault(), { query: 'content', topK: 5 })
    expect(result).toContain('Root Page')
    expect(result).toContain('Alpha Page')
  })

  it('returns informative message when focused project has no indexed pages', async () => {
    const { bm25Search } = await import('../chat/tools')
    const result = await bm25Search(makeVault(), { query: 'content', topK: 5 }, ['projects/gamma'])
    expect(result).toContain('projects/gamma')
    expect(result).toContain('ingest')
  })

  it('supports multi-project focus', async () => {
    const { bm25Search } = await import('../chat/tools')
    const result = await bm25Search(makeVault(), { query: 'content', topK: 5 }, ['projects/alpha', 'projects/beta'])
    expect(result).toContain('Alpha Page')
    expect(result).toContain('Beta Page')
    expect(result).not.toContain('Root Page')
  })
})
