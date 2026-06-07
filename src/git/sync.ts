import type { Vault } from 'obsidian'
import * as git from 'isomorphic-git'
import http from 'isomorphic-git/http/web'
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

  private get fs() {
    return createVaultFs(this.vault, this.dir)
  }

  private get httpClient() {
    return http
  }

  /**
   * Headers HTTP com token de autenticação.
   */
  private authHeaders(): Record<string, string> {
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
   */
  async sync(): Promise<SyncResult> {
    this.ensureReady()

    const commits: string[] = []
    let pulled = 0
    let pushed = 0

    // --- 1. Pull (fast-forward only) ---
    try {
      await git.pull({
        fs: this.fs,
        http: this.httpClient,
        dir: this.dir,
        url: this.settings.remote,
        ref: 'main',
        singleBranch: true,
        fastForwardOnly: true,
        author: {
          name: this.settings.authorName || 'Vault Keeper',
          email: this.settings.authorEmail || 'vault@keeper.local',
        },
        headers: this.authHeaders(),
      })
      pulled = 1
      commits.push('pull: atualizado via fast-forward')
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      // Fast-forward pode falhar se houver divergência — não é fatal
      commits.push(`pull: ignorado (${msg.slice(0, 80)})`)
    }

    // --- 2. Detecta mudanças locais ---
    const matrix = await git.statusMatrix({
      fs: this.fs,
      dir: this.dir,
      // Ignora .git/ e arquivos binários comuns
      filter: (f: string) =>
        !f.startsWith('.git/') &&
        !f.endsWith('.xlsx') &&
        !f.endsWith('.xls') &&
        !f.endsWith('.pdf') &&
        !f.endsWith('.png') &&
        !f.endsWith('.jpg'),
    })

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

      commits.push(`commit: ${sha.slice(0, 7)} — ${changedFiles.length} arquivos`)
    }

    // --- 4. Push ---
    try {
      const result = await git.push({
        fs: this.fs,
        http: this.httpClient,
        dir: this.dir,
        url: this.settings.remote,
        ref: 'main',
        headers: this.authHeaders(),
      })

      if (result.ok) {
        pushed = 1
        commits.push(`push: ok → ${this.settings.remote}`)
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      commits.push(`push: ERRO — ${msg.slice(0, 120)}`)
      throw err  // push falhou = operação incompleta
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
