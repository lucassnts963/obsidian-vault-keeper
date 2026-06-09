import { ItemView, WorkspaceLeaf } from 'obsidian'
import type VaultKeeperPlugin from '../main'
import { bubble, center, button, collapsible, loadingDots } from './ui'
import { renderMarkdown } from './markdown'

export function extractAnswerContent(text: string): string | null {
  // Try find JSON with answer content anywhere
  const patterns = [
    /\{[\s\S]*?"type"\s*:\s*"answer"[\s\S]*?"content"\s*:\s*"([\s\S]*?)(?:"\s*\}|"\s*,\s*")/,
    /"content"\s*:\s*"((?:[^"\\]|\\.)*)"/,
  ]
  for (const p of patterns) {
    const m = text.match(p)
    if (m && m[1]) {
      try {
        // Try full JSON parse first
        const fullMatch = text.match(/\{[\s\S]*"type"[\s\S]*"answer"[\s\S]*\}/)
        if (fullMatch) {
          const parsed = JSON.parse(fullMatch[0])
          if (parsed.content) return parsed.content
        }
      } catch {}
      // Fallback: regex extraction with unescaping
      return m[1].replace(/\\n/g, '\n').replace(/\\"/g, '"').replace(/\\\\/g, '\\')
    }
  }
  return null
}

export const CHAT_VIEW_TYPE = 'vault-keeper-chat'

export class ChatView extends ItemView {
  plugin: VaultKeeperPlugin
  private messages: Array<{ role: string; content: string; toolResults?: Array<{ tool: string; args: any; result: string }> }> = []

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

    button('Enviar', true, () => this.send(input), inputRow)

    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') this.send(input)
    })

    setTimeout(() => { chatArea.scrollTop = chatArea.scrollHeight }, 50)
  }

  private async send(input: HTMLInputElement) {
    const question = input.value.trim()
    if (!question || !this.plugin.llm || !this.plugin.agent) return

    input.value = ''
    input.disabled = true

    this.messages.push({ role: 'user', content: question })
    this.render()

    // Loading indicator
    const loading = loadingDots(this.contentEl.querySelector('div') || this.contentEl)

    const context = this.plugin.settings.agent.resetContext
      ? []
      : (this.messages as any).slice(-6)
    const response = await this.plugin.agent.run(question, context)

    loading.remove()

    this.messages.push({
      role: 'assistant',
      content: response.answer,
      toolResults: response.steps.map(s => ({ tool: s.tool, args: s.args, result: s.result })),
    })
    this.render()

    input.disabled = false
    input.focus()
  }

  private renderMessage(container: HTMLElement, msg: { role: string; content: string; toolResults?: Array<{ tool: string; args: any; result: string }> }) {
    // Agent tool calls — show before the answer bubble
    if (msg.toolResults && msg.toolResults.length > 0) {
      for (const tc of msg.toolResults) {
        const argStr = Object.entries(tc.args).map(([k, v]) => `${(v as string).split('/').pop() || v}`).filter(Boolean).join(', ')
        collapsible(`${tc.tool}(${argStr})`, tc.result, container)
      }
    }

    const isUser = msg.role === 'user'
    const b = bubble(isUser ? 'user' : 'agent', container)

    const rawContent = msg.content
    let displayContent = rawContent

    // Fallback: try extract JSON content from anywhere
    const extracted = extractAnswerContent(rawContent)
    if (extracted) displayContent = extracted

    const isAlreadyHtml = displayContent.includes('<h') || displayContent.includes('<strong') || displayContent.includes('<code') || displayContent.includes('<pre')

    b.body.innerHTML = isAlreadyHtml ? displayContent : renderMarkdown(displayContent)

    // Wire up wikilink clicks
    b.body.querySelectorAll('.vk-wikilink').forEach((el: any) => {
      el.addEventListener('click', () => {
        const path = el.getAttribute('data-path')
        if (path) this.plugin.app.workspace.openLinkText(path, '', true)
      })
    })
  }
}
