# B-007 — Página Wiki de Alocação Diária por Contrato + Exportação Excel

**Status:** backlog  
**Prioridade:** Média  

---

## Motivação

O usuário mantém um arquivo de alocações de funcionários em `data/allocations.md` (Markdown com frontmatter YAML). Hoje não há forma de gerar um artefato diário consolidado a partir desses dados. O objetivo é um comando que produza:

1. **Página wiki** `wiki/allocation-YYYY-MM-DD.md` — tabelas agrupadas por contrato, consultável no Obsidian/graph view.
2. **Planilha Excel** `allocation-YYYY-MM-DD.xlsx` — dados flat exportáveis para stakeholders externos.

---

## Schema do arquivo fonte

`data/allocations.md` (caminho configurável via settings):

```yaml
---
type: allocation
entries:
  - employee: "João Silva"
    matricula: "E001"
    contract: "Contrato ABC"
    frente: "Backend"
    dedication: 50
  - employee: "Maria Santos"
    matricula: "E002"
    contract: "Contrato ABC"
    frente: "Frontend"
    dedication: 100
  - employee: "Pedro Oliveira"
    matricula: "E003"
    contract: "Contrato DEF"
    frente: "QA"
    dedication: 75
---
```

---

## Formato dos artefatos gerados

### Wiki (`wiki/allocation-YYYY-MM-DD.md`)

```markdown
---
title: "Alocação Diária — 2026-06-11"
category: allocation
tags: [alocacao, diario]
date: 2026-06-11
---

# Alocação Diária — 2026-06-11

## Contrato ABC

| Funcionário | Matrícula | Frente | % Dedicação |
|-------------|-----------|--------|-------------|
| João Silva | E001 | Backend | 50% |
| Maria Santos | E002 | Frontend | 100% |

## Contrato DEF

| Funcionário | Matrícula | Frente | % Dedicação |
|-------------|-----------|--------|-------------|
| Pedro Oliveira | E003 | QA | 75% |
```

### Excel (`allocation-YYYY-MM-DD.xlsx`)

Uma aba "Alocação" com dados flat:

| Contrato | Funcionário | Matrícula | Frente | % Dedicação |
|----------|-------------|-----------|--------|-------------|
| Contrato ABC | João Silva | E001 | Backend | 50% |
| Contrato ABC | Maria Santos | E002 | Frontend | 100% |
| Contrato DEF | Pedro Oliveira | E003 | QA | 75% |

---

## Análise de Impacto

### Novos módulos

| Arquivo | Responsabilidade |
|---------|-----------------|
| `src/allocation/types.ts` | Interface `AllocationEntry` |
| `src/allocation/reader.ts` | Lê e parseia o arquivo fonte (yaml frontmatter) |
| `src/allocation/wiki-generator.ts` | Gera string Markdown agrupada por contrato |
| `src/allocation/excel-generator.ts` | Gera `ArrayBuffer` xlsx via SheetJS |

### Arquivos alterados

| Arquivo | Mudança |
|---------|---------|
| `src/settings.ts` | Campo `allocationDataPath: string` (default: `'data/allocations.md'`) |
| `src/main.ts` | Comando `generate-allocation` — gera wiki + xlsx, exibe Notice |
| `package.json` | Dependência `xlsx` (SheetJS, browser-compatible, ~200 KB bundle) |

### Testes (`src/__tests__/allocation.test.ts`)

- **T-Reader-01**: frontmatter válido → `AllocationEntry[]` correto
- **T-Reader-02**: arquivo ausente → erro com mensagem clara
- **T-Reader-03**: frontmatter sem `entries` → erro de schema
- **T-Wiki-01**: duas entries mesmo contrato → uma seção, duas linhas
- **T-Wiki-02**: contratos diferentes → seções em ordem de aparição
- **T-Wiki-03**: frontmatter gerado contém `category: allocation` e `date:`
- **T-Excel-01**: `generate()` retorna `ArrayBuffer` com tamanho > 0
- **T-Excel-02**: planilha contém todas as linhas dos entries

---

## Decisões de design pendentes

- **Múltiplos arquivos fonte**: hoje assume um único `data/allocations.md`; se no futuro houver um arquivo por projeto/contrato, o reader precisará agregar — postergar para quando houver necessidade concreta.
- **Abas por contrato no Excel**: MVP usa aba única flat; versão futura pode criar uma aba por contrato.
- **Período de validade da alocação**: campos `start`/`end` não estão no MVP — todas as entradas são tratadas como válidas para o dia corrente.
