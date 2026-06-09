# Requirements Specification

| Field | Value |
|---|---|
| **ID** | REQ-014 |
| **Status** | approved |
| **Author** | Lucas Santos |
| **Created** | 2026-06-09 |
| **Stakeholders** | Lucas Santos (curador), Hermes Agent (consumidor) |

---

## 1. Problem Statement

### Current Situation

Três lacunas finais impedem a metodologia Karpathy de funcionar plenamente no agente:

**1. O agente explora às cegas.**
Para responder uma pergunta, o agente faz `read_index` ou `read_file` aleatório. Não há
ferramenta que use o índice BM25 já construído nas fatias anteriores. O agente descobre os
candidatos iterando — 3 a 5 chamadas de tool por resposta, gastando janela de contexto.
Com `bm25_search`, o agente chega orientado: 1 chamada de tool retorna uma lista ranqueada.

**2. Não há estado de sessão.**
O agente não sabe em que o curador está trabalhando agora. Sem `_slots/focus.md`, cada
pergunta começa do zero sem o contexto do tópico atual. A metodologia Karpathy prevê
estado mutável em `_slots/` para persistir foco entre sessões.

**3. FAITHFULNESS não está enforced.**
O prompt atual diz "Always cite sources with [[links]]" de passagem, dentro de uma lista de
regras. Não há instrução explícita de que inventar fatos é proibido. O `ai-memory` chama
isso de regra #1 — deve estar no sistema como primeira regra, não como item de lista.

### Why This Matters

Sem essas três peças, o agente é eficiente no retrieval (BM25) mas ainda "explora" em vez
de "navegar" — gasta iterações que custam tokens. A metodologia completa prevê: agente
orientado (routing table) + estado de sessão (_slots/) + respostas fiéis (FAITHFULNESS).

### Success Definition

| Metric | Current | Target |
|---|---|---|
| Tool calls por resposta típica | 3-5 (exploração) | 1-2 (bm25_search + read_file) |
| Contexto de sessão injetado | inexistente | `_slots/focus.md` prepended quando existe |
| FAITHFULNESS no prompt | item de lista | regra destacada, primeira do prompt |
| `bm25_search` disponível | não existe | retorna lista ranqueada do índice |

---

## 2. Stakeholder Map

| Stakeholder | Role | Interest | Influence | Key Concern |
|---|---|---|---|---|
| Lucas Santos | Curador | Respostas corretas e baratas | High | Menos iterações, mais precisão |
| Hermes Agent | Consumidor | Ferramentas de navegação e estado | High | bm25_search + slots |

---

## 3. Methodology

**User Stories + BDD**

---

## 4. Requirements

### 4.1 User Stories

| ID | Story | Acceptance Criteria |
|---|---|---|
| US-01 | Como agente, quero uma ferramenta `bm25_search(query, topK)` que retorne páginas ranqueadas do índice sem ler arquivos, para chegar orientado à resposta | 1. Retorna lista ranqueada com path, título e summary. 2. Usa o IndexPersistence existente. |
| US-02 | Como curador, quero que meu foco atual (`_slots/focus.md`) seja injetado automaticamente no contexto de cada query, para o agente saber o que estou trabalhando | 1. `gatherContext()` prependa o conteúdo de `_slots/focus.md` quando ele existir. 2. Ausente o slot, nenhum erro ocorre. |
| US-03 | Como curador, quero salvar e ler slots de estado (`_slots/focus.md`, `_slots/pending.md`), para o agente manter contexto entre sessões | 1. `SlotsManager.writeSlot(name, content)` cria o arquivo e o dir se necessário. 2. `SlotsManager.readSlot(name)` retorna o conteúdo ou null. |
| US-04 | Como curador, quero que o prompt do agente exija citações em toda resposta factual (FAITHFULNESS), para evitar invenções | 1. DEFAULT_AGENT_PROMPT contém regra FAITHFULNESS explícita. 2. Prompt inclui tabela de roteamento que prioriza `bm25_search`. |

### 4.4 BDD Scenarios

