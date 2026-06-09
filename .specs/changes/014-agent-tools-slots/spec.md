# Spec: Agent Tools Upgrade + _slots/ State

| Field | Value |
|---|---|
| **ID** | CHG-014 |
| **Status** | approved |
| **Author** | Lucas Santos |
| **Created** | 2026-06-09 |
| **Requirements** | REQ-014 |

## Context

Terceira e última fatia da metodologia Karpathy local-first. As fatias anteriores tornaram
a recuperação de contexto local e eficiente (BM25 + índice persistido). Esta fatia fecha o
loop do agente: o agente agora usa o índice para navegar (não explorar), sabe o que o curador
está fazendo (`_slots/focus.md`) e suas respostas têm FAITHFULNESS enforced.

## Scope

- **New** `src/slots/manager.ts` — `SlotsManager`: read/write `_slots/` files (pure-TS).
- **Modified** `src/chat/tools.ts` — função `bm25Search()` + case `bm25_search` no `executeTool`.
- **Modified** `src/chat/prompts.ts` — FAITHFULNESS como regra #1; tabela de roteamento; `bm25_search` no catálogo de tools.
- **Modified** `src/wiki/ops.ts` — `gatherContext()` prepend `_slots/focus.md` quando existe.

### Out of Scope

Cross-link injection, `_rules/`, `write_slot` tool, reindexação por mtime.

## Requirements

### Functional

- [x] REQ-01: `SlotsManager.readSlot(name)` retorna string ou null se ausente.
- [x] REQ-02: `SlotsManager.writeSlot(name, content)` cria `_slots/` se necessário.
- [x] REQ-03: `gatherContext()` prepend `_slots/focus.md` quando existe.
- [x] REQ-04: `bm25Search(vault, args)` retorna lista ranqueada com path/título/summary.
- [x] REQ-05: `bm25Search` retorna mensagem "índice vazio" quando sem entradas.
- [x] REQ-06: `bm25Search` retorna "sem resultados" quando query sem match.
- [x] REQ-07: `executeTool` despacha `bm25_search`.
- [x] REQ-08: DEFAULT_AGENT_PROMPT contém FAITHFULNESS explícita.
- [x] REQ-09: DEFAULT_AGENT_PROMPT contém tabela de roteamento.
- [x] REQ-10: DEFAULT_AGENT_PROMPT inclui `bm25_search` no catálogo.
- [x] REQ-11: `SlotsManager` não importa `obsidian`.

### Non-Functional

- [x] NFR-01: `bm25_search` zero chamadas de rede.
- [x] NFR-02: Zero deps novas.
- [x] NFR-03: `src/slots/manager.ts` cobertura 100% stmts+branch.
- [x] NFR-04: Suíte 148 → 166 verde; 'knowledge vault' preservado.

### Technical

| Layer | File | Change |
|---|---|---|
| Slots | `src/slots/manager.ts` | **New.** `SlotsManager`. |
| Tools | `src/chat/tools.ts` | `bm25Search()` + `executeTool` case. |
| Prompts | `src/chat/prompts.ts` | FAITHFULNESS + routing + `bm25_search`. |
| Wiki ops | `src/wiki/ops.ts` | `gatherContext()` prepend focus slot. |

## Design

### `slots/manager.ts`

```ts
export class SlotsManager {
  static readonly slotsDir = '_slots'

  constructor(private readonly adapter: VaultAdapter) {}

  readSlot(name: string): Promise<string | null>   // null on ENOENT
  writeSlot(name: string, content: string): Promise<void>  // mkdir if needed
}
```

Files live at `_slots/<name>.md`. Adapter injected; no obsidian import.

### `bm25Search` tool

```ts
export async function bm25Search(
  vault: any,
  args: { query: string; topK?: number },
): Promise<string>
```

Control flow:
1. Load `IndexPersistence` entries from vault adapter.
2. If empty → return "Index is empty" message.
3. Build `WikiSearchIndex` from entries (summary+title+tags+key_entities).
4. `search.query(args.query, args.topK ?? 5)`.
5. If no results → return "No results found for…" message.
6. Format: numbered list with `[[path]]`, title, summary excerpt.

### `gatherContext()` addition (after index prepend)

