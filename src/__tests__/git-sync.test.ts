import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock obsidian (requestUrl + Vault)
vi.mock('obsidian', () => ({
  requestUrl: vi.fn(),
}))

const { mockGit } = vi.hoisted(() => ({
  mockGit: {
    currentBranch: vi.fn(),
    statusMatrix: vi.fn(),
    pull: vi.fn(),
    add: vi.fn(),
    commit: vi.fn(),
    push: vi.fn(),
    log: vi.fn(),
  },
}))

vi.mock('isomorphic-git', () => mockGit)

import { GitSync } from '../git/sync'
import type { GitSettings } from '../settings'

function mockVault() {
  return {
    adapter: {
      readBinary: vi.fn().mockResolvedValue(new ArrayBuffer(0)),
      writeBinary: vi.fn(),
      remove: vi.fn(),
      list: vi.fn().mockResolvedValue({ files: [], folders: [] }),
      mkdir: vi.fn(),
      rmdir: vi.fn(),
      stat: vi.fn().mockResolvedValue(null),
      basePath: '/test-vault',
    },
  } as any
}

function testSettings(overrides: Partial<GitSettings> = {}): { git: GitSettings } {
  return {
    git: {
      enabled: true,
      remote: 'https://github.com/user/vault.git',
      username: 'test',
      token: 'ghp_test123',
      authorName: 'Test User',
      authorEmail: 'test@test.com',
      autoSyncMinutes: 0,
      ...overrides,
    },
  }
}

describe('GitSync', () => {
  let vault: ReturnType<typeof mockVault>

  beforeEach(() => {
    vault = mockVault()
    vi.clearAllMocks()
  })

  describe('constructor', () => {
    it('usa basePath do adapter como dir', () => {
      const gs = new GitSync(vault, testSettings())
      expect(gs).toBeDefined()
    })
  })

  describe('status()', () => {
    it('retorna branch e mudanças locais', async () => {
      mockGit.currentBranch.mockResolvedValue('main')
      mockGit.statusMatrix.mockResolvedValue([
        ['README.md', 1, 1, 1],
        ['inbox/new.md', 1, 2, 2],
        ['wiki/page.md', 1, 0, 0],
      ])
      mockGit.log.mockResolvedValue([
        { oid: 'abc1234', commit: { message: 'test' } },
      ])

      const gs = new GitSync(vault, testSettings())
      const result = await gs.status()

      expect(result.branch).toBe('main')
      expect(result.localChanges).toEqual(['inbox/new.md', 'wiki/page.md'])
      expect(result.unpushedCommits).toBe(1)
      expect(result.error).toBeUndefined()
    })

    it('retorna erro se git desabilitado', async () => {
      const gs = new GitSync(vault, testSettings({ enabled: false }))
      const result = await gs.status()
      expect(result.error).toContain('desabilitado')
    })

    it('captura exceção como error string', async () => {
      mockGit.currentBranch.mockRejectedValue(new Error('not a git repo'))
      const gs = new GitSync(vault, testSettings())
      const result = await gs.status()
      expect(result.error).toBe('not a git repo')
      expect(result.branch).toBe('unknown')
    })
  })

  describe('sync()', () => {
    it('lança erro se git desabilitado', async () => {
      const gs = new GitSync(vault, testSettings({ enabled: false }))
      await expect(gs.sync()).rejects.toThrow('desabilitado')
    })

    it('lança erro se sem remote', async () => {
      const gs = new GitSync(vault, testSettings({ remote: '' }))
      await expect(gs.sync()).rejects.toThrow('Remote URL')
    })

    it('executa fluxo completo: pull → add → commit → push', async () => {
      mockGit.currentBranch.mockResolvedValue('main')
      mockGit.pull.mockResolvedValue(undefined)
      mockGit.statusMatrix.mockResolvedValue([['new-file.md', 1, 2, 2]])
      mockGit.add.mockResolvedValue(undefined)
      mockGit.commit.mockResolvedValue('def5678')
      mockGit.push.mockResolvedValue({ ok: true, error: null, refs: {} })

      const gs = new GitSync(vault, testSettings())
      const result = await gs.sync()

      expect(mockGit.pull).toHaveBeenCalledTimes(1)
      expect(mockGit.add).toHaveBeenCalledWith(
        expect.objectContaining({ filepath: 'new-file.md' }),
      )
      expect(mockGit.commit).toHaveBeenCalledTimes(1)
      expect(mockGit.push).toHaveBeenCalledTimes(1)
      expect(result.pulled).toBe(1)
      expect(result.pushed).toBe(1)
      expect(result.branch).toBe('main')
    })

    it('continua mesmo se pull falhar', async () => {
      mockGit.currentBranch.mockResolvedValue('main')
      mockGit.pull.mockRejectedValue(new Error('fast-forward failed'))
      mockGit.statusMatrix.mockResolvedValue([])
      mockGit.push.mockResolvedValue({ ok: true, error: null, refs: {} })

      const gs = new GitSync(vault, testSettings())
      const result = await gs.sync()

      expect(result.pulled).toBe(0)
      expect(result.commits.some((c) => c.includes('ignorado'))).toBe(true)
      expect(result.pushed).toBe(1)
    })

    it('lança erro se push falhar', async () => {
      mockGit.currentBranch.mockResolvedValue('main')
      mockGit.pull.mockResolvedValue(undefined)
      mockGit.statusMatrix.mockResolvedValue([])
      mockGit.push.mockRejectedValue(new Error('401 Unauthorized'))

      const gs = new GitSync(vault, testSettings())
      await expect(gs.sync()).rejects.toThrow('401')
    })
  })

  describe('recentCommits()', () => {
    it('retorna lista formatada de commits', async () => {
      mockGit.log.mockResolvedValue([
        { oid: 'aaa1111', commit: { message: 'fix: typo' } },
        { oid: 'bbb2222', commit: { message: 'feat: inbox view' } },
      ])

      const gs = new GitSync(vault, testSettings())
      const commits = await gs.recentCommits(2)

      expect(commits).toHaveLength(2)
      expect(commits[0]).toContain('aaa1111')
      expect(commits[0]).toContain('fix: typo')
    })

    it('retorna fallback em caso de erro', async () => {
      mockGit.log.mockRejectedValue(new Error('no repo'))
      const gs = new GitSync(vault, testSettings())
      const commits = await gs.recentCommits()
      expect(commits[0]).toContain('sem commits')
    })
  })
})
