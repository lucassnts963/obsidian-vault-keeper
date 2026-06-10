import { requestUrl, type Vault, type DataAdapter, Notice } from 'obsidian'
import { arrayBufferToBase64, base64ToUint8Array } from './base64'

export interface SyncSettings {
  enabled: boolean
  remote: string
  token: string
  authorName: string
  authorEmail: string
  autoSyncMinutes: number
  conflictStrategy?: 'ask' | 'keep-local' | 'keep-remote'
}

export interface FileEntry {
  sha: string
  mtime: number
  size: number
}

export interface SyncState {
  lastRemoteSHA: string
  files: Record<string, FileEntry>
}

const MAX_FILE_SIZE = 1_000_000
const API_DELAY_MS = 100
const MAX_RETRIES = 3
const RETRY_BASE_MS = 500

function parseRemote(url: string): { owner: string; repo: string } | null {
  const m = url.match(/github\.com\/([^/]+)\/([^/]+?)(?:\.git)?\/?$/)
  if (!m) return null
  return { owner: m[1], repo: m[2] }
}

async function sha256(content: ArrayBuffer): Promise<string> {
  try {
    const hash = await crypto.subtle.digest('SHA-256', content)
    return Array.from(new Uint8Array(hash))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('')
  } catch {
    return fallbackSha256(new Uint8Array(content))
  }
}

function fallbackSha256(bytes: Uint8Array): string {
  const K = [
    0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1,
    0x923f82a4, 0xab1c5ed5, 0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3,
    0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174, 0xe49b69c1, 0xefbe4786,
    0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
    0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147,
    0x06ca6351, 0x14292967, 0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13,
    0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85, 0xa2bfe8a1, 0xa81a664b,
    0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
    0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a,
    0x5b9cca4f, 0x682e6ff3, 0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208,
    0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
  ]
  const H = new Uint32Array([0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19])
  const l = bytes.length * 8
  const k = ((448 - (l + 1)) % 512 + 512) % 512
  const paddedLen = (l + 1 + k + 64) / 8
  const padded = new Uint8Array(paddedLen)
  padded.set(bytes)
  padded[bytes.length] = 0x80
  new DataView(padded.buffer).setUint32(paddedLen - 4, l, false)
  for (let offset = 0; offset < paddedLen; offset += 64) {
    const W = new Uint32Array(64)
    for (let t = 0; t < 16; t++) {
      W[t] = (padded[offset + t * 4] << 24) | (padded[offset + t * 4 + 1] << 16) | (padded[offset + t * 4 + 2] << 8) | padded[offset + t * 4 + 3]
    }
    for (let t = 16; t < 64; t++) {
      const s0 = (rotr(W[t - 15], 7) ^ rotr(W[t - 15], 18) ^ (W[t - 15] >>> 3))
      const s1 = (rotr(W[t - 2], 17) ^ rotr(W[t - 2], 19) ^ (W[t - 2] >>> 10))
      W[t] = (W[t - 16] + s0 + W[t - 7] + s1) >>> 0
    }
    let a = H[0], b = H[1], c = H[2], d = H[3], e = H[4], f = H[5], g = H[6], h = H[7]
    for (let t = 0; t < 64; t++) {
      const S1 = (rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25))
      const ch = (e & f) ^ (~e & g)
      const temp1 = (h + S1 + ch + K[t] + W[t]) >>> 0
      const S0 = (rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22))
      const maj = (a & b) ^ (a & c) ^ (b & c)
      const temp2 = (S0 + maj) >>> 0
      h = g; g = f; f = e; e = (d + temp1) >>> 0
      d = c; c = b; b = a; a = (temp1 + temp2) >>> 0
    }
    H[0] = (H[0] + a) >>> 0; H[1] = (H[1] + b) >>> 0
    H[2] = (H[2] + c) >>> 0; H[3] = (H[3] + d) >>> 0
    H[4] = (H[4] + e) >>> 0; H[5] = (H[5] + f) >>> 0
    H[6] = (H[6] + g) >>> 0; H[7] = (H[7] + h) >>> 0
  }
  return Array.from(H).map((v) => v.toString(16).padStart(8, '0')).join('')
}

