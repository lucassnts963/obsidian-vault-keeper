# Spec: WikiOps — approve, reject, gatherContext, validation

| Field | Value |
|---|---|
| **ID** | CHG-003 |
| **Status** | draft |
| **Author** | Lucas Santos |
| **Created** | 2026-06-07 |

## Context

O `WikiOps` tem `ingestFile()` funcional mas sem `approve()`/`reject()` para o fluxo inbox→raw, sem `gatherContext()` para o ChatView, e sem validação de resposta do LLM (crasha com JSON inválido).

## Scope

### Included
- `approve(file)` — move de `inboxPath/` → `rawPath/`, seta status: approved no frontmatter
- `reject(file)` — seta status: rejected no frontmatter (sem mover)
- `gatherContext(question)` — lê index.md + varre wikiPath/ por páginas com conteúdo similar
- `ingestFile()` — try/catch no JSON.parse, validação de campos obrigatórios
- Detecção de página duplicada antes de criar

### Out of Scope
- Drag & drop na UI
- Suporte a `crossIngest()`

## Requirements

- [ ] FW-05: approve(file) move inbox→raw, atualiza status frontmatter
- [ ] FW-06: reject(file) seta status: rejected no frontmatter
- [ ] FW-07: gatherContext(question) retorna index + páginas relevantes como string
- [ ] FW-08: ingestFile() não crasha com JSON inválido do LLM
- [ ] FW-09: ingestFile() detecta página duplicada antes de criar

## Design

### approve(file)
1. Lê conteúdo do arquivo
2. Adiciona/atualiza `status: approved` no frontmatter YAML
3. Move de `inboxPath/filename` → `rawPath/filename`
4. Se rawPath não existe, cria

### reject(file)
1. Lê conteúdo
2. Adiciona/atualiza `status: rejected` no frontmatter
3. Mantém arquivo no inboxPath

### gatherContext(question)
1. Lê `indexPath` (index.md)
2. Lista todos `.md` em `wikiPath/`
3. Filtra até 5 páginas mais relevantes (contém palavras da question)
4. Retorna string formatada: index + conteúdo das páginas

## Tests

| ID | Test | Type |
|---|---|---|
| T-01 | approve moves file inbox→raw with status | unit |
| T-02 | reject sets status: rejected without moving | unit |
| T-03 | approve updates existing frontmatter | unit |
| T-04 | reject on file without frontmatter adds it | unit |
| T-05 | gatherContext returns index content | unit |
| T-06 | gatherContext includes matching wiki pages | unit |
| T-07 | ingestFile handles invalid JSON gracefully | unit |
| T-08 | ingestFile detects duplicate wiki page | unit |

### Test File
`src/__tests__/wiki-ops.test.ts`
