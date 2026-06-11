/**
 * Manages _slots/ state files — mutable session context the agent reads and
 * the curator writes. Follows the Karpathy LLM Wiki pattern for live state
 * that persists across sessions without polluting the compiled wiki.
 * Pure-TS: no obsidian import, adapter injected via constructor.
 */

interface VaultAdapter {
  read(path: string): Promise<string>
  write(path: string, content: string): Promise<void>
  exists(path: string): Promise<boolean>
  mkdir(path: string): Promise<void>
}

export interface FocusState {
  projects: string[]   // vault-relative paths, e.g. ['projects/alpha']
  includeRoot: boolean // also include vault root content (outside projects/)
}

export class SlotsManager {
  static readonly slotsDir = 'wiki/_slots'
  static readonly EMPTY_FOCUS: FocusState = { projects: [], includeRoot: false }

  constructor(private readonly adapter: VaultAdapter) {}

  async readSlot(name: string): Promise<string | null> {
    try {
      return await this.adapter.read(`${SlotsManager.slotsDir}/${name}.md`)
    } catch {
      return null
    }
  }

  async writeSlot(name: string, content: string): Promise<void> {
    const dirExists = await this.adapter.exists(SlotsManager.slotsDir)
    if (!dirExists) await this.adapter.mkdir(SlotsManager.slotsDir)
    await this.adapter.write(`${SlotsManager.slotsDir}/${name}.md`, content)
  }

  async getFocus(): Promise<FocusState> {
    try {
      const raw = await this.adapter.read(`${SlotsManager.slotsDir}/focus.md`)
      const m = raw.match(/^---\n([\s\S]*?)\n---/)
      if (!m) return { ...SlotsManager.EMPTY_FOCUS }
      const fm = m[1]
      const projectsMatch = fm.match(/^projects:\s*\[([^\]]*)\]/m)
      const projects = projectsMatch
        ? projectsMatch[1].split(',').map(s => s.trim().replace(/^["']|["']$/g, '')).filter(Boolean)
        : []
      const includeRoot = /^includeRoot:\s*true/m.test(fm)
      return { projects, includeRoot }
    } catch {
      return { ...SlotsManager.EMPTY_FOCUS }
    }
  }

  async setFocus(state: FocusState): Promise<void> {
    const names = state.projects.map(p => p.split('/').pop() || p)
    const body = names.length > 0
      ? `Projetos em foco: ${names.join(', ')}. Priorize conteúdo desses projetos.`
      : 'Sem foco específico — comportamento vault-wide.'
    const fm = [
      '---',
      `projects: [${state.projects.map(p => `"${p}"`).join(', ')}]`,
      `includeRoot: ${state.includeRoot}`,
      '---',
    ].join('\n')
    await this.writeSlot('focus', `${fm}\n\n${body}`)
  }
}
