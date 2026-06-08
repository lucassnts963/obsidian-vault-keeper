# Spec: InboxView — List, Filter, Approve/Reject/Ingest

| Field | Value |
|---|---|
| **ID** | CHG-004 |
| **Status** | draft |
| **Author** | Lucas Santos |
| **Created** | 2026-06-07 |

## Context

A InboxView é um stub. Precisa listar arquivos do inbox com filtros e ações.

## Scope

- Listar arquivos de `inboxPath/` com status do frontmatter
- Filtros: Todos / Pendentes (inbox) / Aprovados / Rejeitados
- Botão Approve → `WikiOps.approve()`
- Botão Reject → `WikiOps.reject()`
- Botão Ingest → `WikiOps.ingestFile()`

## Design

### States

| State | Behavior |
|---|---|
| Empty | "Nenhuma nota no inbox" |
| Normal | Lista com status badges e botões |
| Loading | "Carregando..." |

## Tests

| ID | Test |
|---|---|
| T-01 | Renders file list from inbox |
| T-02 | Shows status from frontmatter |
| T-03 | Filter buttons filter by status |
| T-04 | Approve button calls WikiOps.approve |
| T-05 | Reject button calls WikiOps.reject |
| T-06 | Shows empty state when no files |

### Test File
`src/__tests__/inbox-view.test.ts`
