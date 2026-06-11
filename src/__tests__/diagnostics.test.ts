import { describe, it, expect, vi, beforeEach } from 'vitest'
import { runDiagnostics, toMarkdown } from '../diagnostics/probe'
import type { VaultKeeperSettings } from '../settings'
import { DEFAULT_SETTINGS } from '../settings'

function makeAdapter(overrides: Partial<Record<string, any>> = {}) {
  const files: Record<string, string> = {}
  const dirs: string[] = ['', 'inbox', 'raw', 'wiki', 'wiki/_slots', '.obsidian']
  return {
    files, dirs,
    constructor: { name: 'MockAdapter' },
    list: vi.fn(async (path: string) => {
      const key = path === '/' ? '' : (path || '')
      if (!dirs.includes(key) && key !== '') throw new Error(`ENOENT: ${path}`)
      const prefix = key ? `${key}/` : ''
      const fileList = Object.keys(files).filter(f => {
        const rel = f.startsWith(prefix) ? f.slice(prefix.length) : null
        return rel && !rel.includes('/')
      })
      const folderList: string[] = []
      return { files: fileList, folders: folderList }
    }),
    exists: vi.fn(async (path: string) => dirs.includes(path) || files[path] !== undefined),
    mkdir: vi.fn(async (path: string) => { dirs.push(path) }),
    write: vi.fn(async (path: string, content: string) => { files[path] = content }),
    read: vi.fn(async (path: string) => {
      if (files[path] === undefined) throw new Error(`ENOENT: ${path}`)
      return files[path]
    }),
    remove: vi.fn(async (path: string) => { delete files[path] }),
    stat: vi.fn(async (path: string) => files[path] !== undefined ? { mtime: 0, size: files[path].length } : null),
    ...overrides,
  }
}

function makeVault(adapter: any) {
  return { adapter } as any
}

const settings: VaultKeeperSettings = {
  ...DEFAULT_SETTINGS,
  git: {
    ...DEFAULT_SETTINGS.git,
    enabled: true,
    remote: 'https://github.com/user/testrepo.git',
    token: 'ghp_abcdefghij1234567890',
  },
}

// D-01: runDiagnostics reports list error without throwing (adapter that throws on '/')
describe('runDiagnostics', () => {
  it('D-01: reports list error for "/" without throwing', async () => {
    const adapter = makeAdapter({
      list: vi.fn(async (path: string) => {
        if (path === '/') throw new Error('ENOENT: /')
        return { files: [], folders: [] }
      }),
    })
    const vault = makeVault(adapter)
    const report = await runDiagnostics(vault, settings)
    expect(report['rootList']['list("/")'].ok).toBe(false)
    expect(report['rootList']['list("/")'].error).toContain('ENOENT')
  })

  // D-02: detects divergence list('') ok / list('/') error
  it('D-02: detects divergence list("") ok and list("/") error', async () => {
    const adapter = makeAdapter({
      list: vi.fn(async (path: string) => {
        if (path === '/') throw new Error('ENOENT: /')
        return { files: ['wiki/a.md'], folders: [] }
      }),
    })
    const vault = makeVault(adapter)
    const report = await runDiagnostics(vault, settings)
    expect(report['rootList']['list("")'].ok).toBe(true)
    expect(report['rootList']['list("/")'].ok).toBe(false)
  })

  // D-03: roundtrip reports mkdir failure without throwing
  it('D-03: reports mkdir failure in dataDir without throwing', async () => {
    const adapter = makeAdapter({
      exists: vi.fn(async () => false),
      mkdir: vi.fn(async () => { throw new Error('ENOENT: mkdir failed') }),
      write: vi.fn(async () => { throw new Error('ENOENT: write failed') }),
      read: vi.fn(async () => { throw new Error('ENOENT: read failed') }),
      remove: vi.fn(async () => {}),
    })
    const vault = makeVault(adapter)
    const report = await runDiagnostics(vault, settings)
    expect(report.dataDir.mkdir.ok).toBe(false)
    expect(report.dataDir.mkdir.error).toContain('ENOENT')
    // write also fails
    expect(report.dataDir.write.ok).toBe(false)
  })

  // D-04: toMarkdown includes platform/paths/github without leaking token
  it('D-04: toMarkdown includes key sections and does not leak token', async () => {
    const vault = makeVault(makeAdapter())
    const report = await runDiagnostics(vault, settings)
    const md = toMarkdown(report)
    expect(md).toContain('## A. Plataforma')
    expect(md).toContain('## B. Listagem da raiz')
    expect(md).toContain('## C. Paths do vault')
    expect(md).toContain('## D. Roundtrip')
    expect(md).toContain('## E. Configuração GitHub')
    expect(md).toContain('## F. Dry-run push')
    expect(md).toContain('user/testrepo')
    // token must NOT appear
    expect(md).not.toContain('ghp_abcdefghij1234567890')
    // token length should appear instead
    expect(md).toContain('chars')
  })

  // D-05: dry-run push counts .md files and does not call requestUrl
  it('D-05: dry-run push counts md files and makes no API calls', async () => {
    const adapter = makeAdapter()
    adapter.files['wiki/page1.md'] = '---\ntitle: A\n---'
    adapter.files['wiki/page2.md'] = '---\ntitle: B\n---'
    adapter.files['inbox/note.md'] = 'raw note'
    adapter.dirs.push('wiki')
    adapter.list = vi.fn(async (path: string) => {
      const map: Record<string, { files: string[]; folders: string[] }> = {
        '':      { files: [], folders: ['wiki', 'inbox'] },
        'wiki':  { files: ['page1.md', 'page2.md'], folders: [] },
        'inbox': { files: ['note.md'], folders: [] },
      }
      return map[path] ?? { files: [], folders: [] }
    })
    adapter.stat = vi.fn(async (path: string) =>
      adapter.files[path] !== undefined ? { mtime: 0, size: adapter.files[path].length } : null,
    )

    const { requestUrl } = await import('obsidian')
    const vault = makeVault(adapter)
    const report = await runDiagnostics(vault, settings)
    expect(report.pushDryRun.ok).toBe(true)
    expect(report.pushDryRun.value).toContain('3 md files found')
    expect(vi.mocked(requestUrl)).not.toHaveBeenCalled()
  })
})
