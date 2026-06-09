import { ItemView, WorkspaceLeaf } from 'obsidian'
import type VaultKeeperPlugin from '../main'
import { card, badge, center, button } from './ui'

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
      center('LLM não configurado', this.contentEl)
      this.contentEl.createEl('p', { text: 'Configure o provider nas settings para usar o chat.' })
      return
    }

    const chatArea = this.contentEl.createEl('div')
    chatArea.style.maxHeight = '70vh'
    chatArea.style.overflowY = 'auto'
    chatArea.style.marginBottom = '12px'

    if (this.messages.length === 0) {
      center('Pergunte algo sobre seu vault...', chatArea)
    }

    for (const msg of this.messages) {
      this.renderMessage(chatArea, msg)
    }

    const inputRow = this.contentEl.createEl('div')
    inputRow.style.display = 'flex'
    inputRow.style.gap = '8px'

    const input = inputRow.createEl('input') as HTMLInputElement
    input.placeholder = 'Pergunte algo sobre seu vault...'
    input.style.flex = '1'
    input.style.padding = '8px'
    input.style.border = '1px solid var(--background-modifier-border)'
    input.style.borderRadius = '6px'
    input.style.background = 'var(--background-primary)'
    input.style.color = 'var(--text-normal)'

    const send = button('Enviar', true, () => this.send(input), inputRow)

    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') this.send(input)
    })

    // Scroll to bottom
    setTimeout(() => { chatArea.scrollTop = chatArea.scrollHeight }, 50)
  }

  private async send(input: HTMLInputElement) {
    const question = input.value.trim()
    if (!question || !this.plugin.llm || !this.plugin.agent) return

    input.value = ''
    input.disabled = true

    this.messages.push({ role: 'user', content: question })
    this.render()

    const response = await this.plugin.agent.run(question, this.messages as any)

    this.messages.push({ role: 'assistant', content: response })
    this.render()

    input.disabled = false
    input.focus()
  }

  private renderMessage(container: HTMLElement, msg: { role: string; content: string }) {
    const c = card(container)
    c.style.marginBottom = '8px'

    if (msg.role === 'user') {
      badge('Você', 'var(--text-accent)', c)
    } else {
      badge('LLM', 'var(--color-green)', c)
    }

    const body = c.createEl('div')
    body.style.marginTop = '6px'

    const parts = msg.content.split(/(\[\[[^\]]+\]\])/g)
    for (const part of parts) {
      if (part.startsWith('[[') && part.endsWith(']]')) {
        const link = body.createEl('a')
        link.textContent = part.slice(2, -2)
        link.style.color = 'var(--link-color)'
        link.style.cursor = 'pointer'
        link.style.textDecoration = 'underline'
      } else {
        body.createEl('span', { text: part })
      }
    }
  }
}
