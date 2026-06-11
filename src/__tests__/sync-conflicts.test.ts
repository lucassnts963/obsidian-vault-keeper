// @vitest-environment node

import { describe, it, expect, vi, beforeEach, beforeAll } from 'vitest'
import { requestUrl } from '../__mocks__/obsidian'

let GitHubSync: any

beforeAll(async () => {
  const m = await import('../github/sync')
  GitHubSync = m.GitHubSync
})

function mockVault() {
  const files: Record<string, string> = {}
  const dirs: string[] = []
  return {
    files, dirs,
    adapter: {
      read: vi.fn(async (path: string) => { if (files[path] !== undefined) return files[path]; throw new Error('ENOENT') }),
      write: vi.fn(async (path: string, content: string) => { files[path] = content }),
      readBinary: vi.fn(async (path: string) => { if (files[path] !== undefined) return new TextEncoder().encode(files[path]).buffer; throw new Error('ENOENT') }),
      list: vi.fn(async (_dir: string) => ({ files: Object.keys(files), folders: [] })),
      exists: vi.fn(async (path: string) => files[path] !== undefined || dirs.includes(path)),
      stat: vi.fn(async (path: string) => {
        if (files[path] !== undefined) return { mtime: Date.now(), size: new TextEncoder().encode(files[path]).length }
        return null
      }),
      mkdir: vi.fn(async (p: string) => { dirs.push(p) }),
    },
  }
}

function makeSync(vault: any, cachedFiles?: Record<string, { sha: string; gitSha?: string; mtime: number; size: number }>) {
  const state: any = { lastRemoteSHA: 'abc', files: cachedFiles || {} }
  vault.files['/test/sync_state.json'] = JSON.stringify(state)
  vault.dirs.push('/test')
  const s = new GitHubSync(vault, {
    enabled: true, remote: 'https://github.com/user/repo', token: 'ghp_test',
    authorName: 'Test', authorEmail: 'test@test.com', autoSyncMinutes: 0,
  }, '/test')
  return s
}

async function hex(ct: string) {
  const h = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(ct))
  return Array.from(new Uint8Array(h)).map(b => b.toString(16).padStart(2, '0')).join('')
}

describe('detectConflicts', () => {
  beforeEach(() => { requestUrl.mockReset() })

  it('returns empty when no local files changed remotely', async () => {
    const v = mockVault()
    const localSHA = await hex('conteudo')
    const sync = makeSync(v, { 'nota.md': { sha: localSHA, gitSha: 'git-sha-abc', mtime: 100, size: 8 } })
    requestUrl.mockResolvedValueOnce({ status: 200, json: { sha: 'git-sha-abc' } })
    const conflicts = await (sync as any).detectConflicts(['nota.md'])
    expect(conflicts).toEqual([])
  })

  it('returns empty when cached.gitSha is unknown (file never pulled)', async () => {
    const v = mockVault()
    const localSHA = await hex('conteudo')
    const sync = makeSync(v, { 'nota.md': { sha: localSHA, mtime: 100, size: 8 } })
    // No API call should happen since gitSha is absent
    const conflicts = await (sync as any).detectConflicts(['nota.md'])
    expect(conflicts).toEqual([])
  })

  it('detects file changed both locally and remotely', async () => {
    const v = mockVault()
    const cachedSHA = await hex('versao antiga')
    const sync = makeSync(v, { 'nota.md': { sha: cachedSHA, gitSha: 'old-git-sha', mtime: 100, size: 12 } })
    await sync.loadState()

    requestUrl.mockResolvedValueOnce({ status: 200, json: { sha: 'remote-different-sha' } })
    const conflicts = await sync.detectConflicts(['nota.md'])
    expect(conflicts.length).toBe(1)
    expect(conflicts[0].path).toBe('nota.md')
  })
})

