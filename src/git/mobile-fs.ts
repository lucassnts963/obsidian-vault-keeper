import type { PromiseFsClient } from 'isomorphic-git'

/**
 * Filesystem alternativo para acessar .git/ no mobile.
 *
 * O adapter do Obsidian bloqueia dot-dirs no mobile.
 * Tentamos múltiplos backends em ordem:
 * 1. Capacitor Filesystem nativo
 * 2. XMLHttpRequest file:// (Android WebView)
 * 3. Erro informativo
 */

/** Detecta Capacitor */
export function isCapacitor(): boolean {
  try {
    return !!(globalThis as any).Capacitor?.isNativePlatform?.()
  } catch {
    return false
  }
}

/** Detecta Android */
function isAndroid(): boolean {
  try {
    const C = (globalThis as any).Capacitor
    return C?.getPlatform() === 'android'
  } catch {
    return /android/i.test((globalThis as any).navigator?.userAgent ?? '')
  }
}

/** Retorna o path do vault */
export function getVaultPath(): string {
  try {
    const bp = (globalThis as any).__VAULT_PATH__
    if (bp) return bp
  } catch { /* ignore */ }
  return '/storage/emulated/0/Documents/Obsidian/Knowledge'
}

/**
 * Lê arquivo binário do disco no Android usando file:// XHR.
 * Funciona em WebViews que bloqueiam fetch() mas permitem XHR local.
 */
function androidReadFile(absPath: string): Promise<Uint8Array> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    xhr.open('GET', `file://${absPath}`, true)
    xhr.responseType = 'arraybuffer'
    xhr.onload = () => {
      if (xhr.status === 0 || xhr.status === 200) {
        resolve(new Uint8Array(xhr.response as ArrayBuffer))
      } else {
        reject(new Error(`XHR ${xhr.status}: ${absPath}`))
      }
    }
    xhr.onerror = () => reject(new Error(`XHR error: ${absPath}`))
    xhr.ontimeout = () => reject(new Error(`XHR timeout: ${absPath}`))
    xhr.timeout = 5000
    xhr.send()
  })
}

/** Escreve arquivo XHR (pode não funcionar em todos os WebViews) */
function androidWriteFile(absPath: string, data: Uint8Array): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    xhr.open('PUT', `file://${absPath}`, true)
    xhr.onload = () => {
      if (xhr.status === 0 || xhr.status === 200 || xhr.status === 204) {
        resolve()
      } else {
        reject(new Error(`XHR write ${xhr.status}: ${absPath}`))
      }
    }
    xhr.onerror = () => reject(new Error(`XHR write error: ${absPath}`))
    // XHR.send aceita vários tipos; Uint8Array nem sempre type-checa
    xhr.send(data as any)
  })
}

/** Lista diretório via file:// XHR (retorna HTML de listagem — frágil) */
async function androidReaddir(absDir: string): Promise<string[]> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    xhr.open('GET', `file://${absDir}`, true)
    xhr.onload = () => {
      if (xhr.status === 0 || xhr.status === 200) {
        // Tenta parsear a listagem HTML gerada pelo WebView
        const text = xhr.responseText
        const matches = text.match(/href="([^"]+)"/g)
        if (matches) {
          const names = matches
            .map((m: string) => m.slice(6, -1))
            .filter((n: string) => n !== '../' && !n.startsWith('?'))
            .map((n: string) => decodeURIComponent(n.replace(/\/$/, '')))
          resolve(names)
        } else {
          resolve([])
        }
      } else {
        reject(new Error(`XHR readdir ${xhr.status}: ${absDir}`))
      }
    }
    xhr.onerror = () => reject(new Error(`XHR readdir error: ${absDir}`))
    xhr.send()
  })
}

