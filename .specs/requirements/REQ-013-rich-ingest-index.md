# Requirements Specification

| Field | Value |
|---|---|
| **ID** | REQ-013 |
| **Status** | approved |
| **Author** | Lucas Santos |
| **Created** | 2026-06-09 |
| **Stakeholders** | Lucas Santos (curador), Hermes Agent (consumidor), mantenedor do plugin |

---

## 1. Problem Statement

### Current Situation

Dois problemas permanecem após a fatia REQ-012:

**1. `gatherContext()` lê TODO o vault em cada query.**
Mesmo com BM25 local, `gatherContext()` faz `adapter.read()` de cada página wiki para construir
o índice em memória. Com 50 páginas: 50 leituras de arquivo por pergunta. Com 200 páginas: 200.
A seleção é boa, mas o custo de I/O cresce linearmente com o vault.

**2. Páginas geradas pelo `ingestFile()` não carregam `summary` nem `key_entities` no frontmatter.**
A LLM já retorna `summary` no JSON de ingest, mas o campo é descartado. `key_entities` nem é
solicitado. Resultado: o índice só tem título e tags para fazer BM25 — contexto semântico pobre
para pré-filtrar sem ler o corpo completo.

### Why This Matters

Sem `summary`/`key_entities` no frontmatter e sem índice persistido, o BM25 da fatia anterior
não pode cumprir sua promessa de "pre-filter local, cheap": ainda lê N arquivos completos mesmo
quando precisaria de informação de N chars de summary por página. À medida que o vault cresce,
o custo de cada query cresce junto — o oposto do que a metodologia Karpathy propõe.

### Success Definition

| Metric | Current | Target |
|---|---|---|
| Leituras de arquivo por `gatherContext` | O(N) – lê todas as páginas | O(1 JSON + K full reads) quando índice existe |
| Campos no frontmatter gerado por ingest | title, category, tags, date, source | + `summary`, `key_entities` |
| Persistência do índice | inexistente | `.vault-keeper/bm25-index.json` atualizado após ingest/write |
| Cobertura do novo módulo | 0% | ≥ 90% |

---

## 2. Stakeholder Map

| Stakeholder | Role | Interest | Influence | Key Concern |
|---|---|---|---|---|
| Lucas Santos | Curador | Queries baratas em vault grande | High | I/O não cresce com vault |
| Hermes Agent (LLM) | Consumidor | Contexto com melhor sinal semântico | High | summary/key_entities enriquecem os hits |
| Mantenedor | Dev | Código testável, sem deps novas | Med | Pure-TS, mobile-safe, zero deps |

---

## 3. Methodology

**Hybrid — User Stories + BDD Scenarios**

---

## 4. Requirements

### 4.1 User Stories

| ID | Story | Acceptance Criteria |
|---|---|---|
| US-01 | Como curador, quero que `gatherContext` não leia páginas irrelevantes do disco quando o índice já existir, para que a busca seja barata independente do tamanho do vault | 1. Com índice JSON presente, `read()` só é chamado para o JSON + top-K páginas. 2. Páginas fora do top-K não são lidas. |
| US-02 | Como curador, quero que páginas geradas por ingest tenham `summary` e `key_entities` no frontmatter, para que o índice tenha sinal semântico sem precisar ler o corpo completo | 1. Frontmatter da página criada inclui campo `summary`. 2. Frontmatter inclui campo `key_entities` (lista). |
| US-03 | Como mantenedor, quero que o índice JSON seja atualizado automaticamente após cada `ingestFile()` e `writePage()`, para que `gatherContext` sempre encontre as páginas recentes | 1. Após ingest: `.vault-keeper/bm25-index.json` contém a nova página. 2. Após writePage: idem. |
| US-04 | Como curador, quero que `gatherContext` funcione normalmente mesmo sem índice JSON (vault vazio ou recém-instalado), fazendo fallback para o scan de arquivos | 1. Sem `.vault-keeper/bm25-index.json`: comportamento idêntico ao da fatia REQ-012. |

