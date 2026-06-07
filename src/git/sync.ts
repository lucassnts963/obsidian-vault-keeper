import type { Vault } from 'obsidian'
import * as git from 'isomorphic-git'
import type { PromiseFsClient } from 'isomorphic-git'
import http from 'isomorphic-git/http/web'
import type { GitSettings } from '../settings'
import { createVaultFs } from './vault-fs'
import { createMobileGitFs, isCapacitor, getVaultPath } from './mobile-fs'

/**
 * FS composto: rotéia .git/** → gitFs, resto → vaultFs.
 * Resolve o problema do adapter do Obsidian mobile bloquear dot-dirs.
 */
function compositeFs(vaultFs: PromiseFsClient, gitFs: PromiseFsClient): PromiseFsClient {
  function isGit(p: string): boolean {
    return p === '.git' || p.startsWith('.git/') || p.includes('/.git/')
  }

  function pick(p: string) {
    return isGit(p) ? gitFs : vaultFs
  }

  return {
    promises: {
      readFile: (p: string) => pick(p).promises.readFile(p),
      writeFile: (p: string, d: Uint8Array | string) => pick(p).promises.writeFile(p, d),
      unlink: (p: string) => pick(p).promises.unlink(p),
      readdir: (p: string) => pick(p).promises.readdir(p),
      mkdir: (p: string) => pick(p).promises.mkdir(p),
      rmdir: (p: string) => pick(p).promises.rmdir(p),
      stat: (p: string) => pick(p).promises.stat(p),
      lstat: (p: string) => pick(p).promises.lstat!(p),
      readlink: (p: string) => pick(p).promises.readlink!(p),
      symlink: (t: string, p: string) => pick(p).promises.symlink!(t, p),
      chmod: (p: string, m: number) => pick(p).promises.chmod!(p, m),
    },
  }
}

/**
 * Promise.race com timeout — evita que operações de rede travem indefinidamente.
 */
function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error(`Timeout após ${ms / 1000}s`)), ms),
    ),
  ])
}

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
 * Git sync via isomorphic-git — JS puro, sem dependência de shell.
 *
 * Resolve o problema de "buffer error" do plugin Git oficial no mobile,
 * e funciona em qualquer plataforma onde o Obsidian roda.
 *
 * Fluxo: status → pull (fast-forward) → add → commit → push
 */
export class GitSync {
  private vault: Vault
  private settings: GitSettings
  private dir: string  // raiz do vault = working tree

  constructor(vault: Vault, settings: { git: GitSettings }) {
    this.vault = vault
    this.settings = settings.git
    // No Obsidian, a raiz do vault é o diretório de trabalho do git
    this.dir = (vault.adapter as any).basePath ?? '/vault'
  }

  private get fs(): PromiseFsClient {
    const vaultFs = createVaultFs(this.vault, this.dir)

    // No mobile: VaultFS puro (desktop funciona)
    if (!isCapacitor()) return vaultFs

    // Mobile: fs híbrido — .git/ pelo Capacitor, working tree pelo VaultFS
    const gitFs = createMobileGitFs(getVaultPath())

    return compositeFs(vaultFs, gitFs)
  }

  private get httpClient() {
    return http
  }

  /**
   * URL com token embutido pra bypassar CSP no mobile.
   * CSP do Obsidian mobile pode bloquear header Authorization customizado,
   * mas URLs com userinfo passam.
   */
  private get effectiveUrl(): string {
    if (!this.settings.token) return this.settings.remote
    // GitHub aceita token como username (senha vazia)
    return this.settings.remote.replace(
      'https://',
      `https://${this.settings.token}:x-oauth-basic@`,
    )
  }

  /**
   * Headers HTTP com token de autenticação.
   */
  private authHeaders(): Record<string, string> {
    // Quando usamos effectiveUrl com token embutido, não precisa de header
    if (this.settings.token && this.effectiveUrl.includes('@')) return {}
    if (!this.settings.token) return {}
    return { Authorization: `Bearer ${this.settings.token}` }
  }

  /** Verifica se git está configurado */
  private ensureReady(): void {
    if (!this.settings.enabled) {
      throw new Error('Git sync desabilitado nas configurações')
    }
    if (!this.settings.remote) {
      throw new Error('Remote URL não configurado')
    }
  }

