import type { VaultKeeperSettings } from '../settings'

export type AgentCLI = 'claude' | 'opencode' | 'gemini' | 'agy' | 'custom'

export function buildMethodologyInstructions(settings?: Partial<VaultKeeperSettings>): string {
  const inbox = settings?.inboxPath ?? 'inbox'
  const raw = settings?.rawPath ?? 'raw'
  const wiki = settings?.wikiPath ?? 'wiki'
  const projects = settings?.vaults?.projects ?? []

  const projectBlock = projects.length > 0 ? `

## Projetos / Projects
${projects.map(p => `- **${p.name}** → \`${p.path}/\`${p.remote ? ` (repo: ${p.remote})` : ''}`).join('\n')}

### Contexto de projeto / Project context (B-007)
Fontes em \`projects/X/raw/\` → output em \`projects/X/wiki/{slug}.md\`.
Links no index SEMPRE usam formato project-relative: \`[[wiki/slug|Título]]\`.
Notas da raiz com foco ativo em projeto → slug prefixado: \`[[wiki/projeto-slug]]\` (evita colisão).` : ''

  return `## Idioma / Language
Responda sempre no mesmo idioma que o usuário usar.
Always respond in the same language the user writes in.

## Estrutura do Vault / Vault Structure
- \`${inbox}/\`        → notas brutas a revisar / raw notes to review (status: inbox)
- \`${raw}/\`          → aprovadas aguardando ingest / approved, awaiting ingest (status: approved)
- \`${wiki}/\`         → páginas compiladas / compiled knowledge pages (status: ingested)
- \`${wiki}/_slots/\`  → estado de sessão / session state (focus.md, lint-report.md…)
- \`.vault-keeper/bm25-index.json\` → índice BM25 leve / lightweight full-text index${projectBlock}

## Fluxos / Karpathy Methodology Flows

### Ingest
Leia / Read \`${raw}/{arquivo/file}\`. Produza / Produce \`${wiki}/{slug}.md\` com / with YAML frontmatter:
  title, category, tags, summary, key_entities, date, source
Adicione linha em / Add row to \`${wiki}/index.md\`. Marque a fonte com \`status: ingested\`.

### Lint / Auditoria
Escaneie / Scan \`${wiki}/\` para / for: frontmatter ausente / missing frontmatter,
páginas órfãs / orphaned pages, entradas faltando no index / missing index entries.
Escreva relatório / Write report em / to \`${wiki}/_slots/lint-report.md\`.

### Query / Consulta
Use \`.vault-keeper/bm25-index.json\` para encontrar / to find relevant pages.
Responda citando / Answer citing \`[[${wiki}/nome-da-pagina]]\`. Nunca invente fatos / Never invent facts.

### Focus / Foco
Escreva / Write the current task description em / to \`_slots/focus.md\`.
Leia ao iniciar sessão / Read at session start para contexto / for context.

## Regras de Link / Link Rules (B-007)

Links em arquivos wiki SEMPRE usam formato project-relative:
  \`[[wiki/nome-da-pagina]]\`  ← correto (resolve no vault standalone e no vault raiz)
  \`[[projects/X/wiki/nome]]\` ← NUNCA USAR (quebra no vault standalone)

No vault raiz, Obsidian resolve \`[[wiki/slug]]\` para \`projects/X/wiki/slug.md\` via shortest-path
(válido desde que não exista \`wiki/slug.md\` homônimo na raiz — prefixo de projeto evita isso).`
}

export const VAULT_METHODOLOGY_INSTRUCTIONS = buildMethodologyInstructions()

export class CLIBridge {
  private currentProc: any = null

  constructor(private settings: VaultKeeperSettings) {}

  abort(): void {
    if (!this.currentProc) return
    const proc = this.currentProc
    proc.kill('SIGTERM')
    setTimeout(() => { try { proc.kill('SIGKILL') } catch {} }, 3000)
    this.currentProc = null
  }

  static async detect(): Promise<AgentCLI | null> {
    if (typeof process === 'undefined' || !process.versions) return null
    let execSync: ((cmd: string, opts: any) => unknown) | null = null
    try {
      execSync = require('child_process').execSync
    } catch {
      return null
    }
    if (!execSync) return null

    const candidates: AgentCLI[] = ['claude', 'opencode', 'gemini', 'agy']
    for (const cli of candidates) {
      try {
        execSync(`which ${cli}`, { stdio: 'ignore' })
        return cli
      } catch {}
    }
    return null
  }

  static buildInstructions(settings?: VaultKeeperSettings): { 'CLAUDE.md': string; 'GEMINI.md': string; 'AGENTS.md': string } {
    const body = buildMethodologyInstructions(settings)
    return {
      'CLAUDE.md': `# Vault Keeper — Instruções para Claude Code\n\n${body}\n`,
      'GEMINI.md': `# Vault Keeper — Instruções para Gemini CLI\n\n${body}\n`,
      'AGENTS.md': `# Vault Keeper — Instruções para Agentes\n\n## Vault Agent\n\n${body}\n`,
    }
  }

