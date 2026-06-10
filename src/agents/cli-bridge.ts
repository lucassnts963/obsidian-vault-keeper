import type { VaultKeeperSettings } from '../settings'

export type AgentCLI = 'claude' | 'opencode' | 'gemini' | 'custom'

export const VAULT_METHODOLOGY_INSTRUCTIONS = `## Idioma / Language
Responda sempre no mesmo idioma que o usuário usar.
Always respond in the same language the user writes in.

## Estrutura do Vault / Vault Structure
- inbox/        → notas brutas a revisar / raw notes to review (status: inbox)
- raw/          → aprovadas aguardando ingest / approved, awaiting ingest (status: approved)
- wiki/         → páginas compiladas / compiled knowledge pages (status: ingested)
- _slots/       → estado de sessão / session state (focus.md, lint-report.md…)
- .vault-keeper/bm25-index.json → índice BM25 leve / lightweight full-text index

## Fluxos / Karpathy Methodology Flows

### Ingest
Leia / Read raw/{arquivo/file}. Produza / Produce wiki/{slug}.md com / with YAML frontmatter:
  title, category, tags, summary, key_entities, date, source
Adicione linha em / Add row to wiki/index.md. Marque a fonte com status: ingested.

### Lint / Auditoria
Escaneie / Scan wiki/ para / for: frontmatter ausente / missing frontmatter,
páginas órfãs / orphaned pages, entradas faltando no index / missing index entries.
Escreva relatório / Write report em / to _slots/lint-report.md.

### Query / Consulta
Use .vault-keeper/bm25-index.json para encontrar / to find relevant pages.
Responda citando / Answer citing [[wiki/nome-da-pagina/page-name]]. Nunca invente fatos / Never invent facts.

### Focus / Foco
Escreva / Write the current task description em / to _slots/focus.md.
Leia ao iniciar sessão / Read at session start para contexto / for context.`

export class CLIBridge {
  constructor(private settings: VaultKeeperSettings) {}

  static async detect(): Promise<AgentCLI | null> {
    if (typeof process === 'undefined' || !process.versions) return null
    let execSync: ((cmd: string, opts: any) => unknown) | null = null
    try {
      const cp = await import('child_process')
      execSync = cp.execSync
    } catch {
      return null
    }
    if (!execSync) return null

    const candidates: AgentCLI[] = ['claude', 'opencode', 'gemini']
    for (const cli of candidates) {
      try {
        execSync(`which ${cli}`, { stdio: 'ignore' })
        return cli
      } catch {}
    }
    return null
  }

  static buildInstructions(): { 'CLAUDE.md': string; 'GEMINI.md': string; 'AGENTS.md': string } {
    const body = VAULT_METHODOLOGY_INSTRUCTIONS
    return {
      'CLAUDE.md': `# Vault Keeper — Instruções para Claude Code\n\n${body}\n`,
      'GEMINI.md': `# Vault Keeper — Instruções para Gemini CLI\n\n${body}\n`,
      'AGENTS.md': `# Vault Keeper — Instruções para Agentes\n\n## Vault Agent\n\n${body}\n`,
    }
  }

  buildCommand(task: 'ingest' | 'lint' | 'query' | 'focus', args: Record<string, string> = {}): string {
    const cli = this.resolvedBinary()
    if (!cli) return ''

    const pref = this.settings.cli?.preferred
    const instrFile = pref === 'gemini' ? 'GEMINI.md' : pref === 'opencode' ? 'AGENTS.md' : 'CLAUDE.md'

    switch (task) {
      case 'ingest':
        return `${cli} -p "Ingira (ingest) o arquivo ${args.file || 'raw/'} seguindo as instruções em ${instrFile}"`
      case 'lint':
        return `${cli} -p "Execute o fluxo de lint (auditoria) do vault seguindo as instruções em ${instrFile}"`
      case 'query':
        return `${cli} -p "${args.question || 'Responda a consulta sobre o vault'} (veja ${instrFile})"`
      case 'focus':
        return `${cli} -p "Atualize _slots/focus.md com: ${args.description || 'tarefa atual'} (veja ${instrFile})"`
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
    onLine: (line: string) => void,
  ): Promise<{ exitCode: number; stdout: string }> {
    if (!CLIBridge.isDesktop()) {
      throw new Error('spawn() only available on desktop (Electron)')
    }

    const { spawn } = await import('child_process')

    return new Promise((resolve, reject) => {
      const proc = spawn(command, { cwd, shell: true })
      const lines: string[] = []

      proc.stdout.on('data', (chunk: Buffer) => {
        for (const line of chunk.toString().split('\n')) {
          if (line.trim()) { lines.push(line); onLine(line) }
        }
      })

      proc.stderr.on('data', (chunk: Buffer) => {
        const line = chunk.toString().trim()
        if (line) onLine('⚠️ ' + line)
      })

      proc.on('close', (code: number | null) => resolve({ exitCode: code ?? 0, stdout: lines.join('\n') }))
      proc.on('error', reject)
    })
  }
}