describe('push with conflicts', () => {
  beforeEach(() => { requestUrl.mockReset() })

  it('saves backup for conflicted files and skips push', async () => {
    const v = mockVault()
    v.files['conflict.md'] = 'minha versao'
    const sync = makeSync(v, { 'conflict.md': { sha: 'old-cached-sha', gitSha: 'old-git-sha', mtime: 100, size: 10 } })

    // detectConflicts call
    requestUrl.mockResolvedValueOnce({ status: 200, json: { sha: 'remote-different-sha' } })
    // final ref update
    requestUrl.mockResolvedValueOnce({ status: 200, json: { object: { sha: 'ref-sha' } } })

    const msgs = await sync.push()
    const joined = msgs.join(' ')
    expect(joined).toContain('conflito')
    expect(v.files['conflict.md.conflict.md']).toBe('minha versao')
  })

  it('pushes non-conflicted files normally', async () => {
    const v = mockVault()
    v.files['safe.md'] = 'conteudo NOVO'
    const oldSHA = await hex('conteudo antigo')
    const sync = makeSync(v, { 'safe.md': { sha: oldSHA, mtime: 100, size: 15 } })

    // detectConflicts — remote has same as cached, so no conflict even though local changed
    requestUrl.mockResolvedValueOnce({ status: 200, json: { sha: oldSHA } })
    // apiPut — push the file
    requestUrl.mockResolvedValueOnce({ status: 200, json: { sha: 'new-blob' } })
    // final ref update
    requestUrl.mockResolvedValueOnce({ status: 200, json: { object: { sha: 'ref-sha' } } })

    const msgs = await sync.push()
    expect(msgs.join(' ')).toContain('push: safe.md')
  })
})

describe('pull with keep-local strategy', () => {
  beforeEach(() => { requestUrl.mockReset() })

  it('skips overwriting local file when strategy is keep-local and local was modified', async () => {
    const v = mockVault()
    v.files['nota.md'] = 'minha versao local modificada'
    const localSHA = await hex('versao antiga')
    const sync = new GitHubSync(v, {
      enabled: true, remote: 'https://github.com/user/repo', token: 'ghp_test',
      authorName: 'T', authorEmail: 't@t.com', autoSyncMinutes: 0,
      conflictStrategy: 'keep-local',
    }, '/test')
    const state = { lastRemoteSHA: 'old-remote', files: { 'nota.md': { sha: localSHA, mtime: 100, size: 12 } } }
    v.files['/test/sync_state.json'] = JSON.stringify(state)
    v.dirs.push('/test')

    // ref
    requestUrl.mockResolvedValueOnce({ status: 200, json: { object: { sha: 'newRemoteSHA' } } })
    // tree
    requestUrl.mockResolvedValueOnce({ status: 200, json: { tree: [{ path: 'nota.md', type: 'blob', sha: 'new-blob', size: 30 }] } })

    await sync.pull()
    // local file should be untouched (keep-local)
    expect(v.files['nota.md']).toBe('minha versao local modificada')
    // no backup created
    expect(v.files['nota.md.backup.md']).toBeUndefined()
  })
})

describe('pull with backup', () => {
  beforeEach(() => { requestUrl.mockReset() })

  it('saves local backup before overwriting with remote', async () => {
    const v = mockVault()
    v.files['nota.md'] = 'minha versao local'
    const sync = makeSync(v, { 'nota.md': { sha: 'old-cached-sha', mtime: 100, size: 10 } })

    // ref
    requestUrl.mockResolvedValueOnce({ status: 200, json: { object: { sha: 'remoteSHA' } } })
    // tree
    requestUrl.mockResolvedValueOnce({ status: 200, json: { tree: [{ path: 'nota.md', type: 'blob', sha: 'new-blob', size: 20 }] } })
    // contents
    requestUrl.mockResolvedValueOnce({ status: 200, json: { content: btoa('versao remota') } })

    await sync.pull()
    expect(v.files['nota.md.backup.md']).toBe('minha versao local')
    expect(v.files['nota.md']).toBe('versao remota')
  })
})
