import { Platform, type Vault } from 'obsidian'
import type { VaultKeeperSettings } from '../settings'

export interface ProbeResult {
  ok: boolean
  value?: any
  error?: string
}

export interface DiagnosticReport {
  timestamp: string
  platform: Record<string, ProbeResult>
  rootList: Record<string, ProbeResult>
  mdCount: ProbeResult
  paths: Record<string, { exists: ProbeResult; list: ProbeResult }>
  dataDir: {
    exists: ProbeResult
    mkdir: ProbeResult
    write: ProbeResult
    read: ProbeResult
    remove: ProbeResult
  }
  github: Record<string, ProbeResult>
  pushDryRun: ProbeResult
}

const PROBE_PATHS = ['', 'inbox', 'raw', 'wiki', 'wiki/_slots', '.obsidian', '.obsidian/vault-keeper']
const DATA_DIR = '.obsidian/vault-keeper'
const PROBE_FILE = `${DATA_DIR}/_diag_probe.json`

function parseRemote(url: string): { owner: string; repo: string } | null {
  const m = url.match(/github\.com\/([^/]+)\/([^/]+?)(?:\.git)?\/?$/)
  if (!m) return null
  return { owner: m[1], repo: m[2] }
}

async function probe<T>(fn: () => Promise<T>): Promise<ProbeResult> {
  try {
    const value = await fn()
    return { ok: true, value }
  } catch (e: any) {
    return { ok: false, error: e?.message ?? String(e) }
  }
}

async function countMdFiles(adapter: any, dir = ''): Promise<number> {
  let count = 0
  try {
    const list = await adapter.list(dir || '')
    const strip = (name: string) =>
      dir && name.startsWith(dir + '/') ? name.slice(dir.length + 1) : name
    for (const f of list.files) {
      const base = strip(f)
      if (base.endsWith('.md') && !base.startsWith('.')) count++
    }
    for (const sub of list.folders) {
      const base = strip(sub)
      if (!base.startsWith('.') && base !== '') count += await countMdFiles(adapter, dir ? `${dir}/${base}` : base)
    }
  } catch { /* stop walk on error */ }
  return count
}