function rotr(x: number, n: number): number {
  return (x >>> n) | (x << (32 - n))
}

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
    return this.apiRetry(() => requestUrl({ url: `${this.apiBase}${path}`, headers: this.authHeaders(), throw: false }))
  }

  private async apiPut(path: string, body: any): Promise<any> {
    return this.apiRetry(() => requestUrl({
      url: `${this.apiBase}${path}`, method: 'PUT',
      headers: { ...this.authHeaders(), 'Content-Type': 'application/json' },
      body: JSON.stringify(body), throw: false,
    }))
  }

  private async apiDelete(path: string, body: any): Promise<any> {
    return this.apiRetry(() => requestUrl({
      url: `${this.apiBase}${path}`, method: 'DELETE',
      headers: { ...this.authHeaders(), 'Content-Type': 'application/json' },
      body: JSON.stringify(body), throw: false,
    }))
  }

  private async apiRetry(fn: () => Promise<any>): Promise<any> {
    let lastErr: any
    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
      try {
        const res = await fn()
        if (res.status >= 200 && res.status < 300) return res.json
        if (res.status === 404) throw new Error('404')
        const err: any = res.json
        lastErr = new Error(`GitHub API ${res.status}: ${err?.message || 'unknown'}`)
      } catch (e: any) {
        if (e.message === '404') throw e
        lastErr = e
      }
      if (attempt < MAX_RETRIES - 1) await delay(RETRY_BASE_MS * Math.pow(2, attempt))
    }
    throw lastErr
  }

  async loadState(): Promise<void> {
    try {
      const raw = await this.vault.adapter.read(this.statePath)
      const parsed = JSON.parse(raw)
      this.state = { lastRemoteSHA: parsed.lastRemoteSHA || '', files: parsed.files || {} }
    } catch {
      this.state = { lastRemoteSHA: '', files: {} }
    }
  }

  private async saveState(): Promise<void> {
    await this.ensureDataDir()
    await this.vault.adapter.write(this.statePath, JSON.stringify(this.state, null, 2))
  }

  private get backupPath(): string { return `${this.statePath}.backup` }

  private get dataDir(): string | null {
    const idx = this.statePath.lastIndexOf('/')
    if (idx <= 0) return null
    return this.statePath.substring(0, idx)
  }

  private async ensureDataDir(): Promise<void> {
    const dir = this.dataDir
    if (!dir) return
    const exists = await this.vault.adapter.exists(dir)
    if (!exists) await this.vault.adapter.mkdir(dir)
  }

  async backupState(): Promise<void> {
    await this.ensureDataDir()
    const cloned = JSON.parse(JSON.stringify(this.state))
    await this.vault.adapter.write(this.backupPath, JSON.stringify(cloned, null, 2))
  }

  async restoreBackup(): Promise<void> {
    try {
      const raw = await this.vault.adapter.read(this.backupPath)
      if (!raw) return
      const parsed = JSON.parse(raw)
      this.state = { lastRemoteSHA: parsed.lastRemoteSHA || '', files: parsed.files || {} }
    } catch {}
    await this.ensureDataDir()
    await this.vault.adapter.write(this.backupPath, '')
  }

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

  async status(): Promise<{ localChanges: string[]; remoteAhead: boolean; branch: string }> {
    await this.loadState()
    const localChanges: string[] = []
    for await (const f of this.walkFiles('/')) {
      const cached = this.state.files[f]
      let stat: { mtime: number; size: number } | null = null
      try { stat = await this.vault.adapter.stat(f) } catch { continue }
      if (!stat || !cached || cached.size !== stat.size || cached.mtime !== stat.mtime) {
        const buf = await this.vault.adapter.readBinary(f)
        const hash = await sha256(buf)
        if (!cached || cached.sha !== hash) localChanges.push(f)
      }
    }
    for (const f of Object.keys(this.state.files)) {
      if (!localChanges.includes(f)) {
        const exists = await this.vault.adapter.exists(f)
        if (!exists) localChanges.push(f + ' (deletado)')
      }
    }
    let remoteAhead = false
    try {
      const ref = await this.apiGet('/git/ref/heads/main')
      remoteAhead = ref.object?.sha !== this.state.lastRemoteSHA && !!this.state.lastRemoteSHA
    } catch {}
    return { localChanges, remoteAhead, branch: 'main' }
  }

  async quickStatus(): Promise<{ remoteAhead: boolean; branch: string }> {
    try {
      const ref = await this.apiGet('/git/ref/heads/main')
      return { remoteAhead: ref.object?.sha !== this.state.lastRemoteSHA && !!this.state.lastRemoteSHA, branch: 'main' }
    } catch { return { remoteAhead: false, branch: 'main' } }
  }

  async detectConflicts(changedFiles: string[]): Promise<{ path: string; localSHA: string; remoteSHA: string }[]> {
    const conflicts: { path: string; localSHA: string; remoteSHA: string }[] = []
    for (const path of changedFiles) {
      const cached = this.state.files[path]
      if (!cached) continue
      try {
        const remote = await this.apiGet(`/contents/${path}?ref=main`)
        if (remote.sha !== cached.sha) {
          conflicts.push({ path, localSHA: cached.sha, remoteSHA: remote.sha })
        }
      } catch {}
    }
    return conflicts
  }

  async pushFile(path: string): Promise<string> {
    await this.loadState()
    const buf = await this.vault.adapter.readBinary(path)
    const hash = await sha256(buf)
    const base64 = arrayBufferToBase64(buf)
    const body: any = { message: `vault: update ${path}`, content: base64, branch: 'main' }
    const cached = this.state.files[path]
    if (cached) {
      try { const remote = await this.apiGet(`/contents/${path}?ref=main`); body.sha = remote.sha } catch {}
    }
    await this.apiPut(`/contents/${path}`, body)
    this.state.files[path] = { sha: hash, mtime: Date.now(), size: buf.byteLength }
    await this.saveState()
    return path
  }

  async push(onPhase?: (msg: string) => void): Promise<string[]> {
    await this.loadState()
    const commits: string[] = []
    const log = (msg: string) => { commits.push(msg); onPhase?.(msg) }
    log('Scanning vault...')
    const changed: { path: string; hash: string; size: number }[] = []
    const deleted: string[] = []
    const skipped: string[] = []
    for await (const f of this.walkFiles('/')) {
      const stat = await this.vault.adapter.stat(f)
      if (!stat) continue
      if (stat.size > MAX_FILE_SIZE) { skipped.push(f); continue }
      const cached = this.state.files[f]
      if (cached && cached.size === stat.size && cached.mtime === stat.mtime) continue
      const buf = await this.vault.adapter.readBinary(f)
      const hash = await sha256(buf)
      if (!cached || cached.sha !== hash) changed.push({ path: f, hash, size: stat.size })
    }
    for (const f of Object.keys(this.state.files)) {
      const exists = await this.vault.adapter.exists(f)
      if (!exists && !deleted.includes(f)) deleted.push(f)
    }
    if (skipped.length > 0) log(`pulado ${skipped.length} arquivos > 1MB`)
    if (changed.length === 0 && deleted.length === 0) { log('Nada alterado'); return commits }

    const changedPaths = changed.map(c => c.path)
    const conflicts = await this.detectConflicts(changedPaths)
    const conflictSet = new Set(conflicts.map(c => c.path))

    if (conflicts.length > 0) {
      log(`⚠️ ${conflicts.length} conflitos detectados`)
      // Save backup of conflicted files
      for (const c of conflicts) {
        try {
          const content = await this.vault.adapter.read(c.path)
          await this.vault.adapter.write(`${c.path}.conflict.md`, content)
          log(`backup: ${c.path} → ${c.path}.conflict.md`)
        } catch (err: any) { log(`ERRO backup ${c.path}: ${err.message?.slice(0, 80)}`) }
      }
    }

    for (const { path, hash } of changed) {
      if (conflictSet.has(path)) continue

      const file = this.vault.adapter as DataAdapter & { readBinary(path: string): Promise<ArrayBuffer> }
      const content = await file.readBinary(path)
      const b64 = arrayBufferToBase64(content)
      const existing = this.state.files[path]
      try {
        const body: any = { message: `vault: update ${path}`, content: b64, branch: 'main' }
        if (existing) {
          try { const remote = await this.apiGet(`/contents/${path}?ref=main`); body.sha = remote.sha } catch {}
        }
        await this.apiPut(`/contents/${path}`, body)
        this.state.files[path] = { sha: hash, mtime: Date.now(), size: content.byteLength }
        log(`push: ${path}`)
      } catch (err: any) { log(`ERRO push ${path}: ${err.message?.slice(0, 80)}`) }
      await delay(API_DELAY_MS)
    }
    for (const path of deleted) {
      try {
        let remote: any
        try { remote = await this.apiGet(`/contents/${path}?ref=main`) } catch { delete this.state.files[path]; continue }
        await this.apiDelete(`/contents/${path}`, { message: `vault: delete ${path}`, sha: remote.sha, branch: 'main' })
        delete this.state.files[path]
        log(`delete: ${path}`)
      } catch (err: any) { log(`ERRO delete ${path}: ${err.message?.slice(0, 80)}`) }
      await delay(API_DELAY_MS)
    }
    try { const ref = await this.apiGet('/git/ref/heads/main'); this.state.lastRemoteSHA = ref.object?.sha || '' } catch {}
    await this.saveState()
    log(`Push: ${changed.length} alterados, ${deleted.length} deletados`)
    return commits
  }

  async pull(onPhase?: (msg: string) => void): Promise<string[]> {
    await this.loadState()
    const commits: string[] = []
    const log = (msg: string) => { commits.push(msg); onPhase?.(msg) }
    log('pull: verificando...')
    let remoteSHA: string
    try {
      const ref = await this.apiGet('/git/ref/heads/main')
      remoteSHA = ref.object?.sha
    } catch { log('pull: branch main não existe no remote'); return commits }
    if (remoteSHA === this.state.lastRemoteSHA) { log('pull: já atualizado'); return commits }
    log('pull: baixando tree...')
    const tree = await this.apiGet(`/git/trees/${remoteSHA}?recursive=1`)
    const files = (tree.tree || []).filter((f: any) => f.type === 'blob' && f.path.endsWith('.md'))
    let downloaded = 0; let skipped = 0; let backups = 0
    for (const f of files) {
      const cached = this.state.files[f.path]
      if (cached && cached.sha === f.sha) continue
      if (f.size && f.size > MAX_FILE_SIZE) { log(`pulado ${f.path} (>1MB)`); skipped++; continue }
      try {
        // Handle local modifications based on conflictStrategy
        if (cached) {
          try {
            const localBuf = await this.vault.adapter.readBinary(f.path)
            const localHash = await sha256(localBuf)
            if (localHash !== cached.sha) {
              const strategy = this.settings.conflictStrategy ?? 'ask'
              if (strategy === 'keep-local') {
                skipped++
                continue
              }
              const localContent = new TextDecoder('utf-8').decode(localBuf)
              await this.vault.adapter.write(`${f.path}.backup.md`, localContent)
              backups++
            }
          } catch {}
        }

        const file = await this.apiGet(`/contents/${f.path}?ref=main`)
        if (!file.content) continue
        const decoded = base64ToUint8Array(file.content.replace(/\n/g, ''))
        const content = new TextDecoder('utf-8').decode(decoded)
        await this.vault.adapter.write(f.path, content)
        this.state.files[f.path] = { sha: f.sha, mtime: Date.now(), size: new TextEncoder().encode(content).byteLength }
        downloaded++
      } catch (err: any) { log(`ERRO pull ${f.path}: ${err.message?.slice(0, 80)}`) }
      await delay(API_DELAY_MS / 2)
    }
    this.state.lastRemoteSHA = remoteSHA
    await this.saveState()
    log(`pull: ${downloaded} arquivos atualizados`)
    if (backups > 0) log(`pull: ${backups} backups salvos`)
    if (skipped > 0) log(`pull: ${skipped} arquivos pulados (>1MB)`)
    return commits
  }
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}
