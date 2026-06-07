import type { Vault } from 'obsidian'
import type { PromiseFsClient } from 'isomorphic-git'

/**
 * Bridge entre isomorphic-git (PromiseFsClient) e Obsidian Vault API.
 *
 * isomorphic-git roda puro em JS — sem dependência de Node fs ou shell git.
 * Todas as operações de arquivo passam pelo adapter do Obsidian, que funciona
 * no desktop (Electron) e mobile (WebView).
 *
 * Caminhos são relativos à raiz do vault.
 */
export function createVaultFs(vault: Vault): PromiseFsClient {
  return {
    promises: {
      async readFile(path: string): Promise<Uint8Array> {
        const buf = await vault.adapter.readBinary(path)
        return new Uint8Array(buf)
      },

      async writeFile(path: string, data: Uint8Array | string): Promise<void> {
        const buffer =
          typeof data === 'string'
            ? new TextEncoder().encode(data).buffer
            : data.buffer instanceof ArrayBuffer
              ? data.buffer
              : data
        await vault.adapter.writeBinary(path, buffer as ArrayBuffer)
      },

      async unlink(path: string): Promise<void> {
        await vault.adapter.remove(path)
      },

      async readdir(path: string): Promise<string[]> {
        const listing = await vault.adapter.list(path)
        return [...listing.files, ...listing.folders]
      },

      async mkdir(path: string): Promise<void> {
        await vault.adapter.mkdir(path)
      },

      async rmdir(path: string): Promise<void> {
        await vault.adapter.rmdir(path, false)
      },

      async stat(
        path: string,
      ): Promise<{ type: 'file' | 'dir'; mtimeMs: number; size: number }> {
        const s = await vault.adapter.stat(path)
        if (!s) {
          throw new Error(`ENOENT: ${path}`)
        }
        return {
          type: s.type === 'folder' ? 'dir' : 'file',
          mtimeMs: s.mtime,
          size: s.size ?? 0,
        }
      },

      async lstat(
        path: string,
      ): Promise<{ type: 'file' | 'dir'; mtimeMs: number; size: number }> {
        // Obsidian vault não tem symlinks — mesmo que stat
        return this.stat!(path)
      },

      // Symlink não suportado no vault do Obsidian
      async readlink(_path: string): Promise<string> {
        throw new Error('ENOSYS: readlink not supported in Obsidian vault')
      },

      async symlink(_target: string, _path: string): Promise<void> {
        throw new Error('ENOSYS: symlink not supported in Obsidian vault')
      },

      async chmod(_path: string, _mode: number): Promise<void> {
        // No-op no Obsidian (não tem permissões POSIX)
      },
    },
  }
}
