# Spec: Settings Tab — Paths, maxTokens, Input Masking

| Field | Value |
|---|---|
| **ID** | CHG-002 |
| **Status** | draft |
| **Author** | Lucas Santos |
| **Created** | 2026-06-07 |

## Context

O settings tab atual (`src/settings-tab.ts`) só expõe LLM (provider, endpoint, model, apiKey) e Git (toggle, remote, token). Os paths do vault (`wikiPath`, `inboxPath`, `rawPath`, `indexPath`, `logPath`) estão definidos no schema e defaults mas sem UI. O `maxTokens` e `temperature` existem como defaults mas não são configuráveis. O campo apiKey mostra o token em texto claro.

## Scope

Adicionar controles faltantes no settings tab sem alterar o schema de settings (já existe).

### Out of Scope

- Validação de paths (se diretório existe)
- Migração de paths
- Suporte a i18n

## Requirements

### Functional

- [ ] FW-01: Inputs para `wikiPath`, `inboxPath`, `rawPath`, `indexPath`, `logPath`
- [ ] FW-02: Input numérico para `maxTokens`
- [ ] FW-03: Campo `apiKey` com `inputType: 'password'`
- [ ] FW-04: Seção Git: esconder remote/token quando `enabled = false`

### Technical

| Layer | File | Change |
|---|---|---|
| Frontend | `src/settings-tab.ts` | Adicionar 5 inputs de path, maxTokens, password, hide git |

## Design

### States

| State | Behavior |
|---|---|
| Normal | Todos campos visíveis e editáveis |
| Git disabled | Apenas toggle visível, remote + token ocultos |

### Edge Cases

- Path vazio: usa placeholder mostrando o default
- maxTokens vazio: placeholder `4096`
- apiKey vazio: campo vazio sem placeholder (segurança)

## Dependencies

- Nenhuma — `VaultKeeperSettings` já tem todos os campos no schema

## Requirements Traceability

| FW ID | Source | Summary | Priority |
|---|---|---|---|
| FW-01 | REQ-002 US-06 | Paths configuráveis | Must |
| FW-02 | REQ-002 US-06 | maxTokens | Should |
| FW-03 | REQ-002 US-06 | apiKey password | Should |
| FW-04 | REQ-002 US-06 | Git condicional | Could |

## Tests

### Test Cases

| ID | Test | Type | Description |
|---|---|---|---|
| TEST-01 | settings-tab renders all path inputs | unit | Verifica 5 inputs de path são renderizados |
| TEST-02 | settings-tab renders maxTokens input | unit | Input numérico renderizado |
| TEST-03 | settings-tab apiKey is password type | unit | inputType = 'password' |
| TEST-04 | settings-tab hides git fields when disabled | unit | remote + token hidden |
| TEST-05 | settings-tab shows git fields when enabled | unit | remote + token visible |
| TEST-06 | settings paths default to DEFAULT_SETTINGS | unit | Placeholder/text mostra valor default |

### Test Files

| File | What It Covers |
|---|---|
| `src/__tests__/settings-tab.test.ts` | Renderização de todos os inputs, toggle git |

## Validation Checklist
- [ ] Tests written BEFORE implementation (Red phase)
- [ ] All tests passing (Green phase)
- [ ] Build compila sem erros
- [ ] Settings persistem ao salvar
- [ ] Git toggle mostra/esconde campos
- [ ] apiKey não visível em texto claro
