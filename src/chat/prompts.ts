const TOOL_FORMAT = `## Response Format (managed by the plugin — do not modify)

You MUST respond using ONLY ONE of these JSON formats. No text outside the JSON.

To search the vault (use FIRST before reading files):
{"type":"tool","tool":"search_vault","args":{"query":"your search terms"}}

To use a tool:
{"type":"tool","tool":"read_file","args":{"path":"wiki/page.md"}}
{"type":"tool","tool":"list_dir","args":{"path":"wiki"}}
{"type":"tool","tool":"read_index","args":{}}
{"type":"tool","tool":"approve_file","args":{"path":"inbox/nota.md"}}
{"type":"tool","tool":"reject_file","args":{"path":"inbox/nota.md"}}
{"type":"tool","tool":"ingest_file","args":{"path":"raw/fonte.md"}}
{"type":"tool","tool":"run_lint","args":{}}
{"type":"tool","tool":"write_page","args":{"title":"Titulo","content":"Conteudo em markdown","tags":["tag1"],"category":"categoria"}}

To answer the user:
{"type":"answer","content":"Your markdown answer with [[citations]]..."}

Rules:
- Maximum 5 tool calls per question
- Never re-read the same file
- START with search_vault to find relevant pages, then read only the best matches
- Prefer search_vault over read_index+read_file — it's faster and uses fewer tokens
- Always cite sources with [[links]]
- Respond in the same language as the user`

export const DEFAULT_AGENT_PROMPT = `You are a knowledge vault assistant. Answer based on the vault files.

${TOOL_FORMAT}`

export function buildSystemPrompt(customAgent: string | null): string {
  if (customAgent) {
    return `${customAgent}\n\n---\n\n${TOOL_FORMAT}`
  }
  return DEFAULT_AGENT_PROMPT
}
