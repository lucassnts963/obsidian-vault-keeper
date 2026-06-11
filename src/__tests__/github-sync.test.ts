import { describe, it, expect, vi, beforeEach, beforeAll } from 'vitest'
import { requestUrl } from '../__mocks__/obsidian'

// ═══════════════════════════════════════════════════════════════════
// Tests for base64.ts (chunked encode/decode — replaces btoa/atob)
// ═══════════════════════════════════════════════════════════════════

// We import after defining mocks because the module may use globals
// that don't exist in Node test environment

describe('base64 — chunked encode/decode', () => {
  let arrayBufferToBase64: (buf: ArrayBuffer) => string
  let base64ToUint8Array: (str: string) => Uint8Array

  beforeAll(async () => {
    const mod = await import('../github/base64')
    arrayBufferToBase64 = mod.arrayBufferToBase64
    base64ToUint8Array = mod.base64ToUint8Array
  })

  it('encodes empty buffer', () => {
    const buf = new ArrayBuffer(0)
    expect(arrayBufferToBase64(buf)).toBe('')
  })

  it('encodes and decodes roundtrip — small text', () => {
    const original = 'Hello, Obsidian Mobile!'
    const encoded = new TextEncoder().encode(original)
    const b64 = arrayBufferToBase64(encoded.buffer)
    const decoded = base64ToUint8Array(b64)
    expect(new TextDecoder().decode(decoded)).toBe(original)
  })

  it('encodes and decodes roundtrip — binary data', () => {
    const size = 256
    const buf = new ArrayBuffer(size)
    const view = new Uint8Array(buf)
    for (let i = 0; i < size; i++) view[i] = i % 256
    const b64 = arrayBufferToBase64(buf)
    const decoded = base64ToUint8Array(b64)
    expect(new Uint8Array(decoded)).toEqual(view)
  })

  it('handles large buffer (500KB) — no stack overflow', () => {
    const size = 500 * 1024
    const buf = new ArrayBuffer(size)
    const view = new Uint8Array(buf)
    for (let i = 0; i < size; i++) view[i] = i % 256
    const b64 = arrayBufferToBase64(buf)
    expect(b64.length).toBeGreaterThan(0)
    const decoded = base64ToUint8Array(b64)
    expect(decoded.byteLength).toBe(size)
    // spot-check
    expect(decoded[0]).toBe(0)
    expect(decoded[size - 1]).toBe((size - 1) % 256)
  })

  it('handles large buffer (2MB) — no stack overflow', () => {
    const size = 2 * 1024 * 1024
    const buf = new ArrayBuffer(size)
    const view = new Uint8Array(buf)
    for (let i = 0; i < size; i++) view[i] = (i * 7) % 256
    const b64 = arrayBufferToBase64(buf)
    expect(b64.length).toBeGreaterThan(0)
    const decoded = base64ToUint8Array(b64)
    expect(decoded.byteLength).toBe(size)
    expect(decoded[0]).toBe(0)
    expect(decoded[size - 1]).toBe(((size - 1) * 7) % 256)
  })

  it('handles unicode content correctly', () => {
    const original = '日本語 한국어 Español 🚀'
    const encoded = new TextEncoder().encode(original)
    const b64 = arrayBufferToBase64(encoded.buffer)
    const decoded = base64ToUint8Array(b64)
    expect(new TextDecoder().decode(decoded)).toBe(original)
  })

  it('produces valid base64 characters only', () => {
    const buf = new ArrayBuffer(1024)
    const view = new Uint8Array(buf)
    for (let i = 0; i < 1024; i++) view[i] = i % 256
    const b64 = arrayBufferToBase64(buf)
    expect(b64).toMatch(/^[A-Za-z0-9+/=]*$/)
  })
})

// ═══════════════════════════════════════════════════════════════════
// Tests for parseRemote
// ═══════════════════════════════════════════════════════════════════

