# Requirements: Chat View Moderno

| Field | Value |
|---|---|
| **ID** | REQ-007 |
| **Author** | Lucas Santos |
| **Created** | 2026-06-11 |

## Requirements

| ID | Description | Priority |
|---|---|---|
| CH-01 | Layout WhatsApp: user direita (accent), agent esquerda (secondary) | Must |
| CH-02 | Labels "Você" e "Agente" com timestamp visível | Must |
| CH-03 | Markdown renderizado nas respostas (headings, bold, italic, code, lists, links) | Must |
| CH-04 | Tool calls visíveis como collapsible inline (expansível) | Must |
| CH-05 | "Agente está pensando..." com loading dots enquanto espera | Must |
| CH-06 | `agent.run()` retorna `{ steps: AgentStep[], answer: string }` | Must |
| CH-07 | Scroll automático para última mensagem | Should |
