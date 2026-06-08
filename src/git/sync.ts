import type { Vault } from 'obsidian'
import { requestUrl } from 'obsidian'
import * as git from 'isomorphic-git'
import type { GitHttpRequest, GitHttpResponse, PromiseFsClient } from 'isomorphic-git'
import type { GitSettings } from '../settings'
import { createVaultFs } from './vault-fs'

export interface SyncResult {
  pulled: number
  pushed: number
  branch: string
  commits: string[]
}

export interface StatusResult {
  branch: string
  localChanges: string[]
  unpushedCommits: number
  error?: string
}

/**
 * HTTP client que usa requestUrl() do Obsidian ao invés de fetch().
 * Bypassa CSP no mobile (mesmo approach do obsidian-git).
 */
function obsidianHttp(): any {
  return {
    async request({
      url,
      method,
      headers,
      body,
    }: GitHttpRequest): Promise<GitHttpResponse> {
      // Coleta body (isomorphic-git pode passar como AsyncIterable)
      let collectedBody: ArrayBuffer | undefined
      if (body) {
        const chunks: Uint8Array[] = []
        if (Symbol.asyncIterator in (body as any)) {
          for await (const chunk of body as any) {
            chunks.push(chunk)
          }
          const total = chunks.reduce((a, c) => a + c.length, 0)
          const merged = new Uint8Array(total)
          let offset = 0
          for (const c of chunks) {
            merged.set(c, offset)
            offset += c.length
          }
          collectedBody = merged.buffer as ArrayBuffer
        } else if (body instanceof Uint8Array) {
          collectedBody = body.buffer as ArrayBuffer
        }
      }

      const res = await requestUrl({
        url,
        method: method ?? 'GET',
        headers,
        body: collectedBody,
        throw: false,
      })

      return {
        url: (res as any).url ?? url,
        method: method ?? 'GET',
        statusCode: res.status,
        statusMessage: res.status.toString(),
        headers: (res.headers ?? {}) as Record<string, string>,
        body: [new Uint8Array(res.arrayBuffer)] as any,
      }
    },
  }
}

/**
 * Promise.race com timeout.
 */
function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error(`Timeout após ${ms / 1000}s`)), ms),
    ),
  ])
}

/**
 * Git sync via isomorphic-git — JS puro.
 * Adaptado do plugin obsidian-git (Vinzent03).
 */
export class GitSync {
  private vault: Vault
  private settings: GitSettings
  private dir: string
  private fsClient: ReturnType<typeof createVaultFs>

  constructor(vault: Vault, settings: { git: GitSettings }) {
    this.vault = vault
    this.settings = settings.git
    // basePath pode não existir ou lançar erro no mobile
    try {
      this.dir = (vault.adapter as any).basePath ?? ''
    } catch {
      this.dir = ''
    }
    if (!this.dir) {
      this.dir = '/vault'
    }
    this.fsClient = createVaultFs(this.vault, this.dir)
  }

  private get fs(): PromiseFsClient {
    return this.fsClient
  }

  /** Salva index caches e limpa */
  private async flushIndex(): Promise<void> {
    if ('saveAndClear' in this.fsClient) {
      await (this.fsClient as any).saveAndClear()
    }
  }

  /**
   * URL com token embutido (bypassa CSP header blocking).
   */
  private get effectiveUrl(): string {
    if (!this.settings.token) return this.settings.remote
    return this.settings.remote.replace(
      'https://',
      `https://${this.settings.token}:x-oauth-basic@`,
    )
  }

  private ensureReady(): void {
    if (!this.settings.enabled) {
      throw new Error('Git sync desabilitado nas configurações')
    }
    if (!this.settings.remote) {
      throw new Error('Remote URL não configurado')
    }
  }

  /**
   * Status rápido do repositório.
   * Usa listFiles() primeiro pra pegar só os arquivos rastreados,
   * depois passa filepaths pro statusMatrix — evita stat() no vault inteiro.
   * No mobile isso é a diferença entre 2s e timeout de 30s.
   */
  async status(): Promise<StatusResult> {
    try {
      this.ensureReady()

      // Branch (rápido, lê HEAD)
      const branch = await withTimeout(
        git.currentBranch({ fs: this.fs, dir: this.dir }),
        5000,
      )

      // Só escaneia arquivos rastreados pelo git — não o vault inteiro
      let trackedFiles: string[] = []
      try {
        trackedFiles = await withTimeout(
          git.listFiles({ fs: this.fs, dir: this.dir }),
          10000,
        )
      } catch {
        // Se listFiles falhar (repo novo/corrompido), sem changes
        return {
          branch: branch ?? 'unknown',
          localChanges: [],
          unpushedCommits: 0,
        }
      }

      // statusMatrix só nos arquivos rastreados (não faz walk no vault inteiro!)
      const matrix = await withTimeout(
        git.statusMatrix({
          fs: this.fs,
          dir: this.dir,
          filepaths: trackedFiles,
        }),
        15000,
      )

      const localChanges: string[] = []
      for (const [filepath, _head, workdir, _stage] of matrix) {
        if (workdir !== 1) {
          localChanges.push(filepath)
        }
      }

      // Unpushed commits (lê só .git/logs)
      const localCommits = await withTimeout(
        git.log({ fs: this.fs, dir: this.dir, depth: 50 }),
        5000,
      )

      return {
        branch: branch ?? 'unknown',
        localChanges,
        unpushedCommits: localCommits.length,
      }
    } catch (err) {
      return {
        branch: 'unknown',
        localChanges: [],
        unpushedCommits: 0,
        error: err instanceof Error ? err.message : String(err),
      }
    }
  }

