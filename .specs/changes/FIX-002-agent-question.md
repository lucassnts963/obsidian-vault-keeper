# Fix: Agent must include question in messages

| Field | Value |
|---|---|
| **ID** | FIX-002 |

## Root cause
`agent.run()` envia `history.slice(-10)` que é `[]` (vazio). A pergunta nunca é adicionada às mensagens enviadas ao LLM.

## Fix
- agent.ts: sempre adicionar `{ role: 'user', content: question }` no array de messages
- chat-view.ts: se `resetContext=true` envia `[]`, senão envia últimas 6 mensagens
