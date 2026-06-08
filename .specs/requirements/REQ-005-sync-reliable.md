# Requirements: Sync Confiável + Conflitos

| Field | Value |
|---|---|
| **ID** | REQ-005 |
| **Author** | Lucas Santos |
| **Created** | 2026-06-08 |

## Requirements

| ID | Description | Priority |
|---|---|---|
| SY-01 | `detectConflicts()` — antes do push, detecta arquivos que mudaram local E remotamente | Must |
| SY-02 | Push: arquivos com conflito são pulados + backup salvo (`path.conflict.md`) + notice | Must |
| SY-03 | Push: arquivos sem conflito são enviados normalmente | Must |
| SY-04 | Pull: backup automático se arquivo local foi modificado desde último sync | Must |
| SY-05 | Resumo pós-sync: "X enviados, Y conflitos, Z baixados, W backups" | Must |
| SY-06 | Sync completa mesmo com erros parciais (não trava no primeiro erro) | Must |
