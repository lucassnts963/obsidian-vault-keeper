import type { VaultKeeperSettings } from '../settings'

export type AgentCLI = 'claude' | 'opencode' | 'gemini' | 'custom'

export const VAULT_METHODOLOGY_INSTRUCTIONS = `## Estrutura do Vault
- inbox/        → notas brutas a revisar (status: inbox)
- raw/          → aprovadas aguardando ingest (status: approved)
- wiki/         → páginas compiladas (status: ingested)
- _slots/       → estado de sessão (focus.md, lint-report.md…)
- .vault-keeper/bm25-index.json → índice BM25 leve

## Fluxos da Metodologia Karpathy

### Ingest
Leia raw/{arquivo}. Produza wiki/{slug}.md com frontmatter YAML:
  title, category, tags, summary, key_entities, date, source
Adicione linha na tabela wiki/index.md. Marque source com status: ingested.

### Lint
Escaneie wiki/ para: frontmatter ausente, páginas órfãs, entradas faltando no index.
Escreva relatório em _slots/lint-report.md.

### Query
Use .vault-keeper/bm25-index.json para encontrar páginas relevantes.
Responda citando [[wiki/nome-da-pagina]]. Nunca invente fatos.

### Focus
Escreva descrição da tarefa atual em _slots/focus.md.`

export class CLIBridge {
  constructor(private settings: VaultKeeperSettings) {}

  static async detect(): Promise<AgentCLI | null> {
    if (typeof process === 'undefined' || !process.versions) return null
    let execSync: ((cmd: string, opts: any) => void) | null = null
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

    switch (task) {
      case 'ingest':
        return `${cli} -p "Ingira o arquivo ${args.file || 'raw/'} seguindo as instruções em CLAUDE.md"`
      case 'lint':
        return `${cli} -p "Execute o fluxo de lint do vault seguindo as instruções em CLAUDE.md"`
      case 'query':
        return `${cli} -p "${args.question || 'Responda a consulta sobre o vault seguindo CLAUDE.md'}"`
      case 'focus':
        return `${cli} -p "Atualize _slots/focus.md com: ${args.description || 'tarefa atual'}"`
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
