import { ItemView, WorkspaceLeaf, Notice } from 'obsidian'
import type VaultKeeperPlugin from '../main'
import { bubble, center, collapsible, loadingDots } from './ui'
import { renderMarkdown } from './markdown'
import { CLIBridge } from '../agents/cli-bridge'

// eslint-disable-next-line no-control-regex
const ANSI_RE = /\x1B\[[0-9;]*[mGKHFJA-Za-z]|\x1B\][^\x07]*\x07|\r/g

function stripAnsi(str: string): string {
  return str.replace(ANSI_RE, '')
}

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

type MessageRole = 'user' | 'agent' | 'system' | 'cli-steps' | 'cli-answer'
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
  private cliRunning = false
  private cliElapsed = 0
  private cliTimer: ReturnType<typeof setInterval> | null = null
  private stepsOpen: Set<number> = new Set()
  private messageEls: Map<number, HTMLElement> = new Map()

  // Persistent layout elements
  private chatAreaEl: HTMLElement | null = null
  private progressEl: HTMLElement | null = null
  private contBtnEl: HTMLButtonElement | null = null
  private inputEl: HTMLInputElement | null = null
  private layoutBuilt = false

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
    this.buildLayout()
  }

  private buildLayout() {
    this.contentEl.empty()
    this.layoutBuilt = false
    this.messageEls.clear()
    this.chatAreaEl = null
    this.progressEl = null
    this.contBtnEl = null
    this.inputEl = null

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

    // Outer container — flex column, full height
    this.contentEl.style.display = 'flex'
    this.contentEl.style.flexDirection = 'column'
    this.contentEl.style.height = '100%'
    this.contentEl.style.overflow = 'hidden'

    // Header (flex-shrink:0)
    const header = this.contentEl.createEl('div')
    header.style.display = 'flex'
    header.style.justifyContent = 'space-between'
    header.style.alignItems = 'center'
    header.style.padding = '8px'
    header.style.flexShrink = '0'
    header.style.borderBottom = '1px solid var(--background-modifier-border)'

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

      const contBtn = header.createEl('button') as HTMLButtonElement
      this.contBtnEl = contBtn
      contBtn.style.fontSize = '11px'
      contBtn.style.padding = '2px 8px'
      contBtn.style.borderRadius = '4px'
      contBtn.style.cursor = 'pointer'
      contBtn.style.border = '1px solid var(--background-modifier-border)'
      contBtn.addEventListener('click', () => {
        this.continueSession = !this.continueSession
        this.updateContBtn()
      })
      this.updateContBtn()
    } else {
      title.textContent = 'Vault Chat (modo interno)'
    }

    // Chat area (flex:1, overflow-y:auto)
    const chatArea = this.contentEl.createEl('div')
    chatArea.style.flex = '1'
    chatArea.style.overflowY = 'auto'
    chatArea.style.padding = '8px'
    this.chatAreaEl = chatArea

    if (this.messages.length === 0) {
      if (isCliMode) {
        center('Descreva uma tarefa para o CLI...', chatArea)
      } else {
        center('Pergunte algo sobre seu vault...', chatArea)
      }
    } else {
      this.messages.forEach((msg, idx) => {
        const el = this.createMessageEl(msg, idx)
        chatArea.appendChild(el)
        this.messageEls.set(idx, el)
      })
    }

    // Progress element (flex-shrink:0)
    const prog = this.contentEl.createEl('div')
    prog.style.flexShrink = '0'
    prog.style.fontFamily = 'var(--font-monospace)'
    prog.style.fontSize = '12px'
    prog.style.padding = '0 8px'
    prog.style.color = 'var(--text-accent)'
    prog.style.minHeight = '0'
    this.progressEl = prog
    this.updateProgress()

    // Input row (flex-shrink:0)
    const inputRow = this.contentEl.createEl('div')
    inputRow.style.display = 'flex'
    inputRow.style.gap = '8px'
    inputRow.style.padding = '8px'
    inputRow.style.flexShrink = '0'
    inputRow.style.borderTop = '1px solid var(--background-modifier-border)'

    const input = inputRow.createEl('input') as HTMLInputElement
    this.inputEl = input
    input.placeholder = isCliMode
      ? 'Descreva a tarefa (ex: "ingira raw/artigo.md")…'
      : 'Pergunte algo sobre seu vault…'
    input.style.flex = '1'
    input.style.padding = '8px'
    input.style.border = '1px solid var(--background-modifier-border)'
    input.style.borderRadius = '6px'
    input.style.background = 'var(--background-primary)'
    input.style.color = 'var(--text-normal)'

    // Round send button with ➤ icon
    const sendBtn = inputRow.createEl('button') as HTMLButtonElement
    sendBtn.innerHTML = '&#10148;'
    sendBtn.title = 'Enviar'
    sendBtn.style.width = '36px'
    sendBtn.style.height = '36px'
    sendBtn.style.borderRadius = '50%'
    sendBtn.style.border = 'none'
    sendBtn.style.cursor = 'pointer'
    sendBtn.style.background = 'var(--interactive-accent)'
    sendBtn.style.color = 'var(--text-on-accent)'
    sendBtn.style.fontSize = '16px'
    sendBtn.style.display = 'flex'
    sendBtn.style.alignItems = 'center'
    sendBtn.style.justifyContent = 'center'
    sendBtn.style.flexShrink = '0'
    sendBtn.addEventListener('click', () => this.send(input))

    input.addEventListener('keydown', (e) => { if (e.key === 'Enter') this.send(input) })

    this.layoutBuilt = true
    this.scrollToBottom()
  }

  private updateContBtn() {
    if (!this.contBtnEl) return
    const btn = this.contBtnEl
    btn.textContent = '↩ Continuar sessão'
    btn.style.background = this.continueSession
      ? 'var(--interactive-accent)'
      : 'var(--background-secondary)'
    btn.style.color = this.continueSession
      ? 'var(--text-on-accent)'
      : 'var(--text-muted)'
    btn.title = this.continueSession
      ? 'Vai retomar a última sessão do CLI (--continue). Clique para desativar.'
      : 'Clique para retomar a última sessão do CLI (--continue).'
  }

  private updateProgress() {
    if (!this.progressEl) return
    if (this.cliRunning) {
      const dots = '.'.repeat((this.cliElapsed % 3) + 1).padEnd(3, ' ')
      this.progressEl.textContent = `⏳ Processando${dots} ${this.cliElapsed}s`
      this.progressEl.style.padding = '4px 8px'
    } else {
      this.progressEl.textContent = ''
      this.progressEl.style.padding = '0 8px'
    }
  }

  private appendMessageEl(msg: ChatMessage, idx: number) {
    if (!this.chatAreaEl) return

    // Remove empty-state placeholder if present
    const placeholder = this.chatAreaEl.querySelector('[data-placeholder]')
    if (placeholder) placeholder.remove()

    const el = this.createMessageEl(msg, idx)
    this.chatAreaEl.appendChild(el)
    this.messageEls.set(idx, el)
    this.scrollToBottom()
  }

  private updateMessageEl(idx: number, msg: ChatMessage) {
    const el = this.messageEls.get(idx)
    if (!el) {
      this.appendMessageEl(msg, idx)
      return
    }
    el.empty()
    this.fillMessageEl(el, msg, idx)
    this.scrollToBottom()
  }

  private createMessageEl(msg: ChatMessage, idx: number): HTMLElement {
    const wrapper = document.createElement('div')
    // Add empty() method for compatibility
    ;(wrapper as any).empty = () => { while (wrapper.firstChild) wrapper.removeChild(wrapper.firstChild) }
    this.fillMessageEl(wrapper, msg, idx)
    return wrapper
  }

  private fillMessageEl(container: HTMLElement, msg: ChatMessage, msgIndex = -1) {
    if (msg.toolResults && msg.toolResults.length > 0) {
      for (const tc of msg.toolResults) {
        const argStr = Object.entries(tc.args)
          .map(([, v]) => `${(v as string).split('/').pop() || v}`)
          .filter(Boolean).join(', ')
        collapsible(`${tc.tool}(${argStr})`, tc.result, container)
      }
    }

    // Processing steps — collapsible <details> block
    if (msg.role === 'cli-steps') {
      if (!msg.content.trim()) return
      const lines = msg.content.split('\n').filter(Boolean)
      const details = container.createEl('details')
      if (this.stepsOpen.has(msgIndex)) details.setAttribute('open', '')
      details.style.margin = '4px 0'

      const summary = details.createEl('summary')
      summary.style.cursor = 'pointer'
      summary.style.fontSize = '11px'
      summary.style.color = 'var(--text-muted)'
      summary.style.padding = '2px 4px'
      summary.style.userSelect = 'none'
      summary.textContent = `${lines.length} etapa${lines.length !== 1 ? 's' : ''} de processamento`

      const pre = details.createEl('pre')
      pre.style.fontSize = '11px'
      pre.style.color = 'var(--text-muted)'
      pre.style.margin = '4px 0 0'
      pre.style.padding = '6px 8px'
      pre.style.background = 'var(--background-secondary)'
      pre.style.borderRadius = '4px'
      pre.style.maxHeight = '180px'
      pre.style.overflowY = 'auto'
      pre.style.whiteSpace = 'pre-wrap'
      pre.textContent = lines.join('\n')

      details.addEventListener('toggle', () => {
        if (details.open) this.stepsOpen.add(msgIndex)
        else this.stepsOpen.delete(msgIndex)
      })
      return
    }

    // Final CLI answer — rendered as markdown in an agent bubble
    if (msg.role === 'cli-answer') {
      if (!msg.content.trim()) return
      const b = bubble('agent', container)
      b.body.innerHTML = renderMarkdown(msg.content)
      b.body.querySelectorAll('.vk-wikilink').forEach((el: any) => {
        el.addEventListener('click', () => {
          const path = el.getAttribute('data-path')
          if (path) this.plugin.app.workspace.openLinkText(path, '', true)
        })
      })
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

  private scrollToBottom() {
    if (!this.chatAreaEl) return
    const el = this.chatAreaEl
    requestAnimationFrame(() => {
      el.scrollTop = el.scrollHeight
    })
  }

  private async send(input: HTMLInputElement) {
    const text = input.value.trim()
    if (!text) return

    input.value = ''
    input.disabled = true

    const userMsg: ChatMessage = { role: 'user', content: text }
    const userIdx = this.messages.length
    this.messages.push(userMsg)
    this.appendMessageEl(userMsg, userIdx)

    if (this.cliBridge) {
      await this.sendToCLI(text)
    } else {
      await this.sendToLLM(text)
    }

    input.disabled = false
    input.focus()
  }

  private async sendToCLI(text: string) {
    const task = this.parseTask(text)
    const cmd = this.cliBridge!.buildCommand(task.type, task.args, this.continueSession)

    if (!cmd) {
      const sysMsg: ChatMessage = { role: 'system', content: 'CLI não configurado — configure em Settings.' }
      const sysIdx = this.messages.length
      this.messages.push(sysMsg)
      this.appendMessageEl(sysMsg, sysIdx)
      return
    }

    if (!CLIBridge.isDesktop()) {
      navigator.clipboard.writeText(cmd).catch(() => {})
      new Notice('Comando copiado para a área de transferência')
      const copyMsg: ChatMessage = { role: 'system', content: `Comando copiado:\n\`\`\`\n${cmd}\n\`\`\`` }
      const copyIdx = this.messages.length
      this.messages.push(copyMsg)
      this.appendMessageEl(copyMsg, copyIdx)
      return
    }

    const cmdMsg: ChatMessage = { role: 'system', content: `▶ ${cmd}` }
    const cmdIdx = this.messages.length
    this.messages.push(cmdMsg)
    this.appendMessageEl(cmdMsg, cmdIdx)

    // Reserve slots for steps (collapsible) and answer (markdown) — updated in place
    const stepsIdx = this.messages.length
    const stepsMsg: ChatMessage = { role: 'cli-steps', content: '' }
    this.messages.push(stepsMsg)
    this.stepsOpen.add(stepsIdx) // auto-open while running
    this.appendMessageEl(stepsMsg, stepsIdx)

    const answerIdx = this.messages.length
    const answerMsg: ChatMessage = { role: 'cli-answer', content: '' }
    this.messages.push(answerMsg)
    this.appendMessageEl(answerMsg, answerIdx)

    this.cliRunning = true
    this.cliElapsed = 0
    this.cliTimer = setInterval(() => {
      this.cliElapsed++
      this.updateProgress()
    }, 1000)
    this.updateProgress()

    const stepLines: string[] = []
    const outLines: string[] = []
    let timedOut = false

    try {
      const vaultPath = (this.plugin.app.vault.adapter as any).basePath || '.'
      const result = await this.cliBridge!.spawn(
        cmd,
        vaultPath,
        (line) => {
          const clean = stripAnsi(line)
          if (!clean.trim()) return
          outLines.push(clean)
          this.messages[answerIdx] = { role: 'cli-answer', content: outLines.join('\n') }
          this.updateMessageEl(answerIdx, this.messages[answerIdx])
        },
        (line) => {
          const clean = stripAnsi(line)
          if (!clean.trim()) return
          stepLines.push(clean)
          this.messages[stepsIdx] = { role: 'cli-steps', content: stepLines.join('\n') }
          this.updateMessageEl(stepsIdx, this.messages[stepsIdx])
        },
      )
      timedOut = result.timedOut
    } catch (err: any) {
      const errMsg: ChatMessage = { role: 'system', content: `Erro ao executar CLI: ${err.message}` }
      const errIdx = this.messages.length
      this.messages.push(errMsg)
      this.appendMessageEl(errMsg, errIdx)
    } finally {
      if (this.cliTimer) { clearInterval(this.cliTimer); this.cliTimer = null }
      this.cliRunning = false
      this.updateProgress()

      // Remove empty placeholder messages from DOM
      if (!stepLines.length) {
        const stepsEl = this.messageEls.get(stepsIdx)
        if (stepsEl) stepsEl.remove()
        this.messageEls.delete(stepsIdx)
      }
      const emptyAnswerEl = this.messageEls.get(answerIdx)
      if (!outLines.length && emptyAnswerEl) {
        emptyAnswerEl.remove()
        this.messageEls.delete(answerIdx)
      }

      let finalMsg: ChatMessage
      if (timedOut) {
        finalMsg = {
          role: 'system',
          content: `⏱️ Timeout (${this.cliElapsed}s): processo encerrado. O CLI pode não suportar modo não-interativo.`,
        }
      } else if (!outLines.length && !stepLines.length) {
        finalMsg = {
          role: 'system',
          content: `⚠️ CLI concluiu sem produzir saída (${this.cliElapsed}s).`,
        }
      } else {
        finalMsg = { role: 'system', content: `✅ Concluído (${this.cliElapsed}s)` }
      }
      const finalIdx = this.messages.length
      this.messages.push(finalMsg)
      this.appendMessageEl(finalMsg, finalIdx)
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

    const loading = this.chatAreaEl ? loadingDots(this.chatAreaEl) : null

    const context = this.plugin.settings.agent?.resetContext
      ? []
      : (this.messages as any).slice(-6)

    try {
      const response = await this.plugin.agent.run(question, context)
      if (loading) loading.remove()
      const agentMsg: ChatMessage = {
        role: 'agent',
        content: response.answer,
        toolResults: response.steps.map((s: any) => ({ tool: s.tool, args: s.args, result: s.result })),
      }
      const agentIdx = this.messages.length
      this.messages.push(agentMsg)
      this.appendMessageEl(agentMsg, agentIdx)
    } catch (err: any) {
      if (loading) loading.remove()
      const errMsg: ChatMessage = { role: 'agent', content: `Erro: ${err.message}` }
      const errIdx = this.messages.length
      this.messages.push(errMsg)
      this.appendMessageEl(errMsg, errIdx)
    }
  }
}
