import { ItemView, WorkspaceLeaf } from 'obsidian'
import type VaultKeeperPlugin from '../main'

export const CHAT_VIEW_TYPE = 'vault-keeper-chat'

export class ChatView extends ItemView {
  plugin: VaultKeeperPlugin

  constructor(leaf: WorkspaceLeaf, plugin: VaultKeeperPlugin) {
    super(leaf)
    this.plugin = plugin
  }

  getViewType(): string { return CHAT_VIEW_TYPE }
  getDisplayText(): string { return 'Vault Chat' }
  getIcon(): string { return 'message-square' }

  async onOpen() {
    // TODO: chat com LLM sobre o vault
    // - Input de pergunta
    // - Resposta com citações [[wiki/pagina]]
    // - Histórico da conversa
    this.contentEl.createEl('p', { text: 'Vault Chat — em desenvolvimento' })
  }
}
