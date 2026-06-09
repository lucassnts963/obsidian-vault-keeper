import { describe, it, expect, beforeAll, beforeEach, vi } from 'vitest'
import { readFileSync } from 'fs'
import { resolve } from 'path'

function mockAdapter() {
  const files: Record<string, string> = {}
  const dirs: string[] = []
  return {
    files, dirs,
    read:   vi.fn(async (p: string) => { if (files[p] !== undefined) return files[p]; throw new Error('ENOENT') }),
    write:  vi.fn(async (p: string, c: string) => { files[p] = c }),
    exists: vi.fn(async (p: string) => files[p] !== undefined || dirs.includes(p)),
    mkdir:  vi.fn(async (p: string) => { dirs.push(p) }),
  }
}

describe('IndexPersistence', () => {
  let IndexPersistence: any
  let adapter: ReturnType<typeof mockAdapter>

  beforeAll(async () => {
    ({ IndexPersistence } = await import('../search/index-persistence'))
  })

  beforeEach(() => { adapter = mockAdapter() })

  // TEST-01
  it('returns empty array when index file does not exist', async () => {
    const ip = new IndexPersistence(adapter)
    expect(await ip.load()).toEqual([])
  })

  it('returns empty array when index file is corrupted JSON', async () => {
    adapter.files['.vault-keeper/bm25-index.json'] = 'NOT_JSON'
    const ip = new IndexPersistence(adapter)
    expect(await ip.load()).toEqual([])
  })

  it('returns empty array when entries field is not an array', async () => {
    adapter.files['.vault-keeper/bm25-index.json'] = JSON.stringify({ version: 1, entries: null })
    const ip = new IndexPersistence(adapter)
    expect(await ip.load()).toEqual([])
  })

  // TEST-02
  it('save() + load() round-trips entries correctly', async () => {
    const ip = new IndexPersistence(adapter)
    const entries = [
      { path: 'wiki/a.md', title: 'A', summary: 'About A', tags: ['tag1'], key_entities: ['Ent1'] },
      { path: 'wiki/b.md', title: 'B', summary: '',         tags: [],       key_entities: [] },
    ]
    await ip.save(entries)
    const loaded = await ip.load()
    expect(loaded).toEqual(entries)
  })

  it('save() creates .vault-keeper/ dir if it does not exist', async () => {
    const ip = new IndexPersistence(adapter)
    await ip.save([])
    expect(adapter.mkdir).toHaveBeenCalledWith('.vault-keeper')
  })

  it('save() does not call mkdir when dir already exists', async () => {
    adapter.dirs.push('.vault-keeper')
    const ip = new IndexPersistence(adapter)
    await ip.save([])
    expect(adapter.mkdir).not.toHaveBeenCalled()
  })

  // TEST-03
  it('upsert() adds a new entry', async () => {
    const ip = new IndexPersistence(adapter)
    await ip.upsert({ path: 'wiki/x.md', title: 'X', summary: 'S', tags: ['t'], key_entities: ['E'] })
    const entries = await ip.load()
    expect(entries).toHaveLength(1)
    expect(entries[0].path).toBe('wiki/x.md')
  })

  // TEST-04
  it('upsert() replaces entry with same path, does not duplicate', async () => {
    const ip = new IndexPersistence(adapter)
    await ip.upsert({ path: 'wiki/x.md', title: 'Old', summary: '', tags: [], key_entities: [] })
    await ip.upsert({ path: 'wiki/x.md', title: 'New', summary: 'Updated', tags: ['tag'], key_entities: ['Ent'] })
    const entries = await ip.load()
    expect(entries).toHaveLength(1)
    expect(entries[0].title).toBe('New')
    expect(entries[0].summary).toBe('Updated')
  })

  // TEST-05
  it('remove() deletes entry by path', async () => {
    const ip = new IndexPersistence(adapter)
    await ip.upsert({ path: 'wiki/a.md', title: 'A', summary: '', tags: [], key_entities: [] })
    await ip.upsert({ path: 'wiki/b.md', title: 'B', summary: '', tags: [], key_entities: [] })
    await ip.remove('wiki/a.md')
    const entries = await ip.load()
    expect(entries).toHaveLength(1)
    expect(entries[0].path).toBe('wiki/b.md')
  })

  it('remove() on non-existent path is a no-op', async () => {
    const ip = new IndexPersistence(adapter)
    await ip.upsert({ path: 'wiki/a.md', title: 'A', summary: '', tags: [], key_entities: [] })
    await ip.remove('wiki/nonexistent.md')
    expect(await ip.load()).toHaveLength(1)
  })
})

// TEST-12
describe('IndexPersistence module purity', () => {
  it('does not import obsidian', () => {
    const src = readFileSync(resolve(__dirname, '../search/index-persistence.ts'), 'utf-8')
    expect(src).not.toMatch(/from\s+['"]obsidian['"]/)
    expect(src).not.toMatch(/require\(['"]obsidian['"]\)/)
  })
})
