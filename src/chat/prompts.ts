const TOOL_FORMAT = `## Response Format (managed by the plugin — do not modify)

You MUST respond using ONLY ONE of these JSON formats. No text outside the JSON.

To use a tool:
{"type":"tool","tool":"read_file","args":{"path":"wiki/page.md"}}
{"type":"tool","tool":"list_dir","args":{"path":"wiki"}}
{"type":"tool","tool":"read_index","args":{}}

To answer the user:
{"type":"answer","content":"Your markdown answer with [[citations]]..."}

Rules:
- Maximum 5 tool calls per question
- Never re-read the same file
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