### 4.4 BDD Scenarios

```gherkin
Feature: Persistent BM25 index (fast gatherContext)

  Scenario: Fast path uses index JSON, skips non-top-K reads
    Given um índice JSON com 5 entradas (2 relevantes, 3 de ruído)
    When gatherContext("termo relevante", maxPages=2) é chamado
    Then apenas os 2 arquivos relevantes são lidos do disco
      And os 3 arquivos de ruído NÃO são lidos

  Scenario: Fallback quando índice ausente
    Given nenhum arquivo .vault-keeper/bm25-index.json
      And 3 páginas wiki no vault
    When gatherContext("qualquer pergunta") é chamado
    Then todas as 3 páginas são lidas (fallback para scan)
      And o resultado contém conteúdo das páginas relevantes

  Scenario: Ingest persiste no índice JSON
    Given um arquivo raw para ingestar
    When ingestFile() é executado com LLM retornando summary e key_entities
    Then a página criada tem frontmatter com summary e key_entities
      And .vault-keeper/bm25-index.json contém entrada para a nova página
      And a entrada tem os campos: path, title, summary, tags, key_entities

  Scenario: writePage persiste no índice JSON
    Given writePage("Título", "conteúdo", ["tag"], "categoria")
    When a página é criada
    Then .vault-keeper/bm25-index.json contém entrada para a nova página

  Scenario: Upsert atualiza entrada existente
    Given um índice com entrada para "wiki/a.md"
    When upsert é chamado com dados novos para "wiki/a.md"
    Then o índice tem exatamente 1 entrada para "wiki/a.md" com os dados novos
```

---

## 5. Functional Requirements

| ID | Description | Source | Priority |
|---|---|---|---|
| REQ-01 | `IndexPersistence` lê/escreve `.vault-keeper/bm25-index.json` com `{path,title,summary,tags,key_entities}[]` | US-03 | Must |
| REQ-02 | `IndexPersistence.upsert()` adiciona nova entrada ou substitui a de mesmo path | US-03, BDD-upsert | Must |
| REQ-03 | `IndexPersistence.remove()` remove entrada por path | US-03 | Must |
| REQ-04 | `IndexPersistence.load()` retorna `[]` quando arquivo não existe | US-04 | Must |
| REQ-05 | `ingestFile()` extrai `summary` e `key_entities` do JSON do LLM e os grava no frontmatter | US-02 | Must |
| REQ-06 | `ingestFile()` e `writePage()` chamam `IndexPersistence.upsert()` após criar a página | US-03 | Must |
| REQ-07 | `PROMPTS.ingest` solicita `key_entities` no schema JSON devolvido pela LLM | US-02 | Must |
| REQ-08 | `gatherContext()` tenta fast path: carrega índice JSON → BM25 sobre entradas leves → lê só top-K completos | US-01, BDD-fast | Must |
| REQ-09 | `gatherContext()` cai em fallback (scan de arquivos) quando índice ausente ou vazio | US-04, BDD-fallback | Must |
| REQ-10 | Módulo `src/search/index-persistence.ts` não importa `obsidian`; recebe adapter via construtor | US-04 | Must |

---

## 6. Non-Functional Requirements

| ID | Category | Description | Measurement |
|---|---|---|---|
| NFR-01 | Performance | Com índice presente, `gatherContext` faz O(1 + K) reads, não O(N) | mock vault: count `adapter.read` calls |
| NFR-02 | Portabilidade | Pure-TS, sem deps novas, mobile-safe | zero deps adicionadas |
| NFR-03 | Cobertura | `src/search/index-persistence.ts` ≥ 90% | vitest coverage |
| NFR-04 | Retrocompatibilidade | Suíte 129 verde, assinatura de `gatherContext` preservada | `npm test` |

---

## 7. Constraints

