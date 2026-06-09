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

describe('SlotsManager', () => {
  let SlotsManager: any
  let adapter: ReturnType<typeof mockAdapter>

  beforeAll(async () => {
    ({ SlotsManager } = await import('../slots/manager'))
  })

  beforeEach(() => { adapter = mockAdapter() })

  // TEST-01
  it('readSlot returns null when file does not exist', async () => {
    const sm = new SlotsManager(adapter)
    expect(await sm.readSlot('focus')).toBeNull()
  })

  // TEST-02
  it('readSlot returns content when file exists', async () => {
    adapter.files['_slots/focus.md'] = '# Foco\n\nProjeto Atlas'
    const sm = new SlotsManager(adapter)
    expect(await sm.readSlot('focus')).toContain('Projeto Atlas')
  })

  // TEST-03
  it('writeSlot creates the file and the _slots/ dir when missing', async () => {
    const sm = new SlotsManager(adapter)
    await sm.writeSlot('focus', '# Foco\n\nAtual: Karpathy')

    expect(adapter.mkdir).toHaveBeenCalledWith('_slots')
    expect(adapter.files['_slots/focus.md']).toContain('Karpathy')
  })

  // TEST-04
  it('writeSlot skips mkdir when _slots/ already exists', async () => {
    adapter.dirs.push('_slots')
    const sm = new SlotsManager(adapter)
    await sm.writeSlot('pending', 'item 1\nitem 2')

    expect(adapter.mkdir).not.toHaveBeenCalled()
    expect(adapter.files['_slots/pending.md']).toContain('item 1')
  })

  it('writeSlot updates existing file content', async () => {
    adapter.dirs.push('_slots')
    adapter.files['_slots/focus.md'] = 'old content'
    const sm = new SlotsManager(adapter)
    await sm.writeSlot('focus', 'new content')
    expect(adapter.files['_slots/focus.md']).toBe('new content')
  })
})

// TEST-05
describe('SlotsManager module purity', () => {
  it('does not import obsidian', () => {
    const src = readFileSync(resolve(__dirname, '../slots/manager.ts'), 'utf-8')
    expect(src).not.toMatch(/from\s+['"]obsidian['"]/)
    expect(src).not.toMatch(/require\(['"]obsidian['"]\)/)
  })
})
