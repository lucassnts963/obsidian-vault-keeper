import { ItemView, WorkspaceLeaf } from 'obsidian'
import type VaultKeeperPlugin from '../main'
import { PROMPTS } from '../llm/provider'

export const CHAT_VIEW_TYPE = 'vault-keeper-chat'

export class ChatView extends ItemView {
  plugin: VaultKeeperPlugin
  private messages: Array<{ role: string; content: string }> = []

  constructor(leaf: WorkspaceLeaf, plugin: VaultKeeperPlugin) {
    super(leaf)
    this.plugin = plugin
  }

  getViewType(): string { return CHAT_VIEW_TYPE }
  getDisplayText(): string { return 'Vault Chat' }
  getIcon(): string { return 'message-square' }

  async onOpen() {
    this.render()
  }

  render() {
    this.contentEl.empty()

    if (!this.plugin.llm) {
      this.contentEl.createEl('p', { text: 'LLM não configurado. Configure nas settings.' })
      return
    }

    const chatArea = this.contentEl.createEl('div')
    chatArea.style.maxHeight = '70vh'
    chatArea.style.overflowY = 'auto'
    chatArea.style.marginBottom = '8px'

    for (const msg of this.messages) {
      this.renderMessage(chatArea, msg)
    }

    const inputRow = this.contentEl.createEl('div')
    const input = inputRow.createEl('input') as HTMLInputElement
    input.placeholder = 'Pergunte algo sobre seu vault...'
    input.style.flex = '1'

    const sendBtn = inputRow.createEl('button', { text: 'Enviar' })
    sendBtn.addEventListener('click', () => this.send(input))
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') this.send(input)
    })
  }

  private async send(input: HTMLInputElement) {
    const question = input.value.trim()
    if (!question || !this.plugin.llm) return

    input.value = ''
    input.disabled = true

    this.messages.push({ role: 'user', content: question })
    this.render()

    const context = await this.plugin.wiki.gatherContext(question)
    const msgs = PROMPTS.query(question, context)
    const response = await this.plugin.llm.chat(msgs)

    this.messages.push({ role: 'assistant', content: response })
    this.render()

    input.disabled = false
    input.focus()
  }

  private renderMessage(container: HTMLElement, msg: { role: string; content: string }) {
    const bubble = container.createEl('div')

    if (msg.role === 'user') {
      bubble.createEl('strong', { text: 'Você:' })
      bubble.createEl('p', { text: msg.content })
    } else {
      bubble.createEl('strong', { text: 'LLM:' })
      const p = bubble.createEl('div')
      const parts = msg.content.split(/(\[\[[^\]]+\]\])/g)
      for (const part of parts) {
        if (part.startsWith('[[') && part.endsWith(']]')) {
          const link = p.createEl('a')
          link.textContent = part.slice(2, -2)
          link.style.color = 'var(--link-color)'
          link.style.cursor = 'pointer'
        } else {
          p.createEl('span', { text: part })
        }
      }
    }
  }
}
