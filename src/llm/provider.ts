import type { LLMSettings } from '../settings'

export interface Message {
  role: 'system' | 'user' | 'assistant'
  content: string
}

export interface ChatOptions {
  temperature?: number
  maxTokens?: number
}

export interface LLMProvider {
  chat(messages: Message[], options?: ChatOptions): Promise<string>
  models?(): Promise<string[]>
}

/**
 * Factory: cria o provider baseado na config.
 * Agnóstico a modelo — o usuário escolhe qualquer endpoint OpenAI-compatible.
 */
export function createProvider(settings: LLMSettings): LLMProvider | null {
  if (!settings.endpoint || !settings.model) return null

  let baseUrl = settings.endpoint.replace(/\/+$/, '')
  if (!baseUrl.endsWith('/v1') && !baseUrl.includes('/v1/')) {
    baseUrl += '/v1'
  }

  return {
    async chat(messages, options = {}) {
      const url = `${baseUrl}/chat/completions`

      const controller = new AbortController()
      const timeout = setTimeout(() => controller.abort(), 60000)

      try {
        const body: Record<string, unknown> = {
          model: settings.model,
          messages,
          temperature: options.temperature ?? 0.3,
          max_tokens: options.maxTokens ?? settings.maxTokens ?? 4096,
        }

        const headers: Record<string, string> = {
          'Content-Type': 'application/json',
        }
        if (settings.apiKey) {
          headers['Authorization'] = `Bearer ${settings.apiKey}`
        }

        const response = await fetch(url, {
          method: 'POST',
          headers,
          body: JSON.stringify(body),
          signal: controller.signal,
        })

        if (!response.ok) {
          const err = await response.text()
          throw new Error(`LLM error ${response.status}: ${err.slice(0, 200)}`)
        }

        const data = await response.json()
        const content = data?.choices?.[0]?.message?.content
        if (typeof content !== 'string') {
          throw new Error(`Resposta inesperada da API: ${JSON.stringify(data).slice(0, 200)}`)
        }
        return content
      } finally {
        clearTimeout(timeout)
      }
    },

    async models() {
      const url = `${baseUrl}/models`
      const headers: Record<string, string> = {}
      if (settings.apiKey) headers['Authorization'] = `Bearer ${settings.apiKey}`

      try {
        const res = await fetch(url, { headers })
        const data = await res.json()
        return data.data?.map((m: { id: string }) => m.id) ?? []
      } catch {
        return [settings.model]
      }
    },
  }
}

/** Prompt templates for each operation */
export const PROMPTS = {
  ingest: (sourceContent: string, sourcePath: string): Message[] => [
    {
      role: 'system',
      content: `Você é um curador de wiki. Leia a fonte abaixo e proponha uma página wiki.
Siga FAITHFULNESS: toda afirmação deve ter base na fonte.
Retorne em formato JSON:
{
  "title": "Título da página",
  "category": "categoria",
  "tags": ["tag1", "tag2"],
  "key_entities": ["EntidadeChave1", "EntidadeChave2"],
  "summary": "Resumo em 2-3 frases",
  "content": "Conteúdo completo em markdown",
  "links": ["[[wiki/pagina-existente]]"]
}`,
    },
    { role: 'user', content: `Fonte: ${sourcePath}\n\n${sourceContent}` },
  ],

  query: (question: string, context: string): Message[] => [
    {
      role: 'system',
      content: `Responda baseado APENAS no contexto abaixo. Cite as fontes com [[wiki/pagina]].
Se não houver informação suficiente, diga claramente.`,
    },
    { role: 'user', content: `Contexto:\n${context}\n\nPergunta: ${question}` },
  ],

  lint: (indexContent: string, wikiPages: string): Message[] => [
    {
      role: 'system',
      content: `Audite a wiki. Verifique:
- Páginas listadas no index que não existem
- Páginas que existem mas não estão no index
- Frontmatter faltando campos obrigatórios
- Links quebrados
- Contradições entre páginas
Retorne JSON: { "issues": [{ "severity": "error|warning", "page": "...", "description": "..." }] }`,
    },
    { role: 'user', content: `Index:\n${indexContent}\n\nPáginas:\n${wikiPages}` },
  ],

  crossIngest: (content: string, sourceVault: string): Message[] => [
    {
      role: 'system',
      content: `Analise se este conteúdo do vault "${sourceVault}" deve ser promovido ao knowledge vault.
Retorne JSON: { "shouldCrossIngest": true|false, "reason": "...", "suggestedTitle": "..." }`,
    },
    { role: 'user', content },
  ],
}