  /**
   * Sincronização completa: pull → add → commit → push.
   */
  async sync(onPhase?: (msg: string) => void): Promise<SyncResult> {
    this.ensureReady()

    const commits: string[] = []
    let pulled = 0
    let pushed = 0

    const log = (msg: string) => {
      commits.push(msg)
      onPhase?.(msg)
    }

    // --- 1. Pull (fast-forward only) ---
    log('pull: verificando...')
    try {
      await withTimeout(
        git.pull({
          fs: this.fs,
          http: obsidianHttp(),
          dir: this.dir,
          url: this.effectiveUrl,
          ref: 'main',
          singleBranch: true,
          fastForwardOnly: true,
          author: {
            name: this.settings.authorName || 'Vault Keeper',
            email: this.settings.authorEmail || 'vault@keeper.local',
          },
        }),
        20000,
      )
      pulled = 1
      log('pull: atualizado via fast-forward')
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      log(`pull: ignorado (${msg.slice(0, 80)})`)
    }

    // --- 2. Detecta mudanças locais (híbrido: rastreados + novos) ---
    log('status: analisando...')

    // Pega arquivos rastreados do index (rápido, 1 leitura)
    let filesToCheck: string[] = []
    try {
      filesToCheck = await git.listFiles({ fs: this.fs, dir: this.dir })
    } catch {
      filesToCheck = []
    }

    // Adiciona novos arquivos em diretórios chave (não rastreados ainda)
    const watchDirs = ['inbox', 'raw', 'wiki', 'templates']
    for (const dir of watchDirs) {
      try {
        const entries = await this.fs.promises.readdir(dir)
        for (const entry of entries) {
          const full = `${dir}/${entry}`
          if (entry.endsWith('.md') && !filesToCheck.includes(full)) {
            filesToCheck.push(full)
          }
        }
      } catch {
        // diretório não existe ainda
      }
    }

    const matrix = await withTimeout(
      git.statusMatrix({
        fs: this.fs,
        dir: this.dir,
        filepaths: filesToCheck.length > 0 ? filesToCheck : undefined,
      }),
      30000,
    )

    log(`status: ${matrix.length} arquivos`)

    const changedFiles: string[] = []
    for (const [filepath, _head, workdir, _stage] of matrix) {
      if (workdir === 2 || workdir === 0) {
        changedFiles.push(filepath)
      }
    }

    // --- 3. Add + Commit ---
    if (changedFiles.length > 0) {
      log(`commit: ${changedFiles.length} arquivos...`)
      const now = new Date()
      const timestamp = now.toISOString().replace('T', ' ').slice(0, 19)

      for (const file of changedFiles) {
        try {
          await git.add({ fs: this.fs, dir: this.dir, filepath: file })
        } catch {
          // arquivo pode ter sumido
        }
      }

      const sha = await git.commit({
        fs: this.fs,
        dir: this.dir,
        message: `vault: auto-sync ${timestamp}`,
        author: {
          name: this.settings.authorName || 'Vault Keeper',
          email: this.settings.authorEmail || 'vault@keeper.local',
        },
      })

      log(`commit: ${sha.slice(0, 7)} — ${changedFiles.length} arquivos`)
      await this.flushIndex()
    } else {
      log('status: nada alterado')
    }

    // --- 4. Push ---
    log('push: enviando...')
    try {
      const result = await withTimeout(
        git.push({
          fs: this.fs,
          http: obsidianHttp(),
          dir: this.dir,
          url: this.effectiveUrl,
          ref: 'main',
        }),
        20000,
      )

      if (result.ok) {
        pushed = 1
        log(`push: ok → ${this.settings.remote}`)
      }
      await this.flushIndex()
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      log(`push: ERRO — ${msg.slice(0, 120)}`)
      throw err
    }

    const branch =
      (await git.currentBranch({ fs: this.fs, dir: this.dir })) ?? 'main'

    return { pulled, pushed, branch, commits }
  }

  /**
   * Últimos N commits.
   */
  async recentCommits(n: number = 5): Promise<string[]> {
    try {
      const entries = await git.log({
        fs: this.fs,
        dir: this.dir,
        depth: n,
      })
      return entries.map(
        (e) => `${e.oid.slice(0, 7)} — ${e.commit.message.slice(0, 60)}`,
      )
    } catch {
      return ['(sem commits)']
    }
  }
}
