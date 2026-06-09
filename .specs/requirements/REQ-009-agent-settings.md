# Requirements: Agent Settings + Reset Context

| Field | Value |
|---|---|
| **ID** | REQ-009 |

| ID | Description |
|---|---|
| ST-01 | Schema: agent.maxIterations (1-15, default 5) |
| ST-02 | Schema: agent.maxFileChars (500-10000, default 3000) |
| ST-03 | Schema: agent.resetContext (boolean, default true) |
| ST-04 | Settings UI: 3 inputs visíveis |
| ST-05 | executeTool repassa maxFileChars para readFile/readIndex |
| ST-06 | ChatView: agent.run(q, []) — reset a cada pergunta |
| ST-07 | main.ts: passa settings.agent.* ao VaultAgent |
