# Spec: Chat Agent MVP

| Field | Value |
|---|---|
| **ID** | CHG-010 |
| **Status** | draft |

## New files

| File | Purpose |
|---|---|
| `src/chat/prompts.ts` | System prompts, AGENTS.md default, tools description |
| `src/chat/tools.ts` | read_file, list_dir, read_index |
| `src/chat/agent.ts` | VaultAgent class — load config, agent loop, parser, cache |

## Modified files

| File | Change |
|---|---|
| `src/views/chat-view.ts` | `send()` → `agent.run(question, history)` |
| `src/main.ts` | `this.agent = new VaultAgent(...)` in onload |

## Tests

| ID | Test |
|---|---|
| T-01 | agent loads AGENTS.md from vault root |
| T-02 | agent defaults when AGENTS.md missing |
| T-03 | parser extracts tool call JSON |
| T-04 | parser falls back to answer on bad JSON |
| T-05 | tools.read_file returns content |
| T-06 | tools.list_dir returns file list |
| T-07 | agent.run loops until answer (mock LLM) |
| T-08 | agent respects max iterations |
