# Spec: ChatView — LLM Chat com Contexto do Vault

| Field | Value |
|---|---|
| **ID** | CHG-005 |
| **Status** | draft |
| **Author** | Lucas Santos |
| **Created** | 2026-06-07 |

## Scope

- Input de texto + área de mensagens scrollável
- `WikiOps.gatherContext()` → `LLMProvider.chat()`
- Histórico de conversa
- Citações `[[wikilinks]]` clicáveis

## Tests

| ID | Test |
|---|---|
| T-01 | Renders input and send button |
| T-02 | Sends message to LLM and shows response |
| T-03 | Renders [[wikilinks]] as clickable |
| T-04 | Shows loading indicator while LLM responds |
| T-05 | Shows "LLM not configured" when not available |
