# Requirements Specification

| Field | Value |
|---|---|
| **ID** | REQ-012 |
| **Status** | approved |
| **Author** | Lucas Santos |
| **Created** | 2026-06-09 |
| **Stakeholders** | Lucas Santos (owner/curador), Hermes Agent (consumidor LLM) |

---

## 1. Problem Statement

### Current Situation

O `gatherContext()` em `src/wiki/ops.ts` seleciona as páginas wiki que vão para a API
usando **match de substring ingênuo**: para cada página, testa se *qualquer* keyword da
pergunta (`length > 3`) aparece no texto via `page.toLowerCase().includes(kw)`. As primeiras
N páginas que baterem (ordem do filesystem) são enviadas, truncadas a 2000 chars cada.

Isso tem três defeitos de qualidade-de-contexto:

1. **Sem relevância** — uma página que menciona a keyword uma única vez de passagem
   tem o mesmo peso de uma página inteiramente sobre o tópico. Não há ranking.
2. **Ordem arbitrária** — o corte em `maxPages` segue a ordem de `adapter.list()`
   (filesystem), então páginas altamente relevantes podem ser descartadas porque
   vieram depois de páginas irrelevantes que casaram por acaso.
3. **Ruído caro** — páginas pouco relevantes consomem tokens do orçamento da API
   sem agregar à resposta, exatamente o que a metodologia Karpathy quer evitar
   ("compile knowledge locally, send only the relevant slice").

### Why This Matters

A metodologia (Karpathy LLM Wiki + análise ai-memory) pressupõe que **o trabalho de
organização/seleção acontece localmente** e a API recebe apenas inteligência de síntese
sobre material já qualificado. Com o match ingênuo, mandamos contexto barato em qualidade
mas caro em tokens — e em vaults grandes a janela de contexto estoura ou degrada a resposta.
Não fazer nada significa: custo de API crescente, respostas piores conforme o vault cresce,
e o agente "explorando às cegas" (gastando iterações) por não chegar já orientado.

### Success Definition

| Metric | Current | Target |
|---|---|---|
| Critério de seleção de páginas | substring `includes()` | ranking BM25 (TF-IDF + normalização de tamanho) |
| Páginas irrelevantes no contexto (top-K) | sem garantia de exclusão | página sem termo da query nunca entra por relevância |
| Determinismo do top-K | depende da ordem do filesystem | ordenado por score, estável |
| Custo de runtime extra na query | 0 (mas qualidade baixa) | 0 chamadas de API adicionais (100% local, sem deps novas) |
| Cobertura de testes do motor de busca | 0% | ≥ 90% no módulo `src/search/` |

---

## 2. Stakeholder Map

| Stakeholder | Role | Interest | Influence | Key Concern |
|---|---|---|---|---|
| Lucas Santos | Owner / curador do vault | Respostas fiéis e baratas sobre conhecimento curado | High | Qualidade do contexto e custo de API |
| Hermes Agent (LLM) | Consumidor do contexto | Receber só o material relevante para sintetizar | High | Não desperdiçar janela com ruído |
| Mantenedor do plugin | Dev | Código testável, sem deps nativas (roda em WebView mobile) | Med | Pure-TS, zero dependência nova, mobile-safe |

---

## 3. Methodology

> Hybrid — **User Stories** (valor para o curador) + **BDD Scenarios** (comportamento
> determinístico do ranqueador, testável no nível de aceitação).

| Methodology | When to Use | Section |
|---|---|---|
| User Stories | Valor para o curador/agente | 4.1 |
| BDD Scenarios | Comportamento exato do ranking BM25 | 4.4 |

---

## 4. Requirements

### 4.1 User Stories

| ID | Story | Acceptance Criteria |
|---|---|---|
| US-01 | Como curador, quero que o contexto enviado à API contenha as páginas **mais relevantes** à minha pergunta, não as primeiras que casarem, para que a resposta seja melhor e mais barata | 1. As páginas escolhidas são ranqueadas por relevância (BM25). 2. Uma página densa sobre o tópico ranqueia acima de uma que menciona o termo de passagem. |
| US-02 | Como curador, quero que páginas sem nenhuma relação com a pergunta **nunca** entrem no contexto por relevância, para não desperdiçar tokens | 1. Página sem nenhum termo da query tem score 0. 2. Score 0 é excluído do top-K. |
| US-03 | Como curador, quero que título e tags da página pesem mais que o corpo na busca, porque resumem o assunto | 1. Match no título/tags contribui mais que match equivalente no corpo. |
| US-04 | Como mantenedor, quero o motor de busca como módulo puro e testável, sem dependências novas nem API runtime, para rodar igual em desktop e mobile WebView | 1. `src/search/` não importa `obsidian` nem faz I/O. 2. Zero novas deps em `package.json`. 3. Cobertura ≥ 90%. |