export function createMobileGitFs(vaultPath: string): PromiseFsClient {
  const externalPrefix = '/storage/emulated/0/'
  const relRoot = vaultPath.startsWith(externalPrefix)
    ? vaultPath.slice(externalPrefix.length)
    : vaultPath

  async function readRaw(relPath: string): Promise<Uint8Array> {
    const absPath = `${vaultPath}/${relPath}`

    // Tenta Capacitor Filesystem primeiro
    try {
      const C = (globalThis as any).Capacitor
      if (C?.Plugins?.Filesystem) {
        const result = await C.Plugins.Filesystem.readFile({
          path: `${relRoot}/${relPath}`,
          directory: 'EXTERNAL',
        })
        const binaryStr = atob(result.data as string)
        const bytes = new Uint8Array(binaryStr.length)
        for (let i = 0; i < binaryStr.length; i++) {
          bytes[i] = binaryStr.charCodeAt(i)
        }
        return bytes
      }
    } catch {
      // Capacitor falhou, tenta XHR
    }

    // Fallback: XHR file:// no Android
    if (isAndroid()) {
      return androidReadFile(absPath)
    }

    throw new Error(
      `Não foi possível acessar ${relPath}. ` +
      'Capacitor Filesystem indisponível e não é Android.',
    )
  }

  async function writeRaw(relPath: string, data: Uint8Array): Promise<void> {
    const absPath = `${vaultPath}/${relPath}`

    try {
      const C = (globalThis as any).Capacitor
      if (C?.Plugins?.Filesystem) {
        let binary = ''
        for (let i = 0; i < data.length; i++) {
          binary += String.fromCharCode(data[i])
        }
        await C.Plugins.Filesystem.writeFile({
          path: `${relRoot}/${relPath}`,
          data: btoa(binary),
          directory: 'EXTERNAL',
        })
        return
      }
    } catch {
      // Fallback
    }

    if (isAndroid()) {
      return androidWriteFile(absPath, data)
    }

    throw new Error(`Não foi possível escrever ${relPath}`)
  }

  async function statRaw(relPath: string): Promise<{
    type: 'file' | 'dir'
    mtimeMs: number
    size: number
  }> {
    // Lê o arquivo pra verificar existência (simplificado)
    const data = await readRaw(relPath)
    return {
      type: 'file',
      mtimeMs: Date.now(),
      size: data.length,
    }
  }

  function isGitPath(p: string): boolean {
    return p === '.git' || p.startsWith('.git/') || p.includes('/.git/')
  }

  return {
    promises: {
      async readFile(path: string): Promise<Uint8Array> {
        if (isGitPath(path)) return readRaw(path)
        throw new Error(`MobileGitFs: fora do .git/: ${path}`)
      },

      async writeFile(path: string, data: Uint8Array | string): Promise<void> {
        const bytes = typeof data === 'string' ? new TextEncoder().encode(data) : data
        if (isGitPath(path)) return writeRaw(path, bytes)
        throw new Error(`MobileGitFs: fora do .git/: ${path}`)
      },

      async unlink(_path: string): Promise<void> {
        throw new Error('unlink não implementado no MobileGitFs')
      },

      async readdir(path: string): Promise<string[]> {
        if (isGitPath(path)) {
          const absDir = `${vaultPath}/${path}`
          if (isAndroid()) return androidReaddir(absDir)
          return []
        }
        throw new Error(`MobileGitFs: fora do .git/: ${path}`)
      },

      async mkdir(_path: string): Promise<void> {},

      async rmdir(_path: string): Promise<void> {
        throw new Error('rmdir não implementado')
      },

      async stat(path: string): Promise<{ type: 'file' | 'dir'; mtimeMs: number; size: number }> {
        if (isGitPath(path)) return statRaw(path)
        throw new Error(`MobileGitFs: fora do .git/: ${path}`)
      },

      async lstat(path: string): Promise<{ type: 'file' | 'dir'; mtimeMs: number; size: number }> {
        return this.stat!(path)
      },

      async readlink(): Promise<string> { throw new Error('ENOSYS') },
      async symlink(): Promise<void> { throw new Error('ENOSYS') },
      async chmod(): Promise<void> {},
    },
  }
}
