import { ItemView, WorkspaceLeaf } from 'obsidian'
import type VaultKeeperPlugin from '../main'

export const LINT_VIEW_TYPE = 'vault-keeper-lint'

interface LintIssue {
  severity: 'error' | 'warning'
  page: string
  description: string
}

export class LintView extends ItemView {
  plugin: VaultKeeperPlugin

  constructor(leaf: WorkspaceLeaf, plugin: VaultKeeperPlugin) {
    super(leaf)
    this.plugin = plugin
  }

  getViewType(): string { return LINT_VIEW_TYPE }
  getDisplayText(): string { return 'Auditoria' }
  getIcon(): string { return 'search' }

  async onOpen() {
    this.contentEl.empty()
    const issues = await this.runLint()
    if (issues.length === 0) {
      this.contentEl.createEl('p', { text: 'Nenhum problema encontrado' })
      return
    }
    this.renderReport(issues)
  }

  private async runLint(): Promise<LintIssue[]> {
    const issues: LintIssue[] = []
    const { vault } = this.plugin.app
    const wikiPath = this.plugin.settings.wikiPath

    try {
      const list = await vault.adapter.list(wikiPath)
      const mdFiles = list.files.filter((f: string) => f.endsWith('.md'))

      const pageContents: Record<string, string> = {}
      for (const f of mdFiles) {
        const path = `${wikiPath}/${f}`
        try {
          const content = await vault.adapter.read(path)
          pageContents[f] = content
        } catch {
          issues.push({ severity: 'error', page: f, description: 'Não foi possível ler o arquivo' })
        }
      }

      for (const f of mdFiles) {
        const content = pageContents[f]
        if (!content) continue

        if (!content.startsWith('---')) {
          issues.push({ severity: 'error', page: f, description: 'Frontmatter YAML inválido (não começa com ---)' })
          continue
        }
        const end = content.indexOf('---', 3)
        if (end === -1) {
          issues.push({ severity: 'error', page: f, description: 'Frontmatter YAML não fechado' })
          continue
        }
      }

      const links: Record<string, string[]> = {}
      for (const f of mdFiles) {
        const content = pageContents[f]
        if (!content) continue
        const refs = content.match(/\[\[([^\]]+)\]\]/g)
        if (refs) links[f] = refs.map(r => r.slice(2, -2).split('|')[0].trim())
        else links[f] = []
      }

      const linkedTo: Set<string> = new Set()
      for (const [, refs] of Object.entries(links)) {
        for (const ref of refs) {
          const refFile = ref.split('/').pop() || ''
          linkedTo.add(refFile + '.md')
          linkedTo.add(ref + '.md')
        }
      }

      for (const f of mdFiles) {
        if (!linkedTo.has(f) && Object.keys(links).length > 1) {
          issues.push({ severity: 'warning', page: f, description: 'Página órfã (sem links de entrada)' })
        }
      }

      try {
        const indexPath = this.plugin.settings.indexPath
        const indexContent = await vault.adapter.read(indexPath)
        for (const f of mdFiles) {
          if (!indexContent.includes(f)) {
            issues.push({ severity: 'warning', page: f, description: 'Página ausente do index.md' })
          }
        }
      } catch {
        issues.push({ severity: 'warning', page: 'index.md', description: 'Index não encontrado' })
      }

    } catch {
      issues.push({ severity: 'error', page: wikiPath, description: 'Não foi possível listar o diretório wiki' })
    }

    return issues
  }

  private renderReport(issues: LintIssue[]) {
    this.contentEl.createEl('h3', { text: `Auditoria — ${issues.length} problemas` })

    const table = this.contentEl.createEl('div')

    for (const issue of issues) {
      const row = table.createEl('div')

      const badge = row.createEl('span')
      badge.textContent = issue.severity === 'error' ? 'ERRO' : 'WARN'
      badge.style.color = issue.severity === 'error' ? 'red' : 'orange'
      badge.style.marginRight = '8px'

      row.createEl('strong', { text: issue.page })
      row.createEl('span', { text: ` — ${issue.description}` })
    }
  }
}