```gherkin
Feature: bm25_search tool

  Scenario: Returns ranked results from persisted index
    Given .vault-keeper/bm25-index.json com 3 entradas (1 relevante, 2 de ruído)
    When bm25_search({query: "karpathy wiki"}) é chamado
    Then o resultado contém o path e título da página relevante
      And não menciona as páginas de ruído

  Scenario: Empty index message
    Given nenhum .vault-keeper/bm25-index.json
    When bm25_search({query: "qualquer"}) é chamado
    Then o resultado informa que o índice está vazio

  Scenario: No results message
    Given índice com entradas de assuntos não relacionados
    When bm25_search({query: "tema irrelevante"}) é chamado
    Then o resultado informa que não há resultados para a query

Feature: _slots/ state

  Scenario: gatherContext injects focus slot
    Given _slots/focus.md com conteúdo "Projeto Atlas"
    When gatherContext(question) é chamado
    Then o contexto retornado contém "Projeto Atlas"

  Scenario: SlotsManager creates dir on first write
    Given _slots/ não existe
    When writeSlot("focus", "conteúdo") é chamado
    Then _slots/ é criado e _slots/focus.md contém o conteúdo
```

---

## 5. Functional Requirements

| ID | Description | Source | Priority |
|---|---|---|---|
| REQ-01 | `SlotsManager.readSlot(name)` retorna string ou null se arquivo ausente | US-03 | Must |
| REQ-02 | `SlotsManager.writeSlot(name, content)` cria dir `_slots/` se ausente | US-03 | Must |
| REQ-03 | `gatherContext()` prepend `_slots/focus.md` quando existe | US-02, BDD | Must |
| REQ-04 | Tool `bm25_search(query, topK?)` lê IndexPersistence e retorna lista ranqueada com path/título/summary | US-01, BDD | Must |
| REQ-05 | `bm25_search` retorna mensagem "índice vazio" quando não há entradas | US-01, BDD | Must |
| REQ-06 | `bm25_search` retorna "sem resultados" quando query não casa com nada | US-01, BDD | Must |
| REQ-07 | `executeTool` despacha `bm25_search` | US-01 | Must |
| REQ-08 | DEFAULT_AGENT_PROMPT inclui FAITHFULNESS como regra explícita | US-04 | Must |
| REQ-09 | DEFAULT_AGENT_PROMPT inclui tabela de roteamento priorizando `bm25_search` | US-04 | Must |
| REQ-10 | DEFAULT_AGENT_PROMPT inclui `bm25_search` no catálogo de tools | US-04 | Must |
| REQ-11 | `SlotsManager` não importa `obsidian`; adapter injetado via construtor | US-03 | Must |

---

## 6. Non-Functional Requirements

| ID | Category | Description | Measurement |
|---|---|---|---|
| NFR-01 | Performance | `bm25_search` zero chamadas de rede | 0 fetch no caminho |
| NFR-02 | Portabilidade | Pure-TS, zero deps novas | npm ls |
| NFR-03 | Cobertura | `src/slots/manager.ts` ≥ 90% | vitest coverage |
| NFR-04 | Retrocompatibilidade | Suíte 148 verde, 'knowledge vault' no prompt padrão | `npm test` |

---

## 7. Constraints

| ID | Constraint | Type | Impact |
|---|---|---|---|
| C-01 | DEFAULT_AGENT_PROMPT deve preservar a string 'knowledge vault' | Technical | Teste existente em chat-agent.test.ts linha 50 |
| C-02 | Zero deps novas | Technical | Pure JS |

---

## 9. Out of Scope

- Cross-link injection (patching de arquivos existentes) — complexo, risco de corrupção, fase futura.
- `_rules/` — similar a `_slots/`, pode ser adicionado incrementalmente.
- Tool `write_slot` exposto ao agente — o agente pode criar slots via write_page por enquanto.
- Reindexação automática por mtime — futura.

---

## 10. MoSCoW

| Priority | Requirements |
|---|---|
| **Must have** | REQ-01..REQ-11 |
| **Won't have** | Cross-links, _rules/, write_slot tool |

---

## 14. Traceability Matrix

| REQ ID | Source | Summary | Priority | Test ID |
|---|---|---|---|---|
| REQ-01,02,11 | US-03 | SlotsManager | Must | TEST-01..05 |
| REQ-03 | US-02 | gatherContext + slots | Must | TEST-06,07 |
| REQ-04..07 | US-01, BDD | bm25_search tool | Must | TEST-08..11 |
| REQ-08..10 | US-04 | prompts FAITHFULNESS + routing | Must | TEST-12,13 |