### 4.4 BDD Scenarios

```gherkin
Feature: Ranqueamento BM25 local de páginas wiki

  Scenario: Página densa supera menção de passagem
    Given uma página A que fala extensivamente sobre "karpathy wiki"
      And uma página B que menciona "karpathy" uma única vez num aside
    When busco por "karpathy wiki"
    Then A aparece antes de B no resultado

  Scenario: Página irrelevante é excluída
    Given uma página sobre "receitas de bolo"
    When busco por "memória de agentes"
    Then a página de receitas tem score 0
      And não aparece no top-K

  Scenario: Normalização por tamanho do documento
    Given uma página curta inteiramente sobre o termo
      And uma página enorme que cita o termo poucas vezes
    When busco pelo termo
    Then a página curta-e-focada não é injustamente penalizada
      And ranqueia de forma competitiva (B do BM25 = 0.75)

  Scenario: Peso de título e tags
    Given uma página cujo TÍTULO é "Memória de Agentes" com corpo genérico
      And uma página que cita "memória de agentes" só no meio do corpo
    When busco por "memória de agentes"
    Then a página com o termo no título ranqueia acima

  Scenario: gatherContext usa BM25 para escolher as sementes
    Given um wiki com 5 páginas, 2 relevantes e 3 ruído
    When gatherContext(pergunta, maxPages=2) roda
    Then as 2 páginas do contexto são as relevantes
      And nenhuma das 3 de ruído entra por relevância

  Scenario: Acentuação e caixa são normalizadas
    Given uma página com "Memória" (com acento, maiúscula)
    When busco por "memoria" (sem acento, minúscula)
    Then o termo casa e contribui para o score
```

---

## 5. Functional Requirements

| ID | Description | Source | Priority |
|---|---|---|---|
| REQ-01 | O sistema deve fornecer um índice BM25 puro em TypeScript que indexa documentos `{id, text}` e retorna os top-K por score decrescente | US-01, US-04 | Must |
| REQ-02 | O ranqueador deve usar a fórmula BM25 (TF saturada por `k1`, normalização de tamanho por `b`, IDF) com defaults `k1=1.5`, `b=0.75` | US-01, BDD | Must |
| REQ-03 | A tokenização deve normalizar caixa e acentos (NFD strip), descartar tokens com `length ≤ 2` | US-... (BDD acentos) | Must |
| REQ-04 | Documentos com score 0 (nenhum termo da query) não devem aparecer no resultado | US-02 | Must |
| REQ-05 | O index-builder deve parsear páginas wiki (frontmatter → `title`, `tags`, `summary`; corpo separado) e montar o texto de busca com título e tags ponderados acima do corpo | US-03 | Must |
| REQ-06 | `gatherContext()` deve escolher as páginas-semente via ranking BM25 (substituindo o `includes()` ingênuo), preservando: prepend do index, traversal de links 1 nível, truncamento por página | US-01, US-02 | Must |
| REQ-07 | O módulo de busca não deve importar `obsidian` nem realizar I/O — recebe conteúdo já lido | US-04 | Must |

---

## 6. Non-Functional Requirements

| ID | Category | Description | Measurement |
|---|---|---|---|
| NFR-01 | Performance | Indexação + query sobre o vault não faz nenhuma chamada de rede/API | 0 fetch no caminho de busca |
| NFR-02 | Portabilidade | Roda em Electron e Android WebView (pure JS, sem módulos nativos) | Sem deps novas; só `String`/`Map`/`Math` |
| NFR-03 | Manutenibilidade | Cobertura do módulo de busca ≥ 90% | relatório vitest |
| NFR-04 | Compatibilidade | Assinatura de `gatherContext(question, maxPages, linkDepth)` preservada; testes existentes seguem verdes | suíte atual (111) sem regressão |

---

## 7. Constraints

| ID | Constraint | Type | Impact |
|---|---|---|---|
| C-01 | Zero novas dependências de runtime (bundle mobile-safe ~26KB) | Technical | BM25 implementado à mão, sem `minisearch`/`lunr` |
| C-02 | Sem embeddings/API externa nesta fatia | Technical | Busca é lexical (BM25), não semântica — fase futura |
| C-03 | `src/search/` deve ser pure-TS (sem `obsidian`, sem I/O) | Technical | I/O fica em `wiki/ops.ts`, módulo recebe strings |

---

## 8. Assumptions