| ID | Constraint | Type | Impact |
|---|---|---|---|
| C-01 | Zero deps novas | Technical | Pure-TS JSON parse/stringify |
| C-02 | Sem obsidian em src/search/ | Technical | Adapter injetado via construtor |
| C-03 | `.vault-keeper/` pode não existir; persistência cria o dir | Technical | `adapter.mkdir` antes de `write` |

---

## 8. Assumptions

| ID | Assumption | Validation | Risk if Wrong |
|---|---|---|---|
| A-01 | LLM de ingest retorna `summary` e `key_entities` quando solicitado | Parcial (summary já era solicitado, key_entities novo) | Campos ausentes → defaults seguros (`""` / `[]`) |
| A-02 | `.vault-keeper/` é gravável pelo plugin | Sim — mesmo padrão do sync-state | — |
| A-03 | Índice JSON é sempre construído via ingest/write; reconstrói manualmente se corrompido | Sim — fallback existe | Vault sem histórico começa sem índice → fallback |

---

## 9. Out of Scope

- Cross-link injection (patching páginas existentes após ingest) — fatia seguinte.
- Invalidação do índice por mtime (freshness check) — otimização futura.
- `_slots/`, `_rules/`, AGENTS.md routing no vault — fatia 3.
- Tool `bm25_search` exposto ao agente — fatia 3.

---

## 10. MoSCoW Prioritization

| Priority | Requirements | Rationale |
|---|---|---|
| **Must have** | REQ-01..REQ-10 | Núcleo: ingest rico + índice persistido + fast path |
| **Could have** | Freshness check por mtime | Útil mas index reconstruível manualmente |
| **Won't have (now)** | Cross-links, slots/rules, bm25_search tool | Próximas fatias |

---

## 11. Dependencies

| Dependency | Type | Status | Impact |
|---|---|---|---|
| `src/search/bm25.ts` + `index-builder.ts` | Internal (CHG-012) | Done | Base do motor de busca |
| `src/wiki/ops.ts` | Internal | Modificado | Ponto de integração |
| `src/llm/provider.ts` PROMPTS.ingest | Internal | Modificado | Adiciona key_entities |

---

## 12. Domain Glossary

| Term | Definition | Context |
|---|---|---|
| `IndexEntry` | `{path,title,summary,tags,key_entities}` — representação leve de uma página para pre-filter | index-persistence.ts |
| Fast path | Carregar índice JSON → BM25 sobre entradas leves → ler só top-K completos | gatherContext() |
| Fallback | Scan completo de arquivos quando índice ausente/vazio | gatherContext() |
| `key_entities` | Lista de entidades-chave extraídas pela LLM no ingest | frontmatter + IndexEntry |

---

## 13. Risks & Mitigations

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Índice desatualizado (page criada sem chamar upsert) | Low | Med | Toda criação de página passa por ingestFile/writePage que chamam upsert |
| LLM não retorna key_entities | Med | Low | Default seguro: `[]` — índice ainda funciona com title/summary/tags |
| mock vault sem `mkdir` nos testes novos | Low | Low | Usar o mock completo do wiki-ops.test.ts |

---

## 14. Traceability Matrix

| REQ ID | Source | Summary | Priority | Implementation Spec | Test ID |
|---|---|---|---|---|---|
| REQ-01..04 | US-03, BDD | IndexPersistence load/save/upsert/remove | Must | changes/013-rich-ingest-index/ | TEST-01..05 |
| REQ-05,07 | US-02 | summary+key_entities no frontmatter e prompt | Must | changes/013-rich-ingest-index/ | TEST-06,07 |
| REQ-06 | US-03 | ingest/write chamam upsert | Must | changes/013-rich-ingest-index/ | TEST-08,09 |
| REQ-08 | US-01, BDD-fast | gatherContext fast path | Must | changes/013-rich-ingest-index/ | TEST-10 |
| REQ-09 | US-04, BDD-fallback | gatherContext fallback | Must | changes/013-rich-ingest-index/ | TEST-11 |
| REQ-10 | US-04 | módulo puro | Must | changes/013-rich-ingest-index/ | TEST-12 |