export async function runDiagnostics(vault: Vault, settings: VaultKeeperSettings): Promise<DiagnosticReport> {
  const adapter = vault.adapter as any
  const ts = new Date().toISOString()

  // A. Platform
  const platform: Record<string, ProbeResult> = {
    isDesktopApp: await probe(async () => (Platform as any).isDesktopApp),
    isMobileApp:  await probe(async () => (Platform as any).isMobileApp),
    isAndroidApp: await probe(async () => (Platform as any).isAndroidApp),
    isIosApp:     await probe(async () => (Platform as any).isIosApp),
    adapterClass: await probe(async () => adapter?.constructor?.name ?? 'unknown'),
    basePath:     await probe(async () => adapter?.basePath ?? null),
  }

  // B. Root listing — the critical walkFiles entry point
  const rootList: Record<string, ProbeResult> = {
    'list("")':  await probe(async () => {
      const r = await adapter.list('')
      return `files:${r.files.length} folders:${r.folders.length}`
    }),
    'list("/")': await probe(async () => {
      const r = await adapter.list('/')
      return `files:${r.files.length} folders:${r.folders.length}`
    }),
  }
  const mdCount = await probe(async () => await countMdFiles(adapter))

  // C. Known vault paths
  const paths: Record<string, { exists: ProbeResult; list: ProbeResult }> = {}
  for (const p of PROBE_PATHS) {
    paths[p || '(root)'] = {
      exists: await probe(async () => await adapter.exists(p || '')),
      list:   await probe(async () => {
        const r = await adapter.list(p || '')
        return `files:${r.files.length} folders:${r.folders.length}`
      }),
    }
  }

  // D. Write roundtrip in dataDir
  const ddExists = await probe(async () => await adapter.exists(DATA_DIR))
  const ddMkdir  = ddExists.value
    ? { ok: true, value: 'already exists' }
    : await probe(async () => { await adapter.mkdir(DATA_DIR); return 'created' })
  const ddWrite  = await probe(async () => { await adapter.write(PROBE_FILE, '{"t":1}'); return 'ok' })
  const ddRead   = await probe(async () => {
    const c = await adapter.read(PROBE_FILE)
    return c === '{"t":1}' ? 'roundtrip ok' : `mismatch: ${c}`
  })
  const ddRemove = await probe(async () => { await adapter.remove(PROBE_FILE); return 'ok' })

  const dataDir = { exists: ddExists, mkdir: ddMkdir, write: ddWrite, read: ddRead, remove: ddRemove }

  // E. GitHub config (no token leak)
  const remote = settings.git.remote || ''
  const parsed = parseRemote(remote)
  const token = settings.git.token || ''
  const github: Record<string, ProbeResult> = {
    enabled:    { ok: true, value: settings.git.enabled },
    remote:     { ok: !!parsed, value: parsed ? `${parsed.owner}/${parsed.repo}` : `unparseable: ${remote}` },
    tokenLen:   { ok: token.length > 0, value: token.length > 0 ? `${token.length} chars` : 'empty' },
    statePath:  { ok: true, value: `${DATA_DIR}/sync_state.json` },
  }

  // F. Push dry-run: count files walkFiles would collect (no API calls)
  const pushDryRun = await probe(async () => {
    let changed = 0; let errors = 0
    const walk = async (dir = ''): Promise<void> => {
      let list: any
      try { list = await adapter.list(dir || '') } catch { errors++; return }
      const strip = (name: string) =>
        dir && name.startsWith(dir + '/') ? name.slice(dir.length + 1) : name
      for (const f of list.files) {
        const base = strip(f)
        if (!base.endsWith('.md') || base.startsWith('.')) continue
        const path = dir ? `${dir}/${base}` : base
        try {
          const stat = await adapter.stat(path)
          if (stat) changed++
        } catch { errors++ }
      }
      for (const sub of list.folders) {
        const base = strip(sub)
        if (!base.startsWith('.') && base !== '') await walk(dir ? `${dir}/${base}` : base)
      }
    }
    await walk()
    return `${changed} md files found, ${errors} errors`
  })

  return { timestamp: ts, platform, rootList, mdCount, paths, dataDir, github, pushDryRun }
}

function r(p: ProbeResult): string {
  return p.ok ? `✅ ${JSON.stringify(p.value)}` : `❌ ${p.error}`
}

export function toMarkdown(report: DiagnosticReport): string {
  const lines: string[] = [
    `# Vault Keeper — Diagnóstico`,
    `**Gerado em:** ${report.timestamp}`,
    '',
    '## A. Plataforma',
    ...Object.entries(report.platform).map(([k, v]) => `- **${k}**: ${r(v)}`),
    '',
    '## B. Listagem da raiz',
    ...Object.entries(report.rootList).map(([k, v]) => `- **${k}**: ${r(v)}`),
    `- **md count (walk)**: ${r(report.mdCount)}`,
    '',
    '## C. Paths do vault',
    ...Object.entries(report.paths).flatMap(([p, { exists, list }]) => [
      `### \`${p}\``,
      `- exists: ${r(exists)}`,
      `- list:   ${r(list)}`,
    ]),
    '',
    '## D. Roundtrip de escrita (.obsidian/vault-keeper)',
    `- exists: ${r(report.dataDir.exists)}`,
    `- mkdir:  ${r(report.dataDir.mkdir)}`,
    `- write:  ${r(report.dataDir.write)}`,
    `- read:   ${r(report.dataDir.read)}`,
    `- remove: ${r(report.dataDir.remove)}`,
    '',
    '## E. Configuração GitHub',
    ...Object.entries(report.github).map(([k, v]) => `- **${k}**: ${r(v)}`),
    '',
    '## F. Dry-run push (sem rede)',
    `- ${r(report.pushDryRun)}`,
  ]
  return lines.join('\n')
}
