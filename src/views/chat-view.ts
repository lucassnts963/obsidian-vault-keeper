import { ItemView, WorkspaceLeaf, Notice } from 'obsidian'
import type VaultKeeperPlugin from '../main'
import { bubble, center, button, collapsible, loadingDots } from './ui'
import { renderMarkdown } from './markdown'
import { CLIBridge } from '../agents/cli-bridge'

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
        const fullMatch = text.match(/\{[\s\S]*"type"[\s\S]*"answer"[\s\S]*\}/)
        if (fullMatch) {
          const parsed = JSON.parse(fullMatch[0])
          if (parsed.content) return parsed.content
        }
      } catch {}
      return m[1].replace(/\\n/g, '\n').replace(/\\"/g, '"').replace(/\\\\/g, '\\')
    }
  }
  return null
}

export const CHAT_VIEW_TYPE = 'vault-keeper-chat'

type MessageRole = 'user' | 'agent' | 'system' | 'cli-output'
interface ChatMessage {
  role: MessageRole
  content: string
  toolResults?: Array<{ tool: string; args: any; result: string }>
}

export class ChatView extends ItemView {
  plugin: VaultKeeperPlugin
  private messages: ChatMessage[] = []
  private cliBridge: CLIBridge | null = null
  private continueSession = false

  constructor(leaf: WorkspaceLeaf, plugin: VaultKeeperPlugin) {
    super(leaf)
    this.plugin = plugin
  }

  getViewType(): string { return CHAT_VIEW_TYPE }
  getDisplayText(): string { return 'Vault Chat' }
  getIcon(): string { return 'message-square' }

  async onOpen() {
    if (this.plugin.settings.cli?.preferred && this.plugin.settings.cli.preferred !== 'none') {
      this.cliBridge = new CLIBridge(this.plugin.settings)
    }
    this.render()
  }

  render() {
    this.contentEl.empty()

    const isCliMode = !!this.cliBridge
    const hasLLM = !!this.plugin.llm

    if (!isCliMode && !hasLLM) {
      center('Nenhuma IA configurada', this.contentEl)
      this.contentEl.createEl('p', {
        text: 'Configure um CLI (Claude Code, Gemini…) em Settings, ' +
          'ou configure um provider LLM para usar o modo interno.',
      })
      return
    }

    // Header
    const header = this.contentEl.createEl('div')
    header.style.display = 'flex'
    header.style.justifyContent = 'space-between'
    header.style.alignItems = 'center'
    header.style.marginBottom = '8px'

    const title = header.createEl('span')
    title.style.fontWeight = 'bold'
    title.style.fontSize = '13px'

    if (isCliMode) {
      const pref = this.plugin.settings.cli?.preferred || 'CLI'
      title.textContent = `Painel CLI — ${pref}`
      if (CLIBridge.isDesktop()) {
        title.textContent += ' ✅'
      } else {
        title.textContent += ' (copiar comando)'
      }

      const contBtn = header.createEl('button')
      contBtn.textContent = '↩ Continuar sessão'
      contBtn.style.fontSize = '11px'
      contBtn.style.padding = '2px 8px'
      contBtn.style.borderRadius = '4px'
      contBtn.style.cursor = 'pointer'
      contBtn.style.border = '1px solid var(--background-modifier-border)'
      contBtn.style.background = this.continueSession
        ? 'var(--interactive-accent)'
        : 'var(--background-secondary)'
      contBtn.style.color = this.continueSession
        ? 'var(--text-on-accent)'
        : 'var(--text-muted)'
      contBtn.title = this.continueSession
        ? 'Vai retomar a última sessão do CLI (--continue). Clique para desativar.'
        : 'Clique para retomar a última sessão do CLI (--continue).'
      contBtn.addEventListener('click', () => {
        this.continueSession = !this.continueSession
        this.render()
      })
    } else {
      title.textContent = 'Vault Chat (modo interno)'
    }

    // Chat area
    const chatArea = this.contentEl.createEl('div')
    chatArea.style.maxHeight = '65vh'
    chatArea.style.overflowY = 'auto'
    chatArea.style.marginBottom = '12px'

    if (this.messages.length === 0) {
      if (isCliMode) {
        center('Descreva uma tarefa para o CLI...', chatArea)
      } else {
        center('Pergunte algo sobre seu vault...', chatArea)
      }
    }

    for (const msg of this.messages) {
      this.renderMessage(chatArea, msg)
    }

    // Input row
    const inputRow = this.contentEl.createEl('div')
    inputRow.style.display = 'flex'
    inputRow.style.gap = '8px'

    const input = inputRow.createEl('input') as HTMLInputElement
    input.placeholder = isCliMode
      ? 'Descreva a tarefa (ex: "ingira raw/artigo.md")…'
      : 'Pergunte algo sobre seu vault…'
    input.style.flex = '1'
    input.style.padding = '8px'
    input.style.border = '1px solid var(--background-modifier-border)'
    input.style.borderRadius = '6px'
    input.style.background = 'var(--background-primary)'
    input.style.color = 'var(--text-normal)'

    const sendLabel = isCliMode ? (CLIBridge.isDesktop() ? 'Executar' : 'Copiar comando') : 'Enviar'
    button(sendLabel, true, () => this.send(input), inputRow)

    input.addEventListener('keydown', (e) => { if (e.key === 'Enter') this.send(input) })

    setTimeout(() => { chatArea.scrollTop = chatArea.scrollHeight }, 50)
  }

