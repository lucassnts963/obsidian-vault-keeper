import { ItemView, WorkspaceLeaf } from 'obsidian'
import type VaultKeeperPlugin from '../main'

export const INBOX_VIEW_TYPE = 'vault-keeper-inbox'

export class InboxView extends ItemView {
  plugin: VaultKeeperPlugin

  constructor(leaf: WorkspaceLeaf, plugin: VaultKeeperPlugin) {
    super(leaf)
    this.plugin = plugin
  }

  getViewType(): string { return INBOX_VIEW_TYPE }
  getDisplayText(): string { return 'Inbox' }
  getIcon(): string { return 'inbox' }

  async onOpen() {
    // TODO: listar arquivos do inbox/ com filtro por status
    // Drag & drop pra mudar status (inbox ↔ raw ↔ approved ↔ rejected)
    this.contentEl.createEl('p', { text: 'Inbox — em desenvolvimento' })
  }
}
