import { requestUrl, type Vault, type DataAdapter, Notice } from 'obsidian'

export interface SyncSettings {
  enabled: boolean
  remote: string    // https://github.com/user/repo
  token: string     // GitHub personal access token
  authorName: string
  authorEmail: string
  autoSyncMinutes: number
}

export interface SyncState {
  lastRemoteSHA: string
  files: Record<string, { sha: string; mtime: number }>
}

export interface SyncResult {
  pushed: number
  pulled: number
  phase: string
}

/**
 * Extrai owner/repo da URL do GitHub.
 * Ex: https://github.com/user/repo → { owner: "user", repo: "repo" }
 */
function parseRemote(url: string): { owner: string; repo: string } | null {
  const m = url.match(/github\.com\/([^/]+)\/([^/]+?)(?:\.git)?$/)
  if (!m) return null
  return { owner: m[1], repo: m[2] }
}

/**
 * Hash SHA-256 de conteúdo usando SubtleCrypto (disponível no WebView mobile).
 */
async function sha256(content: ArrayBuffer): Promise<string> {
  const hash = await crypto.subtle.digest('SHA-256', content)
  return Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

/**
 * GitHub REST API sync — sem isomorphic-git, sem Buffer, sem polyfill.
 * Usa requestUrl() do Obsidian que funciona em desktop e mobile (bypassa CSP).
 */
export class GitHubSync {
  private vault: Vault
  private settings: SyncSettings
  private owner: string
  private repo: string
  private state: SyncState = { lastRemoteSHA: '', files: {} }
  private statePath: string

  constructor(vault: Vault, settings: SyncSettings, pluginDataDir: string) {
    this.vault = vault
    this.settings = settings
    const parsed = parseRemote(settings.remote)
    if (!parsed) throw new Error('Remote URL inválida: use https://github.com/user/repo')
    this.owner = parsed.owner
    this.repo = parsed.repo
    this.statePath = `${pluginDataDir}/sync_state.json`
  }

  private get apiBase(): string {
    return `https://api.github.com/repos/${this.owner}/${this.repo}`
  }

  private authHeaders(): Record<string, string> {
    return {
      Authorization: `token ${this.settings.token}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
    }
  }

  private async apiGet(path: string): Promise<any> {
    const res = await requestUrl({
      url: `${this.apiBase}${path}`,
      headers: this.authHeaders(),
      throw: false,
    })
    if (res.status !== 200) {
      throw new Error(`GitHub API ${res.status}: ${path}`)
    }
    return res.json
  }

  private async apiPut(path: string, body: any): Promise<any> {
    const res = await requestUrl({
      url: `${this.apiBase}${path}`,
      method: 'PUT',
      headers: { ...this.authHeaders(), 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      throw: false,
    })
    if (res.status < 200 || res.status > 299) {
      const err: any = res.json
      throw new Error(`GitHub API ${res.status}: ${err?.message || path}`)
    }
    return res.json
  }

  private async apiDelete(path: string, body: any): Promise<any> {
    const res = await requestUrl({
      url: `${this.apiBase}${path}`,
      method: 'DELETE',
      headers: { ...this.authHeaders(), 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      throw: false,
    })
    if (res.status !== 200) {
      const err: any = res.json
      throw new Error(`GitHub API ${res.status}: ${err?.message || path}`)
    }
    return res.json
  }

  // ═══════════════════════════════════════════════════════
  //  State
  // ═══════════════════════════════════════════════════════

  async loadState(): Promise<void> {
    try {
      const raw = await this.vault.adapter.read(this.statePath)
      this.state = JSON.parse(raw)
    } catch {
      this.state = { lastRemoteSHA: '', files: {} }
    }
  }

  private async saveState(): Promise<void> {
    await this.vault.adapter.write(
      this.statePath,
      JSON.stringify(this.state, null, 2),
    )
  }

  // ═══════════════════════════════════════════════════════
  //  File scanning (só .md)
  // ═══════════════════════════════════════════════════════

  private async* walkFiles(dir: string): AsyncGenerator<string> {
    const list = await this.vault.adapter.list(dir)
    for (const file of list.files) {
      if (file.endsWith('.md') && !file.startsWith('.')) {
        const full = dir === '/' ? file : `${dir}/${file}`
        yield full.startsWith('/') ? full.slice(1) : full
      }
    }
    for (const sub of list.folders) {
      if (!sub.startsWith('.')) {
        const full = dir === '/' ? `/${sub}` : `${dir}/${sub}`
        yield* this.walkFiles(full)
      }
    }
  }

  // ═══════════════════════════════════════════════════════
  //  Status
  // ═══════════════════════════════════════════════════════

  async status(): Promise<{
    localChanges: string[]
    remoteAhead: boolean
    branch: string
  }> {
    await this.loadState()

    // Detecta mudanças locais (hash diferente do estado salvo)
    const localChanges: string[] = []
    for await (const f of this.walkFiles('/')) {
      const buf = await this.vault.adapter.readBinary(f)
      const hash = await sha256(buf)
      const cached = this.state.files[f]
      if (!cached || cached.sha !== hash) {
        localChanges.push(f)
      }
    }

    // Detecta arquivos deletados
    for (const f of Object.keys(this.state.files)) {
      if (!localChanges.includes(f)) {
        const exists = await this.vault.adapter.exists(f)
        if (!exists) localChanges.push(f + ' (deletado)')
      }
    }

    // Verifica se remoto tem commits novos
    let remoteAhead = false
    try {
      const ref = await this.apiGet('/git/ref/heads/main')
      const remoteSHA = ref.object?.sha
      remoteAhead = remoteSHA !== this.state.lastRemoteSHA && !!this.state.lastRemoteSHA
    } catch {
      // repo pode não existir ainda
    }

    return {
      localChanges,
      remoteAhead,
      branch: 'main',
    }
  }

  // ═══════════════════════════════════════════════════════
  //  Push
  // ═══════════════════════════════════════════════════════

  async push(onPhase?: (msg: string) => void): Promise<string[]> {
    await this.loadState()
    const commits: string[] = []
    const log = (msg: string) => { commits.push(msg); onPhase?.(msg) }

    log('Scanning vault...')

    // Descobre arquivos alterados
    const changed: { path: string; hash: string }[] = []
    const deleted: string[] = []

    for await (const f of this.walkFiles('/')) {
      const buf = await this.vault.adapter.readBinary(f)
      const hash = await sha256(buf)
      const cached = this.state.files[f]
      if (!cached || cached.sha !== hash) {
        changed.push({ path: f, hash })
      }
    }

    for (const f of Object.keys(this.state.files)) {
      const exists = await this.vault.adapter.exists(f)
      if (!exists && !deleted.includes(f)) {
        deleted.push(f)
      }
    }

    if (changed.length === 0 && deleted.length === 0) {
      log('Nada alterado')
      return commits
    }

    // Push arquivos alterados
    const timestamp = new Date().toISOString().replace('T', ' ').slice(0, 19)
    const encoder = new TextEncoder()

    for (const { path, hash } of changed) {
      const file = this.vault.adapter as DataAdapter & { readBinary(path: string): Promise<ArrayBuffer> }
      const content = await file.readBinary(path)
      const base64 = btoa(String.fromCharCode(...new Uint8Array(content)))
      const existing = this.state.files[path]

      try {
        const body: any = {
          message: `vault: update ${path}`,
          content: base64,
          branch: 'main',
        }
        if (existing) {
          // Busca o SHA atual no GitHub (pode ter mudado desde último sync)
          try {
            const remote = await this.apiGet(`/contents/${path}?ref=main`)
            body.sha = remote.sha
          } catch {
            // Arquivo novo no remote? Tenta sem sha
          }
        }
        await this.apiPut(`/contents/${path}`, body)
        this.state.files[path] = { sha: hash, mtime: Date.now() }
        log(`push: ${path}`)
      } catch (err: any) {
        log(`ERRO push ${path}: ${err.message?.slice(0, 80)}`)
      }
    }

    // Delete arquivos removidos
    for (const path of deleted) {
      try {
        const remote = await this.apiGet(`/contents/${path}?ref=main`)
        await this.apiDelete(`/contents/${path}`, {
          message: `vault: delete ${path}`,
          sha: remote.sha,
          branch: 'main',
        })
        delete this.state.files[path]
        log(`delete: ${path}`)
      } catch (err: any) {
        log(`ERRO delete ${path}: ${err.message?.slice(0, 80)}`)
      }
    }

    // Atualiza SHA remoto
    try {
      const ref = await this.apiGet('/git/ref/heads/main')
      this.state.lastRemoteSHA = ref.object?.sha || ''
    } catch {}

    await this.saveState()
    log(`✅ Push: ${changed.length} alterados, ${deleted.length} deletados`)
    return commits
  }

  // ═══════════════════════════════════════════════════════
  //  Pull
  // ═══════════════════════════════════════════════════════

  async pull(onPhase?: (msg: string) => void): Promise<string[]> {
    await this.loadState()
    const commits: string[] = []
    const log = (msg: string) => { commits.push(msg); onPhase?.(msg) }

    log('pull: verificando...')

    // Pega o SHA do HEAD remoto
    let remoteSHA: string
    try {
      const ref = await this.apiGet('/git/ref/heads/main')
      remoteSHA = ref.object?.sha
    } catch {
      log('pull: branch main não existe no remote')
      return commits
    }

    if (remoteSHA === this.state.lastRemoteSHA) {
      log('pull: já atualizado')
      return commits
    }

    // Pega a árvore completa de arquivos
    log('pull: baixando tree...')
    const tree = await this.apiGet(`/git/trees/${remoteSHA}?recursive=1`)
    const files = (tree.tree || []).filter(
      (f: any) => f.type === 'blob' && f.path.endsWith('.md'),
    )

    let downloaded = 0
    for (const f of files) {
      const cached = this.state.files[f.path]
      if (cached && cached.sha === f.sha) continue // já tem

      try {
        const file = await this.apiGet(`/contents/${f.path}?ref=main`)
        if (!file.content) continue

        const content = atob(file.content.replace(/\n/g, ''))
        await this.vault.adapter.write(f.path, content)
        this.state.files[f.path] = { sha: f.sha, mtime: Date.now() }
        downloaded++
      } catch (err: any) {
        log(`ERRO pull ${f.path}: ${err.message?.slice(0, 80)}`)
      }
    }

    this.state.lastRemoteSHA = remoteSHA
    await this.saveState()
    log(`pull: ${downloaded} arquivos atualizados`)
    return commits
  }
}
