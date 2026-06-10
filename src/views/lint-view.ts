import { ItemView, WorkspaceLeaf, Notice } from 'obsidian'
import type VaultKeeperPlugin from '../main'
import { card, badge, center, button, normalizePath } from './ui'

export const LINT_VIEW_TYPE = 'vault-keeper-lint'

interface LintIssue { severity: 'error' | 'warning'; page: string; path: string; description: string }

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
    center('Auditando...', this.contentEl)

    const issues = await this.runLint()
    this.contentEl.empty()

    if (issues.length === 0) {
      center('Nenhum problema encontrado', this.contentEl)
      return
    }
    this.renderReport(issues)
  }

  private async runLint(): Promise<LintIssue[]> {
    const issues: LintIssue[] = []
    const { vault } = this.plugin.app
    const wikiPath = this.plugin.settings.wikiPath

    let list: { files: string[]; folders: string[] }
    try {
      list = await vault.adapter.list(wikiPath)
    } catch {
      try { await vault.adapter.mkdir(wikiPath) } catch {}
      return issues
    }

    const mdFiles = list.files.filter((f: string) => {
      if (!f.endsWith('.md')) return false
      // Exclude system files — they are not regular wiki pages
      const indexFile = (this.plugin.settings.indexPath ?? 'wiki/index.md').split('/').pop()
      const logFile = (this.plugin.settings.logPath ?? 'wiki/log.md').split('/').pop()
      return f !== indexFile && f !== logFile
    })
    if (mdFiles.length === 0) return issues

    const pageContents: Record<string, string> = {}
    for (const f of mdFiles) {
      try {
        const path = normalizePath(wikiPath, f)
        pageContents[f] = await vault.adapter.read(path)
      } catch {
        issues.push({ severity: 'error', page: f, path: normalizePath(wikiPath, f), description: 'Não foi possível ler o arquivo' })
      }
    }

    // Frontmatter check
    for (const f of mdFiles) {
      const content = pageContents[f]
      if (!content) continue
      if (!content.startsWith('---')) {
        issues.push({ severity: 'error', page: f, path: normalizePath(wikiPath, f), description: 'Frontmatter YAML inválido (não começa com ---)' })
        continue
      }
      if (content.indexOf('---', 3) === -1) {
        issues.push({ severity: 'error', page: f, path: normalizePath(wikiPath, f), description: 'Frontmatter YAML não fechado' })
      }
    }

    // Extract links
    const links: Record<string, string[]> = {}
    for (const f of mdFiles) {
      const content = pageContents[f]
      if (!content) continue
      const refs = content.match(/\[\[([^\]]+)\]\]/g)
      links[f] = refs ? refs.map(r => r.slice(2, -2).split('|')[0].split('/').pop()!.trim()) : []
    }

    // Build linked-to set
    const linkedTo = new Set<string>()
    for (const [, refs] of Object.entries(links)) {
      for (const ref of refs) {
        linkedTo.add(ref + '.md')
      }
    }

    // Orphan detection — no threshold, detects with any number of pages
    if (Object.keys(links).length >= 1) {
      for (const f of mdFiles) {
        if (!linkedTo.has(f) && !linkedTo.has(f.replace('.md', ''))) {
          issues.push({ severity: 'warning', page: f, path: normalizePath(wikiPath, f), description: 'Página órfã (sem links de entrada)' })
        }
      }
    }

    // Index check
    try {
      const indexPath = this.plugin.settings.indexPath
      const indexContent = await vault.adapter.read(indexPath)
      for (const f of mdFiles) {
        const name = f.replace('.md', '')
        if (!indexContent.includes(name) && !indexContent.includes(f)) {
          issues.push({ severity: 'warning', page: f, path: normalizePath(wikiPath, f), description: 'Página ausente do index.md' })
        }
      }
    } catch {
      issues.push({ severity: 'warning', page: 'index.md', path: this.plugin.settings.indexPath, description: 'Index não encontrado' })
    }

    return issues
  }

  private renderReport(issues: LintIssue[]) {
    const { vault } = this.plugin.app
    const indexPath = this.plugin.settings.indexPath
    const wikiPath = this.plugin.settings.wikiPath

    button('Executar novamente', false, () => this.onOpen(), this.contentEl)
    this.contentEl.createEl('h3', { text: `Auditoria — ${issues.length} problemas` })

    for (const issue of issues) {
      const c = card(this.contentEl)
      c.style.display = 'flex'
      c.style.alignItems = 'center'
      c.style.flexWrap = 'wrap'
      c.style.gap = '4px'

      const color = issue.severity === 'error' ? 'var(--color-red)' : 'var(--color-orange)'
      badge(issue.severity === 'error' ? 'ERRO' : 'WARN', color, c)

      const info = c.createEl('div')
      info.style.flex = '1'
      const pageEl = info.createEl('strong', { text: issue.page })
      pageEl.style.color = 'var(--text-accent)'
      pageEl.style.cursor = 'pointer'
      pageEl.style.textDecoration = 'underline'
      pageEl.addEventListener('click', () => {
        this.plugin.app.workspace.openLinkText(issue.path, '', true)
      })
      info.createEl('span', { text: ` — ${issue.description}` })

      const actions = c.createEl('div')

      button('Abrir', false, () => {
        this.plugin.app.workspace.openLinkText(issue.path, '', true)
      }, actions)

      if (issue.description === 'Página ausente do index.md') {
        button('Adicionar ao index', true, async () => {
          try {
            const name = issue.page.replace('.md', '')
            const entry = `| [[${wikiPath}/${name}|${name}]] | - | - |`
            const exists = await vault.adapter.exists(indexPath)
            if (exists) {
              const content = await vault.adapter.read(indexPath)
              await vault.adapter.write(indexPath, content + '\n' + entry)
            } else {
              await vault.adapter.write(indexPath, `| Página | Categoria | Tags |\n|--------|-----------|------|\n${entry}`)
            }
            await this.onOpen()
          } catch (err: any) {
            new Notice(`Erro ao adicionar ao index: ${err.message}`, 5000)
          }
        }, actions)
      }
    }
  }
}