```
try {
  SlotsManager.readSlot('focus') → if not null → parts.push(`## Foco Atual\n${focus}`)
} catch {}
```

### Prompt structure

```
DEFAULT_AGENT_PROMPT =
  "You are a knowledge vault assistant…"          ← keeps 'knowledge vault'
  FAITHFULNESS (rule #1, prominent)
  ROUTING TABLE
  TOOL_FORMAT (bm25_search added at top)
```

FAITHFULNESS block:
```
## FAITHFULNESS — Rule #1
Every factual claim MUST cite its wiki source: [[wiki/page-name]].
Never invent facts not present in the wiki.
If the answer is not in the wiki, say so explicitly.
```

Routing table:
```
| Detected intent        | First tool              | Next                     |
|------------------------|-------------------------|--------------------------|
| Question about topic   | bm25_search(topic)      | read_file top results    |
| Ingest a source        | read_file(raw/X.md)     | ingest_file              |
| Review inbox           | list_dir(inbox/)        | approve/reject           |
| Find issues            | run_lint({})            | report                   |
| Session focus          | read_file(_slots/focus) | use as context           |
| Create wiki page       | write_page(...)         | done                     |
```

`bm25_search` in tool catalogue:
```
{"type":"tool","tool":"bm25_search","args":{"query":"search terms","topK":5}}
```

### Edge Cases

- `_slots/focus.md` absent → `gatherContext` silent, no error.
- Index empty → `bm25_search` returns informative message (not error).
- Query tokens all `len ≤ 2` → BM25 returns `[]` → "No results" message.
- `_slots/` dir absent → `writeSlot` calls `mkdir` before `write`.

## Risks

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| `'knowledge vault'` removed from prompt | Low | Low | Preserved in new DEFAULT_AGENT_PROMPT |
| Existing chat-agent tests break on prompt change | Low | Low | Only `toContain` checks — additive changes |

## Tests

> **TDD:** escrever ANTES da implementação.

### Test Cases

| ID | Test | Type | Description |
|---|---|---|---|
| TEST-01 | `readSlot` returns null when absent | unit | ENOENT → null |
| TEST-02 | `readSlot` returns content when exists | unit | content read correctly |
| TEST-03 | `writeSlot` creates file + dir | unit | `_slots/focus.md` created |
| TEST-04 | `writeSlot` skips mkdir when dir exists | unit | no duplicate mkdir |
| TEST-05 | SlotsManager does not import obsidian | unit | source check |
| TEST-06 | `gatherContext` prepends focus slot | integration | `_slots/focus.md` content in ctx |
| TEST-07 | `gatherContext` works without focus slot | integration | no error, ctx returned normally |
| TEST-08 | `bm25_search` returns ranked results | unit | relevant entry in result string |
| TEST-09 | `bm25_search` returns empty-index message | unit | no index JSON → message |
| TEST-10 | `bm25_search` returns no-results message | unit | no match → message |
| TEST-11 | `executeTool` dispatches `bm25_search` | unit | returns string result |
| TEST-12 | DEFAULT_AGENT_PROMPT has FAITHFULNESS | unit | prompt contains 'FAITHFULNESS' |
| TEST-13 | DEFAULT_AGENT_PROMPT has `bm25_search` | unit | prompt contains 'bm25_search' |

### Test Files

| File | Tests |
|---|---|
| `src/__tests__/slots-manager.test.ts` | TEST-01..05 |
| `src/__tests__/gather-context-slots.test.ts` | TEST-06,07 |
| `src/__tests__/bm25-search-tool.test.ts` | TEST-08..11 |
| `src/__tests__/prompts-updated.test.ts` | TEST-12,13 |

---

## Validation Checklist

- [x] Tests written BEFORE implementation (Red phase) — 10 falhas discriminantes
- [x] All tests passing (Green phase) — 166/166
- [x] Code refactored without breaking tests (Refactor phase)
- [x] Coverage ≥ 90% em `src/slots/manager.ts` (100% stmts+branch)
- [x] Requirements met (REQ-01..11)
- [x] Edge cases tested (ENOENT, empty index, no match, mkdir skip)
- [x] No regression (148 → 166 verde; 'knowledge vault' preservado)
- [x] Code follows conventions

## Notes

- Fatia 3/3. Com esta fatia a metodologia Karpathy está operacional ponta-a-ponta:
  ingest rico → índice persistido → retrieval BM25 local → agente orientado (bm25_search)
  → estado de sessão (_slots/) → respostas fiéis (FAITHFULNESS).
- Cross-link injection e `_rules/` são incrementais e podem ser adicionados sem urgência.