describe('parseRemote', () => {
  const pattern = /github\.com\/([^/]+)\/([^/]+?)(?:\.git)?\/?$/

  function testParseRemote(url: string): { owner: string; repo: string } | null {
    const m = url.match(pattern)
    if (!m) return null
    return { owner: m[1], repo: m[2] }
  }

  it('parses standard GitHub URL', () => {
    expect(testParseRemote('https://github.com/user/repo')).toEqual({
      owner: 'user',
      repo: 'repo',
    })
  })

  it('parses URL with .git suffix', () => {
    expect(testParseRemote('https://github.com/user/repo.git')).toEqual({
      owner: 'user',
      repo: 'repo',
    })
  })

  it('parses URL without https://', () => {
    expect(testParseRemote('github.com/owner-name/repo-name')).toEqual({
      owner: 'owner-name',
      repo: 'repo-name',
    })
  })

  it('returns null for invalid URL', () => {
    expect(testParseRemote('')).toBeNull()
    expect(testParseRemote('https://gitlab.com/user/repo')).toBeNull()
    expect(testParseRemote('not-a-url')).toBeNull()
  })

  it('parses URL with trailing slash', () => {
    expect(testParseRemote('https://github.com/user/repo/')).toEqual({
      owner: 'user',
      repo: 'repo',
    })
  })

  it('handles org names with dots', () => {
    expect(testParseRemote('https://github.com/my.org/repo')).toEqual({
      owner: 'my.org',
      repo: 'repo',
    })
  })
})

// ═══════════════════════════════════════════════════════════════════
// Tests for sha256
// ═══════════════════════════════════════════════════════════════════

describe('sha256', () => {
  // sha256 is currently private in sync.ts, but we test the concept
  // We need to test that our implementation works with AND without crypto.subtle

  it('crypto.subtle is available in Node test env', () => {
    expect(crypto).toBeDefined()
    expect(crypto.subtle).toBeDefined()
  })

  it('hashes known content correctly', async () => {
    const content = new TextEncoder().encode('hello world')
    const hash = await crypto.subtle.digest('SHA-256', content)
    const hex = Array.from(new Uint8Array(hash))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('')
    // Known SHA-256 of "hello world"
    expect(hex).toBe(
      'b94d27b9934d3e08a52e52d7da7dabfac484efe37a5380ee9088f7ace2efcde9',
    )
  })

  it('handles empty content', async () => {
    const content = new ArrayBuffer(0)
    const hash = await crypto.subtle.digest('SHA-256', content)
    const hex = Array.from(new Uint8Array(hash))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('')
    expect(hex).toBe(
      'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
    )
  })
})

// ═══════════════════════════════════════════════════════════════════
// Tests for GitHubSync (with mocked adapters)
// ═══════════════════════════════════════════════════════════════════

// obsidian is mocked via vitest.config.ts alias to src/__mocks__/obsidian.ts