  /**
   * Status completo do repositório.
   */
  async status(): Promise<StatusResult> {
    try {
      this.ensureReady()
      const branch = await git.currentBranch({
        fs: this.fs,
        dir: this.dir,
      })

      // Detecta mudanças locais (workdir vs HEAD)
      const matrix = await git.statusMatrix({
        fs: this.fs,
        dir: this.dir,
      })

      const localChanges: string[] = []
      for (const [filepath, _head, workdir, _stage] of matrix) {
        if (workdir !== 1) {
          // 1 = unchanged; 0 = absent; 2 = modified
          localChanges.push(filepath)
        }
      }

      // Conta commits não enviados (log local vs remote)
      const localCommits = await git.log({
        fs: this.fs,
        dir: this.dir,
        depth: 50,
      })

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
   *
   * Estratégia:
   * - Pull usa fastForwardOnly para evitar conflitos de merge
   * - Se fast-forward falhar, loga o erro e segue (não força merge)
   * - Commit só se houver mudanças locais
   * - Push só se houver commits para enviar
   *
   * @param onPhase callback opcional pra UI mostrar progresso
   */
  async sync(onPhase?: (msg: string) => void): Promise<SyncResult> {
    this.ensureReady()

    const commits: string[] = []
    let pulled = 0
    let pushed = 0

    const log = (msg: string) => {
      commits.push(msg)
      onPhase?.(msg)
      console.log('[VaultKeeper]', msg)
    }

    // --- 1. Pull (fast-forward only, com timeout 20s) ---
    log('pull: verificando...')
    try {
      await withTimeout(
        git.pull({
          fs: this.fs,
          http: this.httpClient,
          dir: this.dir,
          url: this.effectiveUrl,
          ref: 'main',
          singleBranch: true,
          fastForwardOnly: true,
          corsProxy: isCapacitor() ? 'https://cors.isomorphic-git.org' : undefined,
          author: {
            name: this.settings.authorName || 'Vault Keeper',
            email: this.settings.authorEmail || 'vault@keeper.local',
          },
          headers: this.authHeaders(),
          onMessage: (msg) => console.log('[VaultKeeper pull]', msg),
        }),
        20000,
      )
      pulled = 1
      log('pull: atualizado via fast-forward')
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      // Fast-forward pode falhar se houver divergência — não é fatal
      log(`pull: ignorado (${msg.slice(0, 80)})`)
    }

    // --- 2. Detecta mudanças locais ---
    log('status: analisando...')
    const matrix = await withTimeout(
      git.statusMatrix({
        fs: this.fs,
        dir: this.dir,
        filter: (f: string) =>
          !f.startsWith('.git/') &&
          !f.endsWith('.xlsx') &&
          !f.endsWith('.xls') &&
          !f.endsWith('.pdf') &&
          !f.endsWith('.png') &&
          !f.endsWith('.jpg'),
      }),
      15000,
    )

    const changedFiles: string[] = []
    for (const [filepath, _head, workdir, _stage] of matrix) {
      // workdir: 0=absent, 1=unchanged, 2=modified
      // stage: 0=absent, 1=identical, 2=modified, 3=added
      if (workdir === 2 || workdir === 0) {
        changedFiles.push(filepath)
      }
    }

    // --- 3. Add + Commit (se houver mudanças) ---
    if (changedFiles.length > 0) {
      log(`commit: ${changedFiles.length} arquivos...`)
      const now = new Date()
      const timestamp = now.toISOString().replace('T', ' ').slice(0, 19)

      for (const file of changedFiles) {
        try {
          await git.add({
            fs: this.fs,
            dir: this.dir,
            filepath: file,
          })
        } catch {
          // Arquivo pode ter sido deletado entre statusMatrix e add
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
    } else {
      log('status: nada alterado')
    }

    // --- 4. Push (com timeout 20s) ---
    log('push: enviando...')
    try {
      const result = await withTimeout(
        git.push({
          fs: this.fs,
          http: this.httpClient,
          dir: this.dir,
          url: this.effectiveUrl,
          ref: 'main',
          corsProxy: isCapacitor() ? 'https://cors.isomorphic-git.org' : undefined,
          headers: this.authHeaders(),
        }),
        20000,
      )

      if (result.ok) {
        pushed = 1
        log(`push: ok → ${this.settings.remote}`)
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      log(`push: ERRO — ${msg.slice(0, 120)}`)
      throw err
    }

    const branch = (await git.currentBranch({ fs: this.fs, dir: this.dir })) ?? 'main'

    return {
      pulled,
      pushed,
      branch,
      commits,
    }
  }

  /**
   * Retorna os últimos N commits do log local.
   */
  async recentCommits(n: number = 5): Promise<string[]> {
    try {
      const entries = await git.log({
        fs: this.fs,
        dir: this.dir,
        depth: n,
      })
      return entries.map(
        (e) =>
          `${e.oid.slice(0, 7)} — ${e.commit.message.slice(0, 60)}`,
      )
    } catch {
      return ['(sem commits ou repositório não inicializado)']
    }
  }
}
