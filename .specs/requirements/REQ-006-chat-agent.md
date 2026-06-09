# Requirements: Chat Agent MVP

| Field | Value |
|---|---|
| **ID** | REQ-006 |
| **Author** | Lucas Santos |
| **Created** | 2026-06-11 |

## Requirements

| ID | Description | Priority |
|---|---|---|
| AG-01 | AGENTS.md lido do root do vault como system prompt | Must |
| AG-02 | Fallback para prompt padrão em inglês se AGENTS.md não existir | Must |
| AG-03 | Agent loop: LLM decide tool ou answer, max 5 iterações | Must |
| AG-04 | Regex parse de tool calls: `{"type":"tool","tool":"...","args":{}}` | Must |
| AG-05 | Fallback para answer mode se JSON malformado | Must |
| AG-06 | Tools: `read_file(path)`, `list_dir(path)`, `read_index()` | Must |
| AG-07 | Cache de arquivos lidos por sessão (Map + Set) | Must |
| AG-08 | `read_file` limitado a 3000 chars | Must |
| AG-09 | ChatView usa `agent.run()` em vez de `gatherContext()` | Must |
| AG-10 | `main.ts` instancia `VaultAgent` e expõe como `this.agent` | Must |
