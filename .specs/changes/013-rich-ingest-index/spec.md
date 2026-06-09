# Spec: Rich Ingest + Persistent BM25 Index

| Field | Value |
|---|---|
| **ID** | CHG-013 |
| **Status** | approved |
| **Author** | Lucas Santos |
| **Created** | 2026-06-09 |
| **Requirements** | REQ-013 |

## Context

Segunda fatia da metodologia Karpathy local-first. A fatia anterior (CHG-012) introduziu
ranking BM25, mas `gatherContext()` ainda lê todas as N páginas do vault em cada query para
construir o índice em memória — custo O(N) de I/O. Esta fatia:

1. Faz o ingest "compilar" mais no momento certo: extrai `summary` e `key_entities` e os
   persiste no frontmatter, tornando cada página auto-descritiva sem precisar ler o corpo.
2. Persiste o índice BM25 em `.vault-keeper/bm25-index.json`, mantido vivo por `ingestFile()`
   e `writePage()`.
3. Dá a `gatherContext()` um fast path: carrega 1 JSON → BM25 sobre entradas leves (summary
   + title + tags + key_entities) → lê apenas os top-K pages completos. O(1 + K) em vez de O(N).

## Scope

- **New** `src/search/index-persistence.ts` — `IndexEntry`, `IndexPersistence` (load/save/upsert/remove).
- **Modified** `src/llm/provider.ts` — adiciona `key_entities` ao JSON schema de `PROMPTS.ingest`.
- **Modified** `src/wiki/ops.ts` `ingestFile()` — salva `summary`/`key_entities` no frontmatter; chama `IndexPersistence.upsert()`.
- **Modified** `src/wiki/ops.ts` `writePage()` — chama `IndexPersistence.upsert()` (sem summary/key_entities, só title/tags).
- **Modified** `src/wiki/ops.ts` `gatherContext()` — tenta fast path via índice JSON; fallback para scan de arquivos.

### Out of Scope

Cross-link injection, freshness check por mtime, `_slots/`/`_rules/`, tool `bm25_search`,
AGENTS.md no vault — fatias posteriores.

## Requirements

### Functional

- [x] REQ-01: `IndexPersistence.load()` retorna `[]` quando `.vault-keeper/bm25-index.json` não existe.
- [x] REQ-02: `IndexPersistence.upsert()` adiciona nova entrada ou substitui a de mesmo path.
- [x] REQ-03: `IndexPersistence.remove()` filtra a entrada pelo path.
- [x] REQ-04: `IndexPersistence.save()` cria `.vault-keeper/` se não existir.
- [x] REQ-05: `ingestFile()` grava `summary` e `key_entities` no frontmatter YAML da página wiki.
- [x] REQ-06: `PROMPTS.ingest` inclui `key_entities` no JSON schema solicitado à LLM.
- [x] REQ-07: `ingestFile()` chama `IndexPersistence.upsert()` após criar a página.
- [x] REQ-08: `writePage()` chama `IndexPersistence.upsert()` após criar a página.
- [x] REQ-09: `gatherContext()` fast path: com índice JSON → lê só top-K; páginas fora do top-K não são lidas.
- [x] REQ-10: `gatherContext()` fallback: sem índice JSON → scan completo de arquivos.

### Non-Functional

- [x] NFR-01: O(1 + K) reads quando índice presente (provado por mock read call tracking).
- [x] NFR-02: Zero deps novas.
- [x] NFR-03: `src/search/index-persistence.ts` cobertura 100% stmts / 100% branch.
- [x] NFR-04: Suíte 129 → 148 verde, zero regressão.

### Technical

| Layer | File | Change |
|---|---|---|
| Search | `src/search/index-persistence.ts` | **New.** `IndexEntry`, `IndexPersistence`. |
| LLM prompts | `src/llm/provider.ts` | Adiciona `key_entities` ao JSON schema de `PROMPTS.ingest`. |
| Wiki ops | `src/wiki/ops.ts` | `ingestFile`: frontmatter rico + upsert. `writePage`: upsert. `gatherContext`: fast path + fallback. |

## Design

### `index-persistence.ts`

```ts
export interface IndexEntry {
  path: string
  title: string
  summary: string
  tags: string[]
  key_entities: string[]
}

export class IndexPersistence {
  static readonly indexPath = '.vault-keeper/bm25-index.json'
  static readonly dataDir  = '.vault-keeper'

  constructor(private adapter: VaultAdapter) {}

  load(): Promise<IndexEntry[]>            // returns [] on any error
  save(entries: IndexEntry[]): Promise<void>  // mkdir if needed, then write
  upsert(entry: IndexEntry): Promise<void>
  remove(path: string): Promise<void>
}

interface VaultAdapter { read: fn; write: fn; exists: fn; mkdir: fn }
```

JSON on disk: `{ "version": 1, "entries": IndexEntry[] }`

### `gatherContext()` control flow

