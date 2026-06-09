# Spec: Chat UI Moderno

| Field | Value |
|---|---|
| **ID** | CHG-011 |
| **Status** | draft |

## New files

| File | Purpose |
|---|---|
| `src/views/markdown.ts` | Markdown → HTML (headings, bold, italic, code, lists, links, hr) |

## Modified files

| File | Change |
|---|---|
| `src/views/ui.ts` | +`bubble()`, +`collapsible()` helpers |
| `src/views/chat-view.ts` | Rewrite renderMessage, WhatsApp layout, markdown, tool calls |
| `src/chat/agent.ts` | `run()` → `AgentResponse` with steps |

## Tests

| ID | Test |
|---|---|
| T-01 | renderMarkdown bold/italic |
| T-02 | renderMarkdown headings |
| T-03 | renderMarkdown code blocks |
| T-04 | renderMarkdown wikilinks |
| T-05 | bubble creates user layout |
| T-06 | bubble creates agent layout |
| T-07 | AgentResponse contains steps |
