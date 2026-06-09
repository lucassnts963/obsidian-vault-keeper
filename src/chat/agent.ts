import { buildSystemPrompt } from './prompts'
import { executeTool } from './tools'
import type { LLMProvider, Message } from '../llm/provider'

interface ToolCall { type: 'tool'; tool: string; args: any }
interface AnswerCall { type: 'answer'; content: string }
export interface AgentStep { type: 'tool'; tool: string; args: Record<string, any>; result: string }
export interface AgentResponse { steps: AgentStep[]; answer: string }

export class VaultAgent {
  private vault: any
  private llm: LLMProvider
  private indexPath: string
  private maxIterations: number
  private maxFileChars: number
  private wiki: any
  systemPrompt = ''
  private configLoaded = false

  constructor(
    vault: any, llm: LLMProvider,
    settings: { wikiPath: string; indexPath: string },
    wiki?: any,
    maxIterations = 5, maxFileChars = 3000,
  ) {
    this.vault = vault
    this.llm = llm
    this.indexPath = settings.indexPath
    this.wiki = wiki
    this.maxIterations = maxIterations
    this.maxFileChars = maxFileChars
  }

  async ensureConfig(): Promise<void> {
    if (this.configLoaded) return
    let custom: string | null = null
    try {
      const raw = await this.vault.adapter.read('AGENTS.md')
      // Use only the '## Vault Agent' section if present — prevents other content
      // (e.g. dev methodology docs) from polluting the system prompt.
      // If the section is absent, pass null so DEFAULT_AGENT_PROMPT is used instead.
      const section = raw.split(/^(?=## )/m).find((b: string) => b.startsWith('## Vault Agent'))
      custom = section ? section.replace(/^## Vault Agent[^\n]*\n/, '').trim() : null
    } catch {}
    this.systemPrompt = buildSystemPrompt(custom)
    this.configLoaded = true
  }

  parseResponse(text: string): ToolCall | AnswerCall {
    // Strip markdown code blocks
    let cleaned = text.replace(/```json\s*([\s\S]*?)```/g, '$1').replace(/```\s*([\s\S]*?)```/g, '$1').trim()

    // Try to find JSON anywhere in the response
    const match = cleaned.match(/\{[\s\S]*"type"[\s\S]*\}/)
    if (!match) return { type: 'answer', content: text }

    try {
      const parsed = JSON.parse(match[0])
      if (parsed.type === 'tool' && parsed.tool) return parsed as ToolCall
      if (parsed.type === 'answer') return parsed as AnswerCall
      // If JSON exists but no recognized type, treat content field as answer
      if (parsed.content) return { type: 'answer', content: parsed.content }
    } catch {}

    return { type: 'answer', content: text }
  }

  async run(question: string, history: Message[]): Promise<AgentResponse> {
    await this.ensureConfig()

    const messages: Message[] = [
      { role: 'system', content: this.systemPrompt },
      { role: 'user', content: question },
    ]

    const readFiles = new Set<string>()
    const steps: AgentStep[] = []

    for (let iter = 0; iter < this.maxIterations; iter++) {
      const response = await this.llm.chat(messages, { temperature: 0.1 })
      const parsed = this.parseResponse(response)

      if (parsed.type === 'answer') {
        return { steps, answer: parsed.content }
      }

      const toolCall = parsed as ToolCall
      if (readFiles.has(toolCall.tool + ':' + JSON.stringify(toolCall.args))) {
        messages.push({ role: 'user', content: `Já lido. Tente outro caminho ou responda. / Already read. Try another path or answer.` })
        continue
      }

      let result: string
      try {
        result = await executeTool(this.vault, toolCall.tool, toolCall.args, this.indexPath, this.wiki, this.llm, this.maxFileChars)
      } catch (err: any) {
        result = `Tool error: ${err.message}`
      }

      readFiles.add(toolCall.tool + ':' + JSON.stringify(toolCall.args))
      steps.push({ type: 'tool', tool: toolCall.tool, args: toolCall.args, result })
      messages.push({
        role: 'user',
        content: `Tool result for ${toolCall.tool}(${JSON.stringify(toolCall.args)}):\n${result.slice(0, this.maxFileChars)}`,
      })
    }

    const finalMessages: Message[] = [
      { role: 'system', content: this.systemPrompt },
      { role: 'user', content: 'Você atingiu o máximo de chamadas. Responda a pergunta original com o contexto coletado. / You reached the maximum number of tool calls. Answer based on context gathered. Original question: ' + question },
    ]
    const finalResp = await this.llm.chat(finalMessages, { temperature: 0.3 })
    return { steps, answer: finalResp }
  }
}