  buildCommand(
    task: 'ingest' | 'lint' | 'query' | 'focus',
    args: Record<string, string> = {},
    continueSession = false,
  ): string {
    const cli = this.resolvedBinary()
    if (!cli) return ''

    const pref = this.settings.cli?.preferred
    // Instruction file per CLI
    const instrFile = pref === 'gemini' ? 'GEMINI.md'
      : (pref === 'opencode' || pref === 'agy') ? 'AGENTS.md'
      : 'CLAUDE.md'

    // Session continuation flags per CLI:
    //   claude / gemini / agy → --continue  (before -p)
    //   opencode              → --continue  (after `run`)
    const cont = continueSession ? ' --continue' : ''

    // Non-interactive invocation syntax per CLI:
    //   claude / gemini / agy → <cli> [--continue] -p "message"
    //   opencode              → opencode run [--continue] "message"
    const prompt = (message: string) =>
      pref === 'opencode'
        ? `${cli} run${cont} "${message}"`
        : `${cli}${cont} -p "${message}"`

    switch (task) {
      case 'ingest':
        return prompt(`Ingira (ingest) o arquivo ${args.file || 'raw/'} seguindo as instruções em ${instrFile}`)
      case 'lint':
        return prompt(`Execute o fluxo de lint (auditoria) do vault seguindo as instruções em ${instrFile}`)
      case 'query':
        return prompt(`${args.question || 'Responda a consulta sobre o vault'} (veja ${instrFile})`)
      case 'focus':
        return prompt(`Atualize wiki/_slots/focus.md com: ${args.description || 'tarefa atual'} (veja ${instrFile})`)
    }
  }

  private resolvedBinary(): string | null {
    const pref = this.settings.cli?.preferred
    if (!pref || pref === 'none') return null
    if (pref === 'custom') return this.settings.cli?.customBinaryPath || null
    return pref
  }

  static isDesktop(): boolean {
    return (
      (typeof process !== 'undefined' && !!process.versions?.electron) ||
      typeof (globalThis as any).__electronAPI !== 'undefined'
    )
  }

  async spawn(
    command: string,
    cwd: string,
    onStdout: (line: string) => void,
    onStderr?: (line: string) => void,
    timeoutMs = 300_000,
  ): Promise<{ exitCode: number; stdout: string; timedOut: boolean }> {
    if (!CLIBridge.isDesktop()) {
      throw new Error('spawn() only available on desktop (Electron)')
    }

    const { spawn } = require('child_process')

    return new Promise((resolve, reject) => {
      // opencode is a TUI — needs CI=1 + TERM=dumb to enter non-interactive mode.
      // Other CLIs (agy, claude, gemini) work with their default env; CI=1 can
      // suppress their output entirely, so we only set NO_COLOR to keep ANSI clean.
      const pref = this.settings.cli?.preferred
      const env = pref === 'opencode'
        ? { ...process.env, CI: '1', NO_COLOR: '1', TERM: 'dumb' }
        : { ...process.env, NO_COLOR: '1' }

      // stdin: 'ignore' sends EOF immediately — prevents TUI CLIs from hanging.
      const proc = spawn(command, {
        cwd,
        shell: true,
        stdio: ['ignore', 'pipe', 'pipe'],
        env,
      })
      this.currentProc = proc
      const lines: string[] = []
      let timedOut = false

      // timeoutMs === 0 means no timeout (e.g. opencode which may run long)
      const killTimer = timeoutMs > 0 ? setTimeout(() => {
        timedOut = true
        proc.kill('SIGTERM')
        setTimeout(() => proc.kill('SIGKILL'), 3000)
      }, timeoutMs) : null

      proc.stdout.on('data', (chunk: Buffer) => {
        for (const line of chunk.toString().split('\n')) {
          if (line.trim()) { lines.push(line); onStdout(line) }
        }
      })

      proc.stderr.on('data', (chunk: Buffer) => {
        for (const line of chunk.toString().split('\n')) {
          const trimmed = line.trim()
          if (trimmed) {
            if (onStderr) onStderr(trimmed)
            else onStdout('⚠️ ' + trimmed)
          }
        }
      })

      proc.on('close', (code: number | null) => {
        this.currentProc = null
        if (killTimer) clearTimeout(killTimer)
        resolve({ exitCode: code ?? 0, stdout: lines.join('\n'), timedOut })
      })
      proc.on('error', (err: Error) => { if (killTimer) clearTimeout(killTimer); reject(err) })
    })
  }
}
