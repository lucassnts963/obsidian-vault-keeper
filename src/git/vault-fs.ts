import type { Vault, DataAdapter } from 'obsidian'
import type { PromiseFsClient } from 'isomorphic-git'

/**
 * Bridge entre isomorphic-git e Obsidian Vault API.
 *
 * Baseado no MyAdapter do plugin obsidian-git (Vinzent03).
 * Pontos críticos aprendidos:
 * 1. stat() DEVE retornar {isFile(), isDirectory(), isSymbolicLink()}
 * 2. adapter.readBinary() funciona pra .git/ no mobile
 * 3. Sem filtrar dot-dirs — deixa o walker do git decidir
 */
export function createVaultFs(vault: Vault, vaultRoot?: string): PromiseFsClient {
  const adapter: DataAdapter = vault.adapter
  const basePath = vaultRoot ?? (adapter as any).basePath ?? ''
  const baseLen = basePath ? basePath.replace(/\/$/, '').length + 1 : 0

  /** Normaliza caminho absoluto → relativo */
  function rel(path: string): string {
    if (path === '.' || path === '/') return '/'
    if (!basePath || !path.startsWith(basePath)) return path
    let r = path.slice(baseLen)
    if (r.startsWith('/')) r = r.slice(1)
    return r || '/'
  }

  /** Cache do git index pra evitar leituras excessivas */
  let indexCache: ArrayBuffer | undefined
  let indexMtime: number | undefined
  let indexCtime: number | undefined

  return {
    promises: {
      async readFile(path: string): Promise<Uint8Array> {
        const rp = rel(path)

        // Cache do index (igual ao obsidian-git)
        if (rp.endsWith('.git/index') || rp.endsWith('.git\\index')) {
          if (indexCache) return new Uint8Array(indexCache)
          const buf = await adapter.readBinary(rp)
          indexCache = buf
          indexMtime = Date.now()
          indexCtime = Date.now()
          return new Uint8Array(buf)
        }

        const buf = await adapter.readBinary(rp)
        return new Uint8Array(buf)
      },

      async writeFile(path: string, data: Uint8Array | string): Promise<void> {
        const rp = rel(path)
        const buffer =
          typeof data === 'string'
            ? new TextEncoder().encode(data).buffer
            : data.buffer instanceof ArrayBuffer
              ? data.buffer
              : data.buffer

        // Cache do index + write deferred (obsidian-git faz igual)
        if (rp.endsWith('.git/index') || rp.endsWith('.git\\index')) {
          indexCache = buffer as ArrayBuffer
          indexMtime = Date.now()
          // Só escreve quando saveAndClear() for chamado
          return
        }

        await adapter.writeBinary(rp, buffer as ArrayBuffer)
      },

      async unlink(path: string): Promise<void> {
        await adapter.remove(rel(path))
      },

      async readdir(path: string): Promise<string[]> {
        const rp = rel(path) === '.' ? '/' : rel(path)
        const listing = await adapter.list(rp)
        const all = [...listing.files, ...listing.folders]
        // Normaliza paths (obsidian-git faz igual)
        if (rp !== '/') {
          return all.map((e) => e.substring(rp.length).replace(/^\//, ''))
        }
        return all
      },

      async mkdir(path: string): Promise<void> {
        await adapter.mkdir(rel(path))
      },

      async rmdir(path: string): Promise<void> {
        await adapter.rmdir(rel(path), false)
      },

      async stat(
        path: string,
      ): Promise<{
        type: 'file' | 'dir'
        mtimeMs: number
        size: number
        isFile(): boolean
        isDirectory(): boolean
        isSymbolicLink(): boolean
      }> {
        const rp = rel(path)

        // .git/index com cache (igual ao obsidian-git)
        if ((rp.endsWith('.git/index') || rp.endsWith('.git\\index')) && indexCache) {
          return {
            type: 'file',
            size: indexCache.byteLength,
            mtimeMs: indexMtime ?? Date.now(),
            isFile: () => true,
            isDirectory: () => false,
            isSymbolicLink: () => false,
          }
        }

        const s = await adapter.stat(rp)
        if (!s) {
          // throw ENOENT como objeto (isomorphic-git espera assim)
          const err: any = new Error(`ENOENT: ${rp}`)
          err.code = 'ENOENT'
          throw err
        }

        const isDir = s.type === 'folder'
        return {
          type: isDir ? 'dir' : 'file',
          size: s.size ?? 0,
          mtimeMs: s.mtime,
          // ESTES MÉTODOS SÃO OBRIGATÓRIOS para o isomorphic-git!
          isFile: () => !isDir,
          isDirectory: () => isDir,
          isSymbolicLink: () => false,
        }
      },

      async lstat(path: string): Promise<any> {
        return this.stat!(path)
      },

      async readlink(): Promise<string> {
        const err: any = new Error('ENOSYS: readlink')
        err.code = 'ENOSYS'
        throw err
      },

      async symlink(): Promise<void> {
        const err: any = new Error('ENOSYS: symlink')
        err.code = 'ENOSYS'
        throw err
      },

      async chmod(): Promise<void> {
        // No-op
      },
    },
    /** Escreve index cacheado de volta ao disco */
    async saveAndClear(): Promise<void> {
      if (indexCache !== undefined) {
        await adapter.writeBinary(
          '.git/index',
          indexCache,
          indexCtime && indexMtime
            ? { ctime: indexCtime, mtime: indexMtime } as any
            : undefined,
        )
      }
      indexCache = undefined
      indexMtime = undefined
      indexCtime = undefined
    },
  } as PromiseFsClient & { saveAndClear(): Promise<void> }
}
