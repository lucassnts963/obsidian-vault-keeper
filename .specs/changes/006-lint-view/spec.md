# Spec: LintView — Auditoria de Vault

| Field | Value |
|---|---|
| **ID** | CHG-006 |
| **Status** | draft |
| **Author** | Lucas Santos |
| **Created** | 2026-06-07 |

## Scope
- Detecção de páginas órfãs (sem inbound links)
- Detecção de frontmatter YAML quebrado
- Verificação de index desatualizado
- Tabela de resultados

## Tests
`src/__tests__/lint-view.test.ts`
