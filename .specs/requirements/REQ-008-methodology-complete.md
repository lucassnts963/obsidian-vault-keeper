# Requirements: Complete Methodology + JSON Fix

| Field | Value |
|---|---|
| **ID** | REQ-008 |
| **Author** | Lucas Santos |

## Fix
| ID | Description |
|---|---|
| FX-01 | chat-view extrai JSON de qualquer posição do texto, não só início |

## Fase 1
| ID | Description |
|---|---|
| F1-01 | Ribbon submenu agrupando push/pull/sync e actions |
| F1-02 | Chat tools: approve_file, reject_file, ingest_file, run_lint, git_push, git_pull |

## Fase 2
| ID | Description |
|---|---|
| F2-01 | Comando write-page: modal para criar página wiki direto |
| F2-02 | Chat tool write_page(title, content, tags) |
| F2-03 | Comando cross-ingest: promover de outro vault via GitHub API |
| F2-04 | Chat tool cross_ingest(source, targetRepo) |

## Fase 3
| ID | Description |
|---|---|
| F3-01 | AGENTS.md documenta todas as tools disponíveis para o agente |
