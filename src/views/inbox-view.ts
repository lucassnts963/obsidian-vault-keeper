import { ItemView, WorkspaceLeaf, TFile } from 'obsidian'
import type VaultKeeperPlugin from '../main'

export const INBOX_VIEW_TYPE = 'vault-keeper-inbox'

interface InboxItem {
  file: TFile
  status: string
}

export class InboxView extends ItemView {
  plugin: VaultKeeperPlugin
  private items: InboxItem[] = []
  private filter: string = 'all'

  constructor(leaf: WorkspaceLeaf, plugin: VaultKeeperPlugin) {
    super(leaf)
    this.plugin = plugin
  }

  getViewType(): string { return INBOX_VIEW_TYPE }
  getDisplayText(): string { return 'Inbox' }
  getIcon(): string { return 'inbox' }

  async onOpen() {
    await this.refresh()
  }

  async refresh() {
    this.contentEl.empty()
    const { vault } = this.plugin.app
    const inboxPath = this.plugin.settings.inboxPath

    const list = await vault.adapter.list(inboxPath)
    const mdFiles = list.files.filter((f: string) => f.endsWith('.md'))

    if (mdFiles.length === 0) {
      this.contentEl.createEl('p', { text: 'Nenhuma nota no inbox' })
      return
    }

    this.items = []
    for (const f of mdFiles) {
      const path = `${inboxPath}/${f}`
      const raw = await vault.adapter.read(path)
      const status = this.parseStatus(raw)
      this.items.push({ file: { path } as TFile, status })
    }

    this.renderFilters()
    this.renderList()
  }

  private parseStatus(content: string): string {
    if (!content.startsWith('---')) return 'inbox'
    const end = content.indexOf('---', 3)
    if (end === -1) return 'inbox'
    const fm = content.substring(3, end)
    const m = fm.match(/^status:\s*(.+)/m)
    return m ? m[1].trim() : 'inbox'
  }

  private renderFilters() {
    const bar = this.contentEl.createEl('div')
    const filters = [
      { key: 'all', label: 'Todos' },
      { key: 'inbox', label: 'Pendentes' },
      { key: 'approved', label: 'Aprovados' },
      { key: 'rejected', label: 'Rejeitados' },
    ]

    for (const f of filters) {
      const btn = bar.createEl('button', { text: f.label })
      btn.addEventListener('click', () => {
        this.filter = f.key
        this.contentEl.empty()
        this.renderFilters()
        this.renderList()
      })
      if (this.filter === f.key) btn.style.fontWeight = 'bold'
    }
  }

  private renderList() {
    const filtered = this.filter === 'all'
      ? this.items
      : this.items.filter(i => i.status === this.filter)

    const list = this.contentEl.createEl('div')

    for (const item of filtered) {
      const row = list.createEl('div')

      const badge = row.createEl('span')
      badge.textContent = item.status
      badge.style.marginRight = '8px'

      row.createEl('span', { text: item.file.path })

      const approveBtn = row.createEl('button', { text: 'Approvar' })
      approveBtn.addEventListener('click', async () => {
        await this.plugin.wiki.approve(item.file)
        await this.refresh()
      })

      const rejectBtn = row.createEl('button', { text: 'Rejeitar' })
      rejectBtn.addEventListener('click', async () => {
        await this.plugin.wiki.reject(item.file)
        await this.refresh()
      })

      if (item.status === 'approved') {
        const ingestBtn = row.createEl('button', { text: 'Ingest' })
        ingestBtn.addEventListener('click', async () => {
          await this.plugin.wiki.ingestFile(item.file, this.plugin.llm)
          await this.refresh()
        })
      }
    }
  }
}