  private async send(input: HTMLInputElement) {
    const text = input.value.trim()
    if (!text) return

    input.value = ''
    input.disabled = true

    this.messages.push({ role: 'user', content: text })
    this.render()

    if (this.cliBridge) {
      await this.sendToCLI(text)
    } else {
      await this.sendToLLM(text)
    }

    this.render()
    ;(this.contentEl.querySelector('input') as HTMLInputElement | null)?.focus()
  }

  private async sendToCLI(text: string) {
    const task = this.parseTask(text)
    const cmd = this.cliBridge!.buildCommand(task.type, task.args, this.continueSession)

    if (!cmd) {
      this.messages.push({ role: 'system', content: 'CLI não configurado — configure em Settings.' })
      return
    }

    if (!CLIBridge.isDesktop()) {
      navigator.clipboard.writeText(cmd).catch(() => {})
      new Notice('Comando copiado para a área de transferência')
      this.messages.push({ role: 'cli-output', content: `Comando copiado:\n\`\`\`\n${cmd}\n\`\`\`` })
      return
    }

    const outputLines: string[] = []
    this.messages.push({ role: 'system', content: `▶ ${cmd}` })
    this.render()

    try {
      const vaultPath = (this.plugin.app.vault.adapter as any).basePath || '.'
      await this.cliBridge!.spawn(cmd, vaultPath, (line) => {
        outputLines.push(line)
        this.messages.push({ role: 'cli-output', content: line })
        this.render()
      })
    } catch (err: any) {
      this.messages.push({ role: 'system', content: `Erro ao executar CLI: ${err.message}` })
    }
  }

  private parseTask(text: string): { type: 'ingest' | 'lint' | 'query' | 'focus'; args: Record<string, string> } {
    const lower = text.toLowerCase()

    // Ingest — PT: ingira, ingerir, processar / EN: ingest, process file
    if (/\b(ingest|ingir|ingira|ingerir|processar)\b/.test(lower)) {
      const fileMatch = text.match(/raw\/[\w\-./ ]+\.md/)
      return { type: 'ingest', args: fileMatch ? { file: fileMatch[0] } : {} }
    }

    // Lint/audit — PT: lint, auditoria, auditar, verificar vault / EN: lint, audit
    if (/\b(lint|auditoria|auditar|verificar vault|audit)\b/.test(lower)) {
      return { type: 'lint', args: {} }
    }

    // Focus WRITE — only when explicitly setting/updating focus, not when reading/asking about it.
    // PT: "definir foco", "atualizar foco", "meu foco é X" / EN: "set focus", "focus on", "focus: X"
    if (
      /\b(definir foco|atualizar foco|setar foco|set focus|update focus|focus on)\b/.test(lower) ||
      /\bmeu foco (é|sera|será|vai ser)\b/.test(lower) ||
      /^foco:\s*/i.test(text) ||
      /^focus:\s*/i.test(text)
    ) {
      return { type: 'focus', args: { description: text } }
    }

    // Default: query — includes "qual é meu foco?", topic questions, etc.
    return { type: 'query', args: { question: text } }
  }

  private async sendToLLM(question: string) {
    if (!this.plugin.llm || !this.plugin.agent) return

    const chatArea = this.contentEl.querySelector('div') || this.contentEl
    const loading = loadingDots(chatArea)

    const context = this.plugin.settings.agent.resetContext
      ? []
      : (this.messages as any).slice(-6)

    try {
      const response = await this.plugin.agent.run(question, context)
      loading.remove()
      this.messages.push({
        role: 'agent',
        content: response.answer,
        toolResults: response.steps.map((s: any) => ({ tool: s.tool, args: s.args, result: s.result })),
      })
    } catch (err: any) {
      loading.remove()
      this.messages.push({ role: 'agent', content: `Erro: ${err.message}` })
    }
  }

  private renderMessage(container: HTMLElement, msg: ChatMessage) {
    if (msg.toolResults && msg.toolResults.length > 0) {
      for (const tc of msg.toolResults) {
        const argStr = Object.entries(tc.args)
          .map(([, v]) => `${(v as string).split('/').pop() || v}`)
          .filter(Boolean).join(', ')
        collapsible(`${tc.tool}(${argStr})`, tc.result, container)
      }
    }

    if (msg.role === 'cli-output') {
      const el = container.createEl('div')
      el.style.fontFamily = 'var(--font-monospace)'
      el.style.fontSize = '12px'
      el.style.padding = '4px 8px'
      el.style.color = 'var(--text-muted)'
      el.textContent = msg.content
      return
    }

    if (msg.role === 'system') {
      const el = container.createEl('div')
      el.style.fontSize = '12px'
      el.style.padding = '4px 8px'
      el.style.color = 'var(--text-accent)'
      el.style.fontFamily = 'var(--font-monospace)'
      el.textContent = msg.content
      return
    }

    const isUser = msg.role === 'user'
    const b = bubble(isUser ? 'user' : 'agent', container)

    let display = msg.content
    const extracted = extractAnswerContent(display)
    if (extracted) display = extracted

    const isHtml = display.includes('<h') || display.includes('<strong') ||
      display.includes('<code') || display.includes('<pre')
    b.body.innerHTML = isHtml ? display : renderMarkdown(display)

    b.body.querySelectorAll('.vk-wikilink').forEach((el: any) => {
      el.addEventListener('click', () => {
        const path = el.getAttribute('data-path')
        if (path) this.plugin.app.workspace.openLinkText(path, '', true)
      })
    })
  }
}
