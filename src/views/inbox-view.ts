import { ItemView, WorkspaceLeaf, TFile, Notice } from 'obsidian'
import type VaultKeeperPlugin from '../main'
import { card, badge, center, button, normalizePath, parseStatus } from './ui'

export const INBOX_VIEW_TYPE = 'vault-keeper-inbox'

interface InboxItem { file: TFile; status: string; title: string }

export class InboxView extends ItemView {
  plugin: VaultKeeperPlugin
  private items: InboxItem[] = []
  private filter = 'all'
  private loaded = false

  constructor(leaf: WorkspaceLeaf, plugin: VaultKeeperPlugin) {
    super(leaf)
    this.plugin = plugin
    if (!this.loaded) center('Carregando...', this.contentEl)
  }

  getViewType(): string { return INBOX_VIEW_TYPE }
  getDisplayText(): string { return 'Inbox' }
  getIcon(): string { return 'inbox' }

  async onOpen() {
    await this.refresh()
  }

  async refresh() {
    this.contentEl.empty()
    this.loaded = false
    center('Carregando...', this.contentEl)

    const { vault } = this.plugin.app
    const dir = this.plugin.settings.inboxPath

    let mdFiles: string[] = []
    try {
      const list = await vault.adapter.list(dir)
      mdFiles = list.files.filter((f: string) => f.endsWith('.md'))
    } catch {
      try { await vault.adapter.mkdir(dir) } catch {}
    }

    if (mdFiles.length === 0) {
      this.contentEl.empty()
      center(`Nenhuma nota em "${dir}/"`, this.contentEl)
      this.contentEl.createEl('p', { text: 'Escreva uma nota na pasta inbox para começar.' })
      this.loaded = true
      return
    }

    this.items = []
    for (const f of mdFiles) {
      try {
        const path = normalizePath(dir, f)
        const raw = await vault.adapter.read(path)
        const status = parseStatus(raw)
        const title = raw.match(/^title:\s*(.+)/m)?.[1]?.replace(/"/g, '') || f
        this.items.push({ file: { path } as TFile, status, title })
      } catch {}
    }

    this.contentEl.empty()
    this.renderFilters()
    this.renderList()
    this.loaded = true
  }

  private renderFilters() {
    const bar = this.contentEl.createEl('div')
    bar.style.marginBottom = '8px'

    const all = this.items.length
    const inbox = this.items.filter(i => i.status === 'inbox').length
    const approved = this.items.filter(i => i.status === 'approved').length
    const rejected = this.items.filter(i => i.status === 'rejected').length

    const filters = [
      { key: 'all', label: `Todos (${all})` },
      { key: 'inbox', label: `Pendentes (${inbox})` },
      { key: 'approved', label: `Aprovados (${approved})` },
      { key: 'rejected', label: `Rejeitados (${rejected})` },
    ]

    for (const f of filters) {
      button(f.label, this.filter === f.key, () => {
        this.filter = f.key
        this.contentEl.empty()
        this.renderFilters()
        this.renderList()
      }, bar)
    }
  }

  private renderList() {
    const filtered = this.filter === 'all'
      ? this.items
      : this.items.filter(i => i.status === this.filter)

    if (filtered.length === 0) {
      center('Nenhum item neste filtro', this.contentEl)
      return
    }

    for (const item of filtered) {
      const c = card(this.contentEl)
      c.style.display = 'flex'
      c.style.alignItems = 'center'

      const colors: Record<string, string> = {
        inbox: 'var(--color-orange)',
        approved: 'var(--color-green)',
        rejected: 'var(--color-red)',
        ingested: '#4a9eff',
      }
      badge(item.status, colors[item.status] || '#888', c)

      const info = c.createEl('div')
      info.style.flex = '1'
      info.style.cursor = 'pointer'
      const titleEl = info.createEl('div', { text: item.title })
      titleEl.style.color = 'var(--text-accent)'
      titleEl.style.textDecoration = 'underline'
      info.createEl('small', { text: item.file.path }).style.color = 'var(--text-muted)'
      titleEl.addEventListener('click', () => {
        this.plugin.app.workspace.openLinkText(item.file.path, '', true)
      })

      const actions = c.createEl('div')

      if (item.status === 'approved') {
        button('Ingest', false, async () => {
          try {
            await this.plugin.wiki.ingestFile(item.file, this.plugin.llm)
            new Notice(`Ingest concluído: ${item.title}`)
            await this.refresh()
          } catch (err: any) {
            new Notice(`Falha no ingest: ${err.message}`, 8000)
          }
        }, actions)
      }

      button('Approvar', item.status === 'inbox', async () => {
        await this.plugin.wiki.approve(item.file)
        await this.refresh()
      }, actions)

      button('Rejeitar', false, async () => {
        await this.plugin.wiki.reject(item.file)
        await this.refresh()
      }, actions)
    }
  }
}