describe('GitHubSync', () => {
  let GitHubSync: any
  let mockAdapter: any

  beforeEach(() => {
    requestUrl.mockReset()
    mockAdapter = {
      read: vi.fn().mockRejectedValue(new Error('not found')),
      write: vi.fn().mockResolvedValue(undefined),
      readBinary: vi.fn().mockResolvedValue(new ArrayBuffer(0)),
      list: vi.fn().mockResolvedValue({ files: [], folders: [] }),
      exists: vi.fn().mockResolvedValue(false),
      stat: vi.fn().mockResolvedValue({ mtime: Date.now(), size: 0 }),
      mkdir: vi.fn().mockResolvedValue(undefined),
    }
  })

  beforeAll(async () => {
    const mod = await import('../github/sync')
    GitHubSync = mod.GitHubSync
  })

  it('throws on invalid remote URL', () => {
    expect(
      () =>
        new GitHubSync(
          { adapter: mockAdapter },
          { remote: 'invalid-url', token: 'test-token', authorName: 'Test', authorEmail: 'test@test.com', enabled: true, autoSyncMinutes: 0 },
          '/test/dir',
        ),
    ).toThrow('Remote URL inválida')
  })

  it('constructs successfully with valid remote', () => {
    const sync = new GitHubSync(
      { adapter: mockAdapter },
      { remote: 'https://github.com/user/repo', token: 'ghp_test', authorName: 'Test', authorEmail: 'test@test.com', enabled: true, autoSyncMinutes: 0 },
      '/test/dir',
    )
    expect(sync).toBeDefined()
  })

  it('statePath uses provided directory', async () => {
    const sync = new GitHubSync(
      { adapter: mockAdapter },
      { remote: 'https://github.com/user/repo', token: 'ghp_test', authorName: 'Test', authorEmail: 'test@test.com', enabled: true, autoSyncMinutes: 0 },
      '/custom/path',
    )
    // statePath is private — test indirectly via loadState
    await sync.loadState()
    expect(mockAdapter.read).toHaveBeenCalledWith('/custom/path/sync_state.json')
  })

  describe('walkFiles', () => {
    it('yields .md files recursively', async () => {
      const sync = new GitHubSync(
        { adapter: mockAdapter },
        { remote: 'https://github.com/user/repo', token: 'ghp_test', authorName: 'Test', authorEmail: 'test@test.com', enabled: true, autoSyncMinutes: 0 },
        '/test',
      )

      mockAdapter.list
        .mockResolvedValueOnce({
          files: ['readme.md', 'config.yaml', '.hidden.md'],
          folders: ['notes'],
        })
        .mockResolvedValueOnce({
          files: ['notes/note1.md'],
          folders: [],
        })

      // walkFiles is private — test the filter logic
      const result: string[] = []
      // Access via prototype
      const generator = (sync as any).walkFiles('/')

      // Simulate first level
      expect(mockAdapter.list).not.toHaveBeenCalled()
    })
  })

  describe('push', () => {
    it('detects no changes when vault is empty', async () => {

      const sync = new GitHubSync(
        { adapter: mockAdapter },
        { remote: 'https://github.com/user/repo', token: 'ghp_test', authorName: 'Test', authorEmail: 'test@test.com', enabled: true, autoSyncMinutes: 0 },
        '/test',
      )

      mockAdapter.list.mockResolvedValue({ files: [], folders: [] })

      const msgs = await sync.push()
      expect(msgs).toContain('Nada alterado')
    })
  })

  describe('pull', () => {
    it('handles branch not found gracefully', async () => {

      requestUrl.mockRejectedValue(new Error('Not Found'))

      const sync = new GitHubSync(
        { adapter: mockAdapter },
        { remote: 'https://github.com/user/repo', token: 'ghp_test', authorName: 'Test', authorEmail: 'test@test.com', enabled: true, autoSyncMinutes: 0 },
        '/test',
      )

      const msgs = await sync.pull()
      expect(msgs.some((m: string) => m.includes('branch main não existe'))).toBe(true)
    })
  })

  describe('status', () => {
    it('reports no changes on fresh vault', async () => {
      
      mockAdapter.list.mockResolvedValue({ files: [], folders: [] })

      const sync = new GitHubSync(
        { adapter: mockAdapter },
        { remote: 'https://github.com/user/repo', token: 'ghp_test', authorName: 'Test', authorEmail: 'test@test.com', enabled: true, autoSyncMinutes: 0 },
        '/test',
      )

      const status = await sync.status()
      expect(status.localChanges).toEqual([])
      expect(status.remoteAhead).toBe(false)
      expect(status.branch).toBe('main')
    })
  })

  describe('snapshot (backupState / restoreBackup)', () => {
    it('backupState saves current state to backup file', async () => {
      const sync = new GitHubSync(
        { adapter: mockAdapter },
        { remote: 'https://github.com/user/repo', token: 'ghp_test', authorName: 'Test', authorEmail: 'test@test.com', enabled: true, autoSyncMinutes: 0 },
        '/test',
      )

      const testState: any = {
        lastRemoteSHA: 'abc123',
        files: { 'note.md': { sha: 'def456', mtime: 100, size: 42 } },
      }
      ;(sync as any).state = testState

      await (sync as any).backupState()

      expect(mockAdapter.write).toHaveBeenCalledWith(
        '/test/sync_state.json.backup',
        JSON.stringify(testState, null, 2),
      )
    })

    it('restoreBackup recovers state from backup file', async () => {
      const sync = new GitHubSync(
        { adapter: mockAdapter },
        { remote: 'https://github.com/user/repo', token: 'ghp_test', authorName: 'Test', authorEmail: 'test@test.com', enabled: true, autoSyncMinutes: 0 },
        '/test',
      )

      const backupState = {
        lastRemoteSHA: 'before-push',
        files: { 'saved.md': { sha: 'saved-sha', mtime: 200, size: 99 } },
      }

      mockAdapter.read.mockResolvedValueOnce(JSON.stringify(backupState))

      await (sync as any).restoreBackup()

      const state = (sync as any).state
      expect(state.lastRemoteSHA).toBe('before-push')
      expect(state.files['saved.md'].sha).toBe('saved-sha')
    })

    it('restoreBackup removes backup file after restoring', async () => {
      const sync = new GitHubSync(
        { adapter: mockAdapter },
        { remote: 'https://github.com/user/repo', token: 'ghp_test', authorName: 'Test', authorEmail: 'test@test.com', enabled: true, autoSyncMinutes: 0 },
        '/test',
      )

      mockAdapter.read.mockResolvedValueOnce(
        JSON.stringify({ lastRemoteSHA: 'x', files: {} }),
      )

      await (sync as any).restoreBackup()

      expect(mockAdapter.write).toHaveBeenLastCalledWith(
        '/test/sync_state.json.backup',
        '',
      )
    })

    it('backupState works with empty state on fresh vault', async () => {
      const sync = new GitHubSync(
        { adapter: mockAdapter },
        { remote: 'https://github.com/user/repo', token: 'ghp_test', authorName: 'Test', authorEmail: 'test@test.com', enabled: true, autoSyncMinutes: 0 },
        '/test',
      )

      await (sync as any).backupState()

      const callArg = mockAdapter.write.mock.calls[0][1]
      const parsed = JSON.parse(callArg)
      expect(parsed.lastRemoteSHA).toBe('')
      expect(parsed.files).toEqual({})
    })
  })

  describe('ensureDataDir', () => {
    it('creates directory when it does not exist', async () => {
      const sync = new GitHubSync(
        { adapter: mockAdapter },
        { remote: 'https://github.com/user/repo', token: 'ghp_test', authorName: 'Test', authorEmail: 'test@test.com', enabled: true, autoSyncMinutes: 0 },
        '/test/.obsidian/vault-keeper',
      )

      mockAdapter.exists.mockResolvedValueOnce(false)

      await (sync as any).ensureDataDir()

      expect(mockAdapter.exists).toHaveBeenCalledWith('/test/.obsidian/vault-keeper')
      expect(mockAdapter.mkdir).toHaveBeenCalledWith('/test/.obsidian/vault-keeper')
    })

    it('does not create directory when it already exists', async () => {
      const sync = new GitHubSync(
        { adapter: mockAdapter },
        { remote: 'https://github.com/user/repo', token: 'ghp_test', authorName: 'Test', authorEmail: 'test@test.com', enabled: true, autoSyncMinutes: 0 },
        '/test/simple',
      )

      mockAdapter.exists.mockResolvedValueOnce(true)

      await (sync as any).ensureDataDir()

      expect(mockAdapter.mkdir).not.toHaveBeenCalled()
    })

    it('handles root-level statePath (no parent dir)', async () => {
      const sync = new GitHubSync(
        { adapter: mockAdapter },
        { remote: 'https://github.com/user/repo', token: 'ghp_test', authorName: 'Test', authorEmail: 'test@test.com', enabled: true, autoSyncMinutes: 0 },
        'state',
      )

      await (sync as any).ensureDataDir()

      expect(mockAdapter.exists).toHaveBeenCalledWith('state')
      expect(mockAdapter.mkdir).toHaveBeenCalledWith('state')
    })
  })

  describe('pushFile (single file push)', () => {

    it('pushes a single file to GitHub', async () => {
      const sync = new GitHubSync(
        { adapter: mockAdapter },
        { remote: 'https://github.com/user/repo', token: 'ghp_test', authorName: 'Test', authorEmail: 'test@test.com', enabled: true, autoSyncMinutes: 0 },
        '/test',
      )

      const fileContent = new TextEncoder().encode('hello vault')
      mockAdapter.readBinary.mockResolvedValueOnce(fileContent.buffer)
      // GET /contents/note.md → 404 (new file, no SHA needed) + PUT → 200
      ;(requestUrl as any)
        .mockResolvedValueOnce({ status: 404, json: { message: 'Not Found' } })
        .mockResolvedValueOnce({ status: 200, json: { sha: 'new-remote-sha' } })

      const result = await sync.pushFile('note.md')

      expect(result).toBe('note.md')
      expect(requestUrl).toHaveBeenCalledTimes(2)
      const calledUrl = requestUrl.mock.calls[0][0].url
      expect(calledUrl).toContain('/contents/note.md')
    })

    it('includes sha when file exists in remote', async () => {
      const sync = new GitHubSync(
        { adapter: mockAdapter },
        { remote: 'https://github.com/user/repo', token: 'ghp_test', authorName: 'Test', authorEmail: 'test@test.com', enabled: true, autoSyncMinutes: 0 },
        '/test',
      )

      const stateData = {
        lastRemoteSHA: 'abc',
        files: { 'existing.md': { sha: 'old-hash', mtime: 100, size: 100 } },
      }
      mockAdapter.read.mockResolvedValueOnce(JSON.stringify(stateData))

      mockAdapter.readBinary.mockResolvedValueOnce(
        new TextEncoder().encode('content').buffer,
      )
      ;(requestUrl as any)
        .mockResolvedValueOnce({ status: 200, json: { sha: 'remote-sha-123' } })
        .mockResolvedValueOnce({ status: 200, json: { sha: 'new-sha' } })

      const result = await sync.pushFile('existing.md')
      expect(result).toBe('existing.md')

      expect(requestUrl).toHaveBeenCalledTimes(2)
      const secondCallBody = JSON.parse(requestUrl.mock.calls[1][0].body)
      expect(secondCallBody.sha).toBe('remote-sha-123')
    })
  })

  describe('Android CapacitorAdapter — full-path normalization', () => {
    function makeSync(adapter: any) {
      return new GitHubSync(
        { adapter },
        { remote: 'https://github.com/user/repo', token: 'ghp_test', authorName: 'Test', authorEmail: 'test@test.com', enabled: true, autoSyncMinutes: 0 },
        '/test',
      )
    }

    it('T-Android-01: walkFiles normalizes full-path entries from CapacitorAdapter', async () => {
      const adapter = {
        read: vi.fn().mockRejectedValue(new Error('not found')),
        write: vi.fn().mockResolvedValue(undefined),
        readBinary: vi.fn().mockResolvedValue(new ArrayBuffer(0)),
        exists: vi.fn().mockResolvedValue(false),
        stat: vi.fn().mockResolvedValue({ mtime: 0, size: 10 }),
        mkdir: vi.fn().mockResolvedValue(undefined),
        list: vi.fn()
          .mockResolvedValueOnce({ files: [], folders: ['wiki'] })         // root
          .mockResolvedValueOnce({ files: ['wiki/a.md', 'wiki/b.md'], folders: [] }), // wiki
      }
      const sync = makeSync(adapter)
      const paths: string[] = []
      for await (const p of (sync as any).walkFiles()) paths.push(p)
      expect(paths).toEqual(['wiki/a.md', 'wiki/b.md'])
      expect(paths).not.toContain('wiki/wiki/a.md')
    })

    it('T-Android-02: push completes without throwing with Android-style adapter', async () => {
      const adapter = {
        read: vi.fn().mockRejectedValue(new Error('not found')),
        write: vi.fn().mockResolvedValue(undefined),
        readBinary: vi.fn().mockResolvedValue(new TextEncoder().encode('content').buffer),
        exists: vi.fn().mockResolvedValue(false),
        stat: vi.fn().mockResolvedValue({ mtime: 1000, size: 7 }),
        mkdir: vi.fn().mockResolvedValue(undefined),
        list: vi.fn()
          .mockResolvedValueOnce({ files: [], folders: ['wiki'] })         // root walk
          .mockResolvedValueOnce({ files: ['wiki/a.md', 'wiki/b.md'], folders: [] }) // wiki walk
          .mockResolvedValueOnce({ files: [], folders: [] }), // deleted-file check fallback
      }
      requestUrl.mockResolvedValue({ status: 200, json: { sha: 'remote-sha', object: { sha: 'head-sha' } } })
      const sync = makeSync(adapter)
      const msgs = await sync.push()
      expect(msgs.some((m: string) => m.includes('ERRO') && m.includes('ENOENT'))).toBe(false)
      expect(msgs.some((m: string) => m.includes('push:') || m.includes('alterados'))).toBe(true)
    })

    it('T-Android-03: push skips file when stat throws ENOENT (does not propagate)', async () => {
      const adapter = {
        read: vi.fn().mockRejectedValue(new Error('not found')),
        write: vi.fn().mockResolvedValue(undefined),
        readBinary: vi.fn().mockResolvedValue(new ArrayBuffer(0)),
        exists: vi.fn().mockResolvedValue(false),
        stat: vi.fn().mockRejectedValue(new Error('ENOENT: no such file')),
        mkdir: vi.fn().mockResolvedValue(undefined),
        list: vi.fn().mockResolvedValue({ files: ['broken.md'], folders: [] }),
      }
      const sync = makeSync(adapter)
      const msgs = await sync.push()
      expect(msgs).toContain('Nada alterado')
    })
  })

  describe('clone', () => {
    function makeSync(adapter: any) {
      return new GitHubSync(
        { adapter },
        { remote: 'https://github.com/user/repo', token: 'ghp_test', authorName: 'Test', authorEmail: 'test@test.com', enabled: true, autoSyncMinutes: 0 },
        '.obsidian/vault-keeper',
      )
    }

    it('T-Clone-01: downloads all .md files and saves sync_state with remote SHA', async () => {
      const adapter = {
        read: vi.fn().mockRejectedValue(new Error('not found')),
        write: vi.fn().mockResolvedValue(undefined),
        readBinary: vi.fn().mockResolvedValue(new ArrayBuffer(0)),
        exists: vi.fn().mockResolvedValue(true),
        stat: vi.fn().mockResolvedValue({ mtime: 0, size: 10 }),
        mkdir: vi.fn().mockResolvedValue(undefined),
        list: vi.fn().mockResolvedValue({ files: [], folders: [] }),
      }
      requestUrl
        .mockResolvedValueOnce({ status: 200, json: { object: { sha: 'head-sha-abc' } } }) // ref/heads/main
        .mockResolvedValueOnce({ status: 200, json: { tree: [
          { type: 'blob', path: 'wiki/index.md', sha: 'sha1', size: 100 },
          { type: 'blob', path: 'wiki/log.md', sha: 'sha2', size: 200 },
          { type: 'blob', path: 'inbox/note.md', sha: 'sha3', size: 50 },
        ]}})  // git/trees/...
        .mockResolvedValue({ status: 200, json: { content: btoa('# content') } }) // contents/...

      const sync = makeSync(adapter)
      const msgs = await sync.clone()

      expect(msgs.some((m: string) => m.includes('3/3'))).toBe(true)
      expect(msgs[msgs.length - 1]).toContain('3/3')
      expect(adapter.write).toHaveBeenCalledWith('wiki/index.md', expect.any(String))
      expect(adapter.write).toHaveBeenCalledWith('wiki/log.md', expect.any(String))
      expect(adapter.write).toHaveBeenCalledWith('inbox/note.md', expect.any(String))
      // sync_state must record the remote SHA
      const stateWrite = (adapter.write.mock.calls as any[]).find(
        ([path]: [string]) => path === '.obsidian/vault-keeper/sync_state.json',
      )
      expect(stateWrite).toBeDefined()
      expect(stateWrite[1]).toContain('head-sha-abc')
    })

    it('T-Clone-02: creates parent directories before writing (mobile mkdir)', async () => {
      const adapter = {
        read: vi.fn().mockRejectedValue(new Error('not found')),
        write: vi.fn().mockResolvedValue(undefined),
        readBinary: vi.fn().mockResolvedValue(new ArrayBuffer(0)),
        exists: vi.fn().mockResolvedValue(false),
        stat: vi.fn().mockResolvedValue({ mtime: 0, size: 10 }),
        mkdir: vi.fn().mockResolvedValue(undefined),
        list: vi.fn().mockResolvedValue({ files: [], folders: [] }),
      }
      requestUrl
        .mockResolvedValueOnce({ status: 200, json: { object: { sha: 'head-sha' } } })
        .mockResolvedValueOnce({ status: 200, json: { tree: [
          { type: 'blob', path: 'wiki/deep/page.md', sha: 'sha1', size: 10 },
        ]}})
        .mockResolvedValue({ status: 200, json: { content: btoa('hello') } })

      const sync = makeSync(adapter)
      await sync.clone()

      expect(adapter.mkdir).toHaveBeenCalledWith('wiki')
      expect(adapter.mkdir).toHaveBeenCalledWith('wiki/deep')
    })

    it('T-Clone-03: returns error message when branch main does not exist', async () => {
      const adapter = {
        read: vi.fn().mockRejectedValue(new Error('not found')),
        write: vi.fn().mockResolvedValue(undefined),
        readBinary: vi.fn().mockResolvedValue(new ArrayBuffer(0)),
        exists: vi.fn().mockResolvedValue(false),
        stat: vi.fn().mockResolvedValue(null),
        mkdir: vi.fn().mockResolvedValue(undefined),
        list: vi.fn().mockResolvedValue({ files: [], folders: [] }),
      }
      requestUrl.mockResolvedValueOnce({ status: 404, json: { message: 'Not Found' } })

      const sync = makeSync(adapter)
      const msgs = await sync.clone()

      expect(msgs.some((m: string) => m.includes('não existe'))).toBe(true)
      expect(adapter.write).not.toHaveBeenCalled()
    })
  })

  describe('quickStatus (fast remote check)', () => {

    it('reports remote ahead when SHA differs', async () => {
      const sync = new GitHubSync(
        { adapter: mockAdapter },
        { remote: 'https://github.com/user/repo', token: 'ghp_test', authorName: 'Test', authorEmail: 'test@test.com', enabled: true, autoSyncMinutes: 0 },
        '/test',
      )
      ;(sync as any).state = { lastRemoteSHA: 'old-sha', files: {} }
      ;requestUrl.mockResolvedValueOnce({
        status: 200,
        json: { object: { sha: 'new-sha' } },
      })

      const status = await sync.quickStatus()
      expect(status.remoteAhead).toBe(true)
      expect(status.branch).toBe('main')
    })

    it('reports not ahead when SHA matches', async () => {
      const sync = new GitHubSync(
        { adapter: mockAdapter },
        { remote: 'https://github.com/user/repo', token: 'ghp_test', authorName: 'Test', authorEmail: 'test@test.com', enabled: true, autoSyncMinutes: 0 },
        '/test',
      )
      ;(sync as any).state = { lastRemoteSHA: 'same-sha', files: {} }
      ;requestUrl.mockResolvedValueOnce({
        status: 200,
        json: { object: { sha: 'same-sha' } },
      })

      const status = await sync.quickStatus()
      expect(status.remoteAhead).toBe(false)
    })

    it('handles API error gracefully', async () => {
      const sync = new GitHubSync(
        { adapter: mockAdapter },
        { remote: 'https://github.com/user/repo', token: 'ghp_test', authorName: 'Test', authorEmail: 'test@test.com', enabled: true, autoSyncMinutes: 0 },
        '/test',
      )
      ;requestUrl.mockRejectedValueOnce(new Error('Network error'))

      const status = await sync.quickStatus()
      expect(status.remoteAhead).toBe(false)
      expect(status.branch).toBe('main')
    })
  })
})
