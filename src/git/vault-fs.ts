import type { Vault } from 'obsidian'
import type { PromiseFsClient } from 'isomorphic-git'

/**
 * Bridge entre isomorphic-git (PromiseFsClient) e Obsidian Vault API.
 *
 * isomorphic-git roda puro em JS — sem dependência de Node fs ou shell git.
 * Todas as operações de arquivo passam pelo adapter do Obsidian, que funciona
 * no desktop (Electron) e mobile (Capacitor/WebView).
 *
 * O adapter do Obsidian trabalha com caminhos RELATIVOS à raiz do vault.
 * isomorphic-git pode chamar com caminhos absolutos (ex: no Android).
 * Este bridge normaliza automaticamente.
 */
export function createVaultFs(vault: Vault, vaultRoot?: string): PromiseFsClient {
  // Detecta raiz real se não fornecida
  const basePath = vaultRoot ?? (vault.adapter as any).basePath ?? ''
  const baseLen = basePath ? basePath.replace(/\/$/, '').length + 1 : 0

  /** Normaliza caminho absoluto → relativo */
  function rel(path: string): string {
    if (!basePath || !path.startsWith(basePath)) return path
    // Remove prefixo e barra inicial: /storage/.../Knowledge/foo.md → foo.md
    let rel = path.slice(baseLen)
    // Fallback se o slice der ruim
    if (rel.startsWith('/')) rel = rel.slice(1)
    return rel || '.'
  }

  /** Dot-dirs que NUNCA devem ser varridas pelo isomorphic-git */
  const SKIP_DIRS = new Set(['.git', '.obsidian', '.trash', '.vscode', '.idea'])

  /** Verifica se o path é/contém um dot-dir bloqueado */
  function isDotDir(p: string): boolean {
    const parts = p.replace(/^\//, '').split('/')
    return parts.some((part) => part.startsWith('.') && SKIP_DIRS.has(part))
  }

  return {
    promises: {
      async readFile(path: string): Promise<Uint8Array> {
        const buf = await vault.adapter.readBinary(rel(path))
        return new Uint8Array(buf)
      },

      async writeFile(path: string, data: Uint8Array | string): Promise<void> {
        const buffer =
          typeof data === 'string'
            ? new TextEncoder().encode(data).buffer
            : data.buffer instanceof ArrayBuffer
              ? data.buffer
              : data
        await vault.adapter.writeBinary(rel(path), buffer as ArrayBuffer)
      },

      async unlink(path: string): Promise<void> {
        await vault.adapter.remove(rel(path))
      },

      async readdir(path: string): Promise<string[]> {
        const rp = rel(path)
        // Se for um dot-dir, retorna vazio — não existe no working tree
        if (isDotDir(rp)) return []
        try {
          const listing = await vault.adapter.list(rp)
          // Filtra dot-dirs do resultado
          const files = listing.files.filter((f) => !SKIP_DIRS.has(f))
          const folders = listing.folders.filter((f) => !SKIP_DIRS.has(f))
          return [...files, ...folders]
        } catch {
          return []
        }
      },

      async mkdir(path: string): Promise<void> {
        await vault.adapter.mkdir(rel(path))
      },

      async rmdir(path: string): Promise<void> {
        await vault.adapter.rmdir(rel(path), false)
      },

      async stat(
        path: string,
      ): Promise<{ type: 'file' | 'dir'; mtimeMs: number; size: number }> {
        const rp = rel(path)
        // Dot-dirs não existem no working tree
        if (isDotDir(rp)) throw new Error(`ENOENT: ${rp}`)
        const s = await vault.adapter.stat(rp)
        if (!s) {
          throw new Error(`ENOENT: ${rp}`)
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
        return this.stat!(path)
      },

      async readlink(): Promise<string> {
        throw new Error('ENOSYS: readlink not supported in Obsidian vault')
      },

      async symlink(): Promise<void> {
        throw new Error('ENOSYS: symlink not supported in Obsidian vault')
      },

      async chmod(): Promise<void> {
        // No-op
      },
    },
  }
}