```
gatherContext(question, maxPages, linkDepth)
  │
  ├─ adapter.read(indexPath)   ← always prepend index.md
  │
  ├─ [fast path] IndexPersistence.load()
  │     → if entries.length > 0
  │         → WikiSearchIndex over lightweight entries (summary+title+tags+key_entities as body)
  │         → search(question, maxPages) → seedPaths
  │         → usedFastPath = true
  │
  ├─ [fallback] if !usedFastPath
  │     → adapter.list(wikiPath)
  │     → adapter.read each .md file (CHG-012 behavior)
  │     → WikiSearchIndex → seedPaths
  │
  └─ traversal loop (unchanged): load full page content of seeds + follow wikilinks
```

### `ingestFile()` frontmatter change

Before:
```yaml
title, category, tags, date, source
```

After (with safe defaults if LLM omits fields):
```yaml
title, category, tags, summary, key_entities, date, source
```

`summary` omitted if empty string; `key_entities` omitted if empty array — keeps frontmatter clean.

### Edge Cases

- LLM omits `summary` or `key_entities` → defaults `''` / `[]`; fields omitted from frontmatter if empty.
- `.vault-keeper/` absent → `save()` calls `adapter.mkdir()` before `write()`.
- Index JSON corrupted → `load()` returns `[]`; `gatherContext` falls back to scan.
- `writePage()` has no summary/key_entities (human-authored) → upserts entry with `summary:'', key_entities:[]`.

## Risks

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Mock vault sem `mkdir` nos novos testes | Low | Low | Usar mock completo de wiki-ops.test.ts |
| Índice desatualizado no vault de desenvolvimento | Low | Low | Fallback sempre presente |

## Dependencies

- CHG-012: `src/search/bm25.ts` e `index-builder.ts`

## Requirements Traceability

| REQ ID | Source | Summary | Priority | Acceptance |
|---|---|---|---|---|
| REQ-01..04 | REQ-013/US-03 | IndexPersistence | Must | TEST-01..05 |
| REQ-05,06 | REQ-013/US-02 | frontmatter rico + prompt | Must | TEST-06,07 |
| REQ-07,08 | REQ-013/US-03 | ingest/write chamam upsert | Must | TEST-08,09 |
| REQ-09 | REQ-013/US-01 | fast path | Must | TEST-10 |
| REQ-10 | REQ-013/US-04 | fallback | Must | TEST-11 |
| NFR | — | purity check | Must | TEST-12 |

## Tests

> **TDD:** escrever ANTES da implementação.

### Test Cases

| ID | Test | Type | Description |
|---|---|---|---|
| TEST-01 | `load()` returns `[]` when file absent | unit | arquivo ausente → array vazio |
| TEST-02 | `save()` + `load()` round-trip | unit | grava e relê, dados inalterados |
| TEST-03 | `upsert()` adds new entry | unit | path novo → array cresce |
| TEST-04 | `upsert()` updates existing entry | unit | mesmo path → substitui, não duplica |
| TEST-05 | `remove()` deletes by path | unit | remove a entrada correta |
| TEST-06 | `ingestFile()` frontmatter has `summary` | integration | campo `summary:` no arquivo criado |
| TEST-07 | `ingestFile()` frontmatter has `key_entities` | integration | campo `key_entities:` no arquivo criado |
| TEST-08 | `ingestFile()` upserts index JSON | integration | `.vault-keeper/bm25-index.json` contém a nova página |
| TEST-09 | `writePage()` upserts index JSON | integration | idem para writePage |
| TEST-10 | `gatherContext()` fast path: non-top-K pages not read | integration | read() não chamado para páginas fora do top-K |
| TEST-11 | `gatherContext()` fallback when no index | integration | sem JSON → scan de arquivos, resultado correto |
| TEST-12 | `index-persistence.ts` does not import `obsidian` | unit | source sem `'obsidian'` |

### Test Files

| File | Tests |
|---|---|
| `src/__tests__/index-persistence.test.ts` | TEST-01..05, TEST-12 |
| `src/__tests__/ingest-rich.test.ts` | TEST-06,07,08,09 |
| `src/__tests__/gather-context-fast.test.ts` | TEST-10,11 |

---

## Validation Checklist

- [x] Tests written BEFORE implementation (Red phase) — 6 falhas discriminantes
- [x] All tests passing (Green phase) — 148/148
- [x] Code refactored without breaking tests (Refactor phase)
- [x] Coverage ≥ 90% em `src/search/index-persistence.ts` (100% stmts+branch)
- [x] Requirements met (REQ-01..10)
- [x] Edge cases tested (JSON corrompido, entries não-array, mkdir, omissão de campos vazios)
- [x] No regression (129 → 148 verde)
- [x] Code follows conventions

## Notes

- Slice 2/3 da metodologia. Próxima fatia: AGENTS.md no vault + `_slots/`/`_rules/` + cross-link
  injection + tool `bm25_search`.
- Campos omitidos do frontmatter quando vazios mantém páginas limpas (compatível com parser existente).
