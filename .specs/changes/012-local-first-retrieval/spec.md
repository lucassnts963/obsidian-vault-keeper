# Spec: Local-First Retrieval (BM25)

| Field | Value |
|---|---|
| **ID** | CHG-012 |
| **Status** | approved |
| **Author** | Lucas Santos |
| **Created** | 2026-06-09 |
| **Requirements** | REQ-012 |

## Context

Primeira fatia concreta da metodologia Karpathy ("compile locally, send only the relevant
slice"). Hoje `WikiOps.gatherContext()` seleciona páginas para a API por substring
`includes()` sem ranking nem ordem por relevância — manda ruído caro e pode descartar o que
importa. Esta mudança introduz um **motor BM25 puro em TypeScript** e religa a seleção de
páginas-semente do `gatherContext` para usá-lo. Sem deps novas, sem API extra, mobile-safe.

## Scope

- Novo módulo `src/search/bm25.ts` — índice BM25 puro (tokenize, index, score, search top-K).
- Novo módulo `src/search/index-builder.ts` — parseia páginas wiki (frontmatter + corpo),
  monta texto de busca ponderado (título/tags > corpo), e expõe `WikiSearchIndex`.
- Modifica `WikiOps.gatherContext()` para escolher as sementes via ranking BM25, preservando
  index-prepend, traversal de links (1 nível) e truncamento por página.

### Out of Scope

- Embeddings / busca semântica; persistência do índice em disco; chunking sub-página;
  ingest rico (summary/key_entities); tool `bm25_search`; `_slots/`/`_rules/`.

## Requirements

### Functional

- [x] REQ-01: Índice BM25 indexa `{id,text}[]` e retorna top-K por score desc.
- [x] REQ-02: Fórmula BM25 com `k1=1.5`, `b=0.75`, IDF probabilístico.
- [x] REQ-03: Tokenização normaliza caixa + acento (NFD), descarta tokens `length ≤ 2`.
- [x] REQ-04: Score 0 excluído do resultado.
- [x] REQ-05: Parser de wiki (frontmatter→title/tags/summary; corpo) + texto de busca ponderado.
- [x] REQ-06: `gatherContext()` usa BM25 para as sementes, comportamento legado preservado.
- [x] REQ-07: `src/search/` não importa `obsidian` nem faz I/O.

### Non-Functional

- [x] NFR-01: 0 chamadas de rede no caminho de busca.
- [x] NFR-02: Sem novas deps; pure JS (String/Map/Math).
- [x] NFR-03: Cobertura `src/search/` ≥ 90% (medido: 94.6% stmts / 90.9% branch).
- [x] NFR-04: Suíte atual (111 testes) sem regressão (129 verde).

### Technical

| Layer | File / Component | Change Description |
|---|---|---|
| Search core | `src/search/bm25.ts` | **New.** `tokenize()`, `BM25Index` (index/score/search). |
| Search adapter | `src/search/index-builder.ts` | **New.** `parseFrontmatter()`, `parseWikiDoc()`, `buildSearchText()`, `WikiSearchIndex`. |
| Wiki ops | `src/wiki/ops.ts` | Religa seleção de sementes em `gatherContext()` para BM25. |

## Design

### Módulo `bm25.ts`

```ts
export interface BM25Doc { id: string; text: string }
export interface BM25Result { id: string; score: number }

export function tokenize(text: string): string[]   // lowercase + NFD strip + len>2

export class BM25Index {
  constructor(opts?: { k1?: number; b?: number })  // defaults 1.5 / 0.75
  index(docs: BM25Doc[]): void                      // computa tf, df, avgdl
  score(query: string, docIndex: number): number    // BM25 por doc
  search(query: string, topK?: number): BM25Result[] // filtra score>0, ordena desc, corta topK
  get size(): number
}
```

Fórmula por termo `t` da query no doc `d`:
`idf(t) * (f * (k1+1)) / (f + k1*(1 - b + b*|d|/avgdl))`,
com `idf(t) = ln(1 + (N - df + 0.5)/(df + 0.5))` (sempre ≥ 0).

### Módulo `index-builder.ts`

```ts
export interface WikiDoc { path: string; title: string; summary: string; tags: string[]; body: string }
export function parseFrontmatter(content: string): { data: Record<string,string|string[]>; body: string }
export function parseWikiDoc(path: string, content: string): WikiDoc
export function buildSearchText(doc: WikiDoc): string  // título (x3) + tags (x2) + summary + body

export class WikiSearchIndex {
  setDocs(docs: WikiDoc[]): void
  query(question: string, topK?: number): Array<{ path: string; score: number; doc: WikiDoc }>
  get size(): number
}
```

Ponderação por repetição (sem alterar BM25): título repetido 3x, tags 2x no texto indexado —
assim um match no título contribui mais que no corpo.

### `gatherContext()` (modificação cirúrgica)

Substituir **somente** o bloco que monta `seedPaths` (o loop `keywords.some(... includes ...)`)
por: ler as páginas, montar `WikiSearchIndex`, `query(question, maxPages)` → `seedPaths` na
ordem do score. Mantidos: prepend do `## Index`, traversal de links 1 nível, slice(0,2000),
join com separador.

### Edge Cases

- Vault vazio / sem páginas → BM25 sem docs → `search` retorna `[]` → contexto = só index (ou vazio). 
- Query sem termos úteis (tudo `len ≤ 2`) → nenhum termo → todos score 0 → `[]`.
- Frontmatter ausente/malformado → `parseFrontmatter` retorna `{data:{}, body: content}`; `parseWikiDoc` usa defaults (title derivado do path, tags `[]`).
- Página sem nenhum termo da query → score 0 → excluída.

## Risks

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Mudança em gatherContext quebra testes | Med | Med | Preservar assinatura/efeitos; rodar suíte completa |
| BM25 mal calibrado | Low | Med | Defaults canônicos + cenários BDD |
| Frontmatter fora do padrão | Low | Low | Parser tolerante com defaults |

## Dependencies

- Nenhuma externa. Integra com `wiki/ops.ts`.

## Requirements Traceability

| REQ ID | Source | Summary | Priority | Acceptance |
|---|---|---|---|---|
| REQ-01 | REQ-012/US-01 | BM25 top-K | Must | TEST-01,02 |
| REQ-02 | REQ-012/US-01 | Fórmula k1/b/IDF | Must | TEST-03,06 |
| REQ-03 | REQ-012 BDD | Tokenização normaliza | Must | TEST-04 |
| REQ-04 | REQ-012/US-02 | Score 0 excluído | Must | TEST-05 |
| REQ-05 | REQ-012/US-03 | Parser + texto ponderado | Must | TEST-07,08,09 |
| REQ-06 | REQ-012/US-01,02 | gatherContext BM25 | Must | TEST-10,11 |
| REQ-07 | REQ-012/US-04 | Módulo puro | Must | TEST-12 |

## Tests

> **TDD:** escrever ANTES da implementação. Devem falhar (Red) antes do código existir.

### Test Cases

| ID | Test | Type | Description |
|---|---|---|---|
| TEST-01 | indexa docs e retorna resultados | unit | `BM25Index.index()` + `search()` retorna ids conhecidos |
| TEST-02 | respeita topK | unit | `search(q, 2)` retorna no máximo 2 |
| TEST-03 | doc denso supera menção de passagem | unit | A (denso) antes de B (1 menção) |
| TEST-04 | tokenize normaliza caixa/acento e corta len≤2 | unit | "Memória" ~ "memoria"; "de" descartado |
| TEST-05 | score 0 é excluído | unit | doc sem termo da query não aparece |
| TEST-06 | normalização por tamanho (b) não pune doc curto focado | unit | doc curto-focado ranqueia competitivo vs longo difuso |
| TEST-07 | parseFrontmatter separa data e body | unit | extrai title/tags; body sem frontmatter |
| TEST-08 | parseWikiDoc usa defaults sem frontmatter | unit | title derivado do path, tags=[] |
| TEST-09 | título/tags pesam mais que corpo | unit | termo no título ranqueia acima de termo só no corpo |
| TEST-10 | gatherContext seleciona as relevantes via BM25 | integration | top-K = páginas relevantes; ruído fora |
| TEST-11 | gatherContext preserva index prepend e traversal | integration | `## Index` presente; link seguido 1 nível |
| TEST-12 | módulo search não importa obsidian | unit | source de `src/search/*` não referencia `'obsidian'` |

### Test Files

| File | What It Covers |
|---|---|
| `src/__tests__/bm25.test.ts` | TEST-01..06, TEST-12 |
| `src/__tests__/search-index.test.ts` | TEST-07,08,09 |
| `src/__tests__/wiki-ops-context.test.ts` | TEST-10,11 |

---

## Validation Checklist

- [x] Tests written BEFORE implementation (Red phase) — 1 falha discriminante + módulos ausentes
- [x] All tests passing (Green phase) — 129/129
- [x] Code refactored without breaking tests (Refactor phase)
- [x] Coverage meets threshold (≥90% em src/search/ — 94.6%)
- [x] Requirements met (REQ-01..07)
- [x] Edge cases tested (vault vazio, query vazia, frontmatter ausente, score 0)
- [x] No regression (suíte 111 → 129 verde)
- [x] Code follows conventions (pure-TS, kebab files, camelCase)

## Notes

- Slice 1 de 3 da metodologia. Próximas: (2) ingest rico + summaries cache + persistência;
  (3) AGENTS.md no vault + `_slots/`/`_rules/` + tool `bm25_search`.
- Ponderação título/tags via repetição no texto indexado mantém o BM25 canônico intacto.