| ID | Assumption | Validation | Risk if Wrong |
|---|---|---|---|
| A-01 | Páginas wiki têm frontmatter YAML com `title`/`tags` (e opcionalmente `summary`) | Sim — convenção do vault | Parser cai em defaults seguros (title=slug, tags=[]) |
| A-02 | Busca lexical BM25 cobre a maioria das queries do curador | Parcial | Queries por sinônimo exigem fase de embeddings (fora de escopo) |

---

## 9. Out of Scope

- Embeddings / busca semântica (fase futura — RAG semântico com cache local).
- Persistência do índice em `.vault-keeper/*.json` (este slice reconstrói em memória).
- Chunking sub-página (indexa página inteira por enquanto).
- Ingest rico (summary/key_entities no frontmatter) — fase seguinte.
- Novo tool `bm25_search` exposto ao agente — fase seguinte.
- `_slots/` e `_rules/` da metodologia ai-memory — fases seguintes.

---

## 10. MoSCoW Prioritization

| Priority | Requirements | Rationale |
|---|---|---|
| **Must have** | REQ-01..REQ-07 | Núcleo local-first: ranking real substituindo o match ingênuo |
| **Should have** | — | — |
| **Could have** | Persistência do índice em disco | Otimização; reconstruir em memória já é barato |
| **Won't have (now)** | Embeddings, chunking, ingest rico, slots/rules | Fases subsequentes da metodologia |

---

## 11. Dependencies

| Dependency | Type | Status | Impact if Unavailable |
|---|---|---|---|
| `src/wiki/ops.ts` `gatherContext()` | Internal | Available | Ponto de integração do ranking |
| Convenção de frontmatter do vault | Internal | Available | Parser usa defaults se ausente |

---

## 12. Domain Glossary

| Term | Definition | Context |
|---|---|---|
| BM25 | Função de ranking probabilístico (Okapi BM25): TF saturado, IDF, normalização por tamanho | Motor de busca local |
| `k1` | Parâmetro de saturação de TF (default 1.5) | Quanto repetir o termo ainda agrega |
| `b` | Parâmetro de normalização por tamanho do doc (default 0.75) | Penaliza docs longos |
| IDF | Inverse Document Frequency | Termos raros pesam mais |
| top-K | Os K documentos de maior score | Seleção de páginas-semente |
| seed pages | Páginas iniciais antes do traversal de links | Entrada do `gatherContext` |

---

## 13. Risks & Mitigations

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Mudar `gatherContext` quebra testes existentes | Med | Med | Preservar assinatura e comportamento (index prepend, traversal, truncamento); rodar suíte completa |
| BM25 mal calibrado ranqueia mal | Low | Med | Defaults canônicos (k1=1.5, b=0.75) + cenários BDD cobrindo casos |
| Frontmatter fora do padrão quebra parser | Low | Low | Parser tolerante com defaults seguros |

---

## 14. Traceability Matrix

| REQ ID | Source | Requirement Summary | Priority | Implementation Spec | Test ID |
|---|---|---|---|---|---|
| REQ-01 | US-01 | Índice BM25 top-K | Must | changes/012-local-first-retrieval/ | TEST-01,02 |
| REQ-02 | US-01 | Fórmula BM25 k1/b/IDF | Must | changes/012-local-first-retrieval/ | TEST-03,06 |
| REQ-03 | BDD | Tokenização normaliza acento/caixa | Must | changes/012-local-first-retrieval/ | TEST-04 |
| REQ-04 | US-02 | Score 0 excluído | Must | changes/012-local-first-retrieval/ | TEST-05 |
| REQ-05 | US-03 | Parser + texto de busca ponderado | Must | changes/012-local-first-retrieval/ | TEST-07,08,09 |
| REQ-06 | US-01,02 | gatherContext usa BM25 | Must | changes/012-local-first-retrieval/ | TEST-10,11 |
| REQ-07 | US-04 | Módulo puro, sem obsidian/I/O | Must | changes/012-local-first-retrieval/ | TEST-12 |

---

## 15. Appendix

### Research & References
- Karpathy — LLM Wiki gist (compile-at-ingest vs retrieve-at-query)
- `aimemoryanalysis.md` (análise ai-memory / AkitaOnRails) — FAITHFULNESS, roteamento, local-first
- Okapi BM25 (Robertson/Zaragoza) — defaults k1∈[1.2,2.0], b=0.75

### Open Questions
- [ ] Persistir índice em `.vault-keeper/bm25-index.json` vale o custo? (medir reconstrução em vault grande) — diferido.
- [ ] Quando introduzir embeddings? Após validar que BM25 cobre o uso real.
