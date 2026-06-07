import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createVaultFs } from '../git/vault-fs'

/**
 * Mock do Obsidian Vault adapter.
 * Simula um vault em memória para testar o VaultFS sem Obsidian real.
 */
function mockVault() {
  const files = new Map<string, Uint8Array>()

  return {
    adapter: {
      readBinary: vi.fn(async (path: string) => {
        const data = files.get(path)
        if (!data) throw new Error(`ENOENT: ${path}`)
        return data.buffer
      }),

      writeBinary: vi.fn(async (path: string, data: ArrayBuffer) => {
        files.set(path, new Uint8Array(data))
      }),

      remove: vi.fn(async (path: string) => {
        if (!files.has(path)) throw new Error(`ENOENT: ${path}`)
        files.delete(path)
      }),

      list: vi.fn(async (_path: string) => {
        // Retorna todos os arquivos no "vault" mock
        const fileNames = Array.from(files.keys()).filter(
          (f) => !f.includes('/.git/'),
        )
        const folders = new Set<string>()
        for (const f of fileNames) {
          const parts = f.split('/')
          for (let i = 1; i < parts.length; i++) {
            folders.add(parts.slice(0, i).join('/'))
          }
        }
        return {
          files: fileNames.filter((f) => !f.includes('/', f.indexOf('/') + 1) ? false : false),
          folders: Array.from(folders),
        }
      }),

      mkdir: vi.fn(async (_path: string) => {
        // No-op no mock
      }),

      rmdir: vi.fn(async (_path: string, _recursive?: boolean) => {
        // No-op no mock
      }),

      stat: vi.fn(async (path: string) => {
        if (files.has(path)) {
          return {
            type: 'file' as const,
            ctime: Date.now(),
            mtime: Date.now(),
            size: files.get(path)!.length,
          }
        }
        return null
      }),
    },
  } as any
}

describe('createVaultFs', () => {
  let vault: ReturnType<typeof mockVault>
  let fs: ReturnType<typeof createVaultFs>

  beforeEach(() => {
    vault = mockVault()
    fs = createVaultFs(vault as any)
  })

  it('writeFile e readFile — escreve e lê arquivo', async () => {
    const content = new TextEncoder().encode('hello vault')
    await fs.promises.writeFile('test.md', content)
    const result = await fs.promises.readFile('test.md')

    expect(result).toBeInstanceOf(Uint8Array)
    expect(new TextDecoder().decode(result)).toBe('hello vault')
  })

  it('writeFile com string — aceita string', async () => {
    await fs.promises.writeFile('note.md', '# Title')
    const result = await fs.promises.readFile('note.md')

    expect(new TextDecoder().decode(result)).toBe('# Title')
  })

  it('readFile — lança erro para arquivo inexistente', async () => {
    await expect(fs.promises.readFile('nonexistent.md')).rejects.toThrow(
      'ENOENT',
    )
  })

  it('unlink — remove arquivo', async () => {
    await fs.promises.writeFile('tmp.md', 'temp')
    await fs.promises.unlink('tmp.md')

    await expect(fs.promises.readFile('tmp.md')).rejects.toThrow('ENOENT')
  })

  it('stat — retorna metadados de arquivo', async () => {
    await fs.promises.writeFile('doc.md', 'content here')

    const s = await fs.promises.stat('doc.md')
    expect(s.type).toBe('file')
    expect(s.size).toBe(12) // "content here"
    expect(s.mtimeMs).toBeGreaterThan(0)
  })

  it('stat — retorna type dir para pastas', async () => {
    // Mock stat retorna folder
    vault.adapter.stat.mockResolvedValueOnce({
      type: 'folder',
      ctime: Date.now(),
      mtime: Date.now(),
      size: 0,
    })

    const s = await fs.promises.stat('wiki')
    expect(s.type).toBe('dir')
  })

  it('lstat — igual stat (sem symlinks no Obsidian)', async () => {
    await fs.promises.writeFile('file.md', 'data')

    const statResult = await fs.promises.stat('file.md')
    const lstatResult = await fs.promises.lstat('file.md')

    expect(lstatResult.type).toBe(statResult.type)
    expect(lstatResult.size).toBe(statResult.size)
  })

  it('readlink — lança ENOSYS', async () => {
    await expect(fs.promises.readlink('link')).rejects.toThrow('ENOSYS')
  })

  it('symlink — lança ENOSYS', async () => {
    await expect(fs.promises.symlink('a', 'b')).rejects.toThrow('ENOSYS')
  })

  it('chmod — no-op, não lança erro', async () => {
    await fs.promises.writeFile('f.md', 'x')
    await expect(fs.promises.chmod('f.md', 0o755)).resolves.toBeUndefined()
  })
})
