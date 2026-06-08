# Requirements: Views Fix + UI Modernization

| Field | Value |
|---|---|
| **ID** | REQ-003 |
| **Status** | draft |
| **Author** | Lucas Santos |
| **Created** | 2026-06-07 |

## 1. Problem Statement

As views (Inbox, Lint, Chat) mostram vazio ou quebram no mobile porque:
- `adapter.list()` retorna array vazio no mobile quando diretório não existe (vs throw no desktop)
- Concatenação de paths não normaliza prefixos (mobile pode retornar `inbox/nota.md` em `list.files`)
- Nenhum error handling nas views — um único `read()` que falha derruba toda a view
- UI básica sem identidade visual

## 2. Requirements

### Functional

| ID | Description | Priority |
|---|---|---|
| VF-01 | Views devem criar diretórios automaticamente se não existirem | Must |
| VF-02 | `list.files` deve normalizar paths (remover prefixo de diretório) | Must |
| VF-03 | Todo `adapter.read()` deve ter try/catch por arquivo | Must |
| VF-04 | LintView: consertar detecção de órfãos (threshold removido) | Must |
| VF-05 | LintView: consertar comparação de index (extrair nome do arquivo) | Must |
| VF-06 | UI: usar Obsidian CSS variables para cores, bordas, sombras | Must |
| VF-07 | UI: cards com badges coloridos por status/severidade | Must |
| VF-08 | UI: estados loading/empty/error visíveis | Must |
| VF-09 | ChatView: scroll automático para última mensagem | Should |
| VF-10 | InboxView: mostrar contagem de itens por filtro | Should |

### Non-Functional
- NFR-01: Views carregam em < 500ms com 100+ arquivos
- NFR-02: Nenhum crash com diretório vazio ou inexistente
- NFR-03: Interface consistente com tema Obsidian (light/dark)

## 3. MoSCoW

| Priority | IDs |
|---|---|
| Must | VF-01, VF-02, VF-03, VF-04, VF-05, VF-06, VF-07, VF-08 |
| Should | VF-09, VF-10 |

## 4. Root Causes

| Bug | Root Cause | Fix |
|---|---|---|
| Inbox vazio | `adapter.list()` silencioso no mobile + sem error handling | ensureDir + try/catch + path normalize |
| Lint vazio | Mesmo que acima + threshold de órfão | Remover threshold + fix index compare |
| UI feia | HTML cru sem CSS | Obsidian CSS variables + card layout |
| Crash com 1 arquivo | Sem per-file try/catch | Try/catch por arquivo no loop |
