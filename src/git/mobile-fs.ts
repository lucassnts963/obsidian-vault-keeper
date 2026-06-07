import type { PromiseFsClient } from 'isomorphic-git'

/**
 * Filesystem para Android/iOS que lê arquivos `.git/` usando
 * a API nativa do Capacitor (bypassando o adapter do Obsidian).
 *
 * O adapter do Obsidian bloqueia dot-dirs no mobile.
 * Mas o Capacitor Filesystem plugin dá acesso direto ao disco.
 */
export function createMobileGitFs(vaultPath: string): PromiseFsClient {
  // Extrai o caminho relativo do vault a partir do External storage
  // Ex: /storage/emulated/0/Documents/Obsidian/Knowledge → Documents/Obsidian/Knowledge
  const externalPrefix = '/storage/emulated/0/'
  const relRoot = vaultPath.startsWith(externalPrefix)
    ? vaultPath.slice(externalPrefix.length)
    : vaultPath

  /** Lê arquivo binário usando Capacitor nativo */
  async function nativeRead(relPath: string): Promise<Uint8Array> {
    console.log('[VaultKeeper mobile] nativeRead:', relPath)
    const Capacitor = (globalThis as any).Capacitor
    console.log('[VaultKeeper mobile] Capacitor?', !!Capacitor, 'Plugins?', !!Capacitor?.Plugins, 'Filesystem?', !!Capacitor?.Plugins?.Filesystem)
    if (!Capacitor?.Plugins?.Filesystem) {
      throw new Error('Capacitor Filesystem não disponível')
    }

    const Filesystem = Capacitor.Plugins.Filesystem
    const fullPath = `${relRoot}/${relPath}`

    // Lê como base64 (sem encoding = retorno binário)
    const result = await Filesystem.readFile({
      path: fullPath,
      directory: 'EXTERNAL',  // Directory.External = 'EXTERNAL'
    })

    // result.data é base64 string
    const binaryStr = atob(result.data)
    const bytes = new Uint8Array(binaryStr.length)
    for (let i = 0; i < binaryStr.length; i++) {
      bytes[i] = binaryStr.charCodeAt(i)
    }
    return bytes
  }

  /** Escreve arquivo binário usando Capacitor nativo */
  async function nativeWrite(relPath: string, data: Uint8Array): Promise<void> {
    const Capacitor = (globalThis as any).Capacitor
    if (!Capacitor?.Plugins?.Filesystem) {
      throw new Error('Capacitor Filesystem não disponível')
    }

    const Filesystem = Capacitor.Plugins.Filesystem
    const fullPath = `${relRoot}/${relPath}`

    // Converte Uint8Array → base64
    let binary = ''
    for (let i = 0; i < data.length; i++) {
      binary += String.fromCharCode(data[i])
    }
    const base64 = btoa(binary)

    await Filesystem.writeFile({
      path: fullPath,
      data: base64,
      directory: 'EXTERNAL',
    })
  }

  /** Lista diretório usando Capacitor nativo */
  async function nativeReaddir(relPath: string): Promise<string[]> {
    const Capacitor = (globalThis as any).Capacitor
    if (!Capacitor?.Plugins?.Filesystem) {
      throw new Error('Capacitor Filesystem não disponível')
    }

    const Filesystem = Capacitor.Plugins.Filesystem
    const fullPath = `${relRoot}/${relPath}`

    const result = await Filesystem.readdir({
      path: fullPath,
      directory: 'EXTERNAL',
    })

    return (result.files || []).map((f: any) => f.name)
  }

  /** Stat via Capacitor nativo */
  async function nativeStat(relPath: string): Promise<{
    type: 'file' | 'dir'
    mtimeMs: number
    size: number
  }> {
    const Capacitor = (globalThis as any).Capacitor
    if (!Capacitor?.Plugins?.Filesystem) {
      throw new Error('Capacitor Filesystem não disponível')
    }

    const Filesystem = Capacitor.Plugins.Filesystem
    const fullPath = `${relRoot}/${relPath}`

    const result = await Filesystem.stat({
      path: fullPath,
      directory: 'EXTERNAL',
    })

    return {
      type: result.type === 'directory' ? 'dir' : 'file',
      mtimeMs: result.mtime ?? Date.now(),
      size: result.size ?? 0,
    }
  }

  /** Remove via Capacitor nativo */
  async function nativeUnlink(relPath: string): Promise<void> {
    const Capacitor = (globalThis as any).Capacitor
    if (!Capacitor?.Plugins?.Filesystem) {
      throw new Error('Capacitor Filesystem não disponível')
    }

    const Filesystem = Capacitor.Plugins.Filesystem
    const fullPath = `${relRoot}/${relPath}`

    await Filesystem.deleteFile({
      path: fullPath,
      directory: 'EXTERNAL',
    })
  }

  /** Verifica se o path começa com .git/ */
  function isGitPath(p: string): boolean {
    return p === '.git' || p.startsWith('.git/') || p.includes('/.git/')
  }

  return {
    promises: {
      async readFile(path: string): Promise<Uint8Array> {
        if (isGitPath(path)) return nativeRead(path)
        // Working tree files: acessados pelo adapter do Obsidian
        // (esse fs é composto com VaultFS no GitSync)
        throw new Error(
          `MobileGitFs: arquivo fora do .git/ não suportado: ${path}`,
        )
      },

      async writeFile(path: string, data: Uint8Array | string): Promise<void> {
        const bytes =
          typeof data === 'string'
            ? new TextEncoder().encode(data)
            : data
        if (isGitPath(path)) return nativeWrite(path, bytes)
        throw new Error(
          `MobileGitFs: arquivo fora do .git/ não suportado: ${path}`,
        )
      },

      async unlink(path: string): Promise<void> {
        if (isGitPath(path)) return nativeUnlink(path)
        throw new Error(
          `MobileGitFs: arquivo fora do .git/ não suportado: ${path}`,
        )
      },

      async readdir(path: string): Promise<string[]> {
        if (isGitPath(path)) return nativeReaddir(path)
        throw new Error(
          `MobileGitFs: arquivo fora do .git/ não suportado: ${path}`,
        )
      },

      async mkdir(_path: string): Promise<void> {
        // No-op — .git/ já tem sua estrutura
      },

      async rmdir(_path: string): Promise<void> {
        throw new Error('rmdir não suportado no MobileGitFs')
      },

      async stat(
        path: string,
      ): Promise<{ type: 'file' | 'dir'; mtimeMs: number; size: number }> {
        if (isGitPath(path)) return nativeStat(path)
        throw new Error(
          `MobileGitFs: arquivo fora do .git/ não suportado: ${path}`,
        )
      },

      async lstat(
        path: string,
      ): Promise<{ type: 'file' | 'dir'; mtimeMs: number; size: number }> {
        return this.stat!(path)
      },

      async readlink(): Promise<string> {
        throw new Error('ENOSYS')
      },

      async symlink(): Promise<void> {
        throw new Error('ENOSYS')
      },

      async chmod(): Promise<void> {
        // No-op
      },
    },
  }
}

/** Detecta se estamos rodando no Capacitor (Android/iOS) */
export function isCapacitor(): boolean {
  try {
    return !!(globalThis as any).Capacitor?.isNativePlatform?.()
  } catch {
    return false
  }
}

/** Retorna o path do vault no mobile */
export function getVaultPath(): string {
  try {
    const bp = (globalThis as any).__VAULT_PATH__
    if (bp) return bp
  } catch { /* ignore */ }
  return '/storage/emulated/0/Documents/Obsidian/Knowledge'
}
