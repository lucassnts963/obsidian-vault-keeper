# Requirements Specification — Funcionalidades Pendentes

| Field | Value |
|---|---|
| **ID** | REQ-002 |
| **Status** | draft |
| **Author** | Lucas Santos |
| **Created** | 2026-06-07 |
| **Stakeholders** | Lucas Santos (user + dev) |

---

## 1. Problem Statement

### Current Situation

O plugin Vault Keeper v0.2.0 tem o sync GitHub funcionando em desktop e mobile. Porém as views (Inbox, Chat, Lint) são stubs mostrando "em desenvolvimento". O fluxo inbox→approve→raw→ingest→wiki existe parcialmente no backend (`ingestFile()`) mas não tem UI nem os métodos `approve()`/`reject()`. O settings tab só expõe LLM e Git, sem controle de paths.

### Why This Matters

Sem as views, o usuário não consegue usar a metodologia completa de gestão de conhecimento. O plugin se reduz a um sync tool + ingest via command palette. A funcionalidade core (inbox → wiki → query → lint) está ausente.

### Success Definition

- Usuário consegue visualizar, aprovar/rejeitar e fazer ingest de notas do inbox pela UI
- Usuário consegue fazer perguntas ao LLM com contexto do vault e ver citações
- Usuário consegue rodar auditoria de lint e ver resultados
- Usuário consegue configurar todos os paths do plugin via settings UI

---

## 2. Stakeholder Map

| Stakeholder | Role | Interest | Influence | Key Concern |
|---|---|---|---|---|
| Lucas Santos | Dev + Usuário | Plugin funcional no mobile | High | Fluxo completo da metodologia |
| Obsidian users | Usuários finais | Gestão de conhecimento com LLM | Low | Funcionar em desktop e mobile |

---

## 3. Methodology

**User Stories** para features end-user facing.

---

## 4. Requirements

### 4.1 User Stories

| ID | Story | Acceptance Criteria |
|---|---|---|
| US-01 | Como usuário, quero ver notas do inbox com filtro por status para gerenciar meu fluxo de conhecimento | 1. Lista mostra arquivos de `inboxPath/` 2. Filtros: inbox/approved/rejected 3. Status lido do frontmatter |
| US-02 | Como usuário, quero aprovar/rejeitar notas do inbox para movê-las no fluxo | 1. Botão approve → move para raw, status: approved 2. Botão reject → status: rejected 3. Ação reflete no vault imediatamente |
| US-03 | Como usuário, quero fazer ingest de notas aprovadas via LLM para criar páginas wiki | 1. Botão ingest visível em notas aprovadas 2. LLM propõe página → confirmação 3. Página criada em `wikiPath/` |
| US-04 | Como usuário, quero conversar com o LLM sobre meu vault para tirar dúvidas com contexto | 1. Input de texto 2. Contexto automático do vault 3. Resposta com citações `[[links]]` clicáveis |
| US-05 | Como usuário, quero auditar meu vault para encontrar problemas de qualidade | 1. Órfãos detectados 2. Frontmatter quebrado 3. Index desatualizado 4. Resultados em tabela |
| US-06 | Como usuário, quero configurar paths e tokens do plugin pela UI para personalizar o comportamento | 1. Paths: inbox, raw, wiki, index, log 2. maxTokens configurável 3. API key como campo seguro |

---

## 5. Functional Requirements

| ID | Description | Source | Priority |
|---|---|---|---|
| FW-01 | Settings tab deve expor `wikiPath`, `inboxPath`, `rawPath`, `indexPath`, `logPath` | US-06 | Must |
| FW-02 | Settings tab deve expor `maxTokens` como input numérico | US-06 | Should |
| FW-03 | API Key deve ser campo tipo password | US-06 | Should |
| FW-04 | Campos git devem esconder quando `enabled=false` | US-06 | Could |
| FW-05 | `WikiOps.approve(file)` move inbox→raw e seta status: approved | US-02 | Must |
| FW-06 | `WikiOps.reject(file)` seta status: rejected no frontmatter | US-02 | Must |
| FW-07 | `WikiOps.gatherContext(question)` lê index + páginas relevantes | US-04 | Must |
| FW-08 | `ingestFile()` deve validar JSON do LLM e tratar erros | US-03 | Must |
| FW-09 | `ingestFile()` deve detectar página duplicada antes de criar | US-03 | Should |
| FW-10 | InboxView lista arquivos com status e filtros | US-01 | Must |
| FW-11 | InboxView tem botões approve/reject/ingest por item | US-02, US-03 | Must |
| FW-12 | ChatView tem input + área de mensagens scrollável | US-04 | Must |
| FW-13 | ChatView integra LLMProvider.chat() com gatherContext() | US-04 | Must |
| FW-14 | ChatView renderiza `[[wikilinks]]` como links clicáveis | US-04 | Must |
| FW-15 | LintView detecta órfãos (páginas sem inbound links) | US-05 | Must |
| FW-16 | LintView detecta frontmatter YAML inválido | US-05 | Must |
| FW-17 | LintView verifica index.md desatualizado | US-05 | Should |
| FW-18 | LLM Provider adiciona `/v1` ao endpoint se ausente | — | Should |
| FW-19 | LLM Provider tem timeout + AbortController no fetch | — | Should |

---

## 6. Non-Functional Requirements

| ID | Category | Description | Measurement |
|---|---|---|---|
| NFR-01 | Performance | InboxView carrega em < 1s com 100+ notas | Tempo de render |
| NFR-02 | Performance | ChatView responde em < 5s (LLM depende de rede) | Tempo até primeira resposta |
| NFR-03 | Performance | LintView processa 200+ páginas em < 10s | Tempo de scan |
| NFR-04 | Usability | Todas views funcionam em mobile (touch, scroll) | Teste manual Android |
| NFR-05 | Reliability | ingestFile() não crasha com JSON inválido do LLM | Teste unitário |

---

## 7. Constraints

| ID | Constraint | Type | Impact |
|---|---|---|---|
| C-01 | Obsidian Plugin API (ItemView, Setting, Modal) — sem frameworks UI | Technical | UI implementada com DOM API vanilla |
| C-02 | Mobile WebView Android — sem acesso a Node.js APIs | Technical | Zero polyfills, usar apenas APIs browser |
| C-03 | Bundle deve manter < 50KB | Technical | Evitar dependências pesadas |

---

## 8. Assumptions

| ID | Assumption | Risk if Wrong |
|---|---|---|
| A-01 | Frontmatter YAML é válido nos arquivos do inbox | Erro ao parsear status |
| A-02 | LLM endpoint está configurado e responde JSON válido | ingestFile() falha |
| A-03 | Vault tem estrutura de diretórios (inbox/, raw/, wiki/) | Views mostram vazio |

---

## 9. Out of Scope

- Editor WYSIWYG para notas do inbox (usa Obsidian nativo)
- Colaboração multi-usuário
- Versionamento de páginas wiki além do git
- UI de cross-ingest (será fase separada)

---

## 10. MoSCoW Prioritization

| Priority | Requirements |
|---|---|
| **Must have** | FW-01, FW-05, FW-06, FW-07, FW-08, FW-10, FW-11, FW-12, FW-13, FW-14, FW-15, FW-16 |
| **Should have** | FW-02, FW-03, FW-09, FW-17, FW-18, FW-19 |
| **Could have** | FW-04 |
| **Won't have (now)** | Cross-ingest UI, streaming LLM |

---

## 11. Dependencies

| Dependency | Type | Status |
|---|---|---|
| Settings tab (FW-01) | Internal | Pré-requisito para WikiOps usar paths configuráveis |
| WikiOps approve/reject (FW-05, FW-06) | Internal | Pré-requisito para InboxView |
| WikiOps gatherContext (FW-07) | Internal | Pré-requisito para ChatView |
| LLM Provider | Internal | Já funcional |

---

## 12. Traceability Matrix

| REQ ID | Source | Summary | Phase |
|---|---|---|---|
| FW-01 | US-06 | Settings: paths configuráveis | A |
| FW-02 | US-06 | Settings: maxTokens | A |
| FW-03 | US-06 | Settings: apiKey password | A |
| FW-04 | US-06 | Settings: git condicional | A |
| FW-05 | US-02 | WikiOps.approve() | B |
| FW-06 | US-02 | WikiOps.reject() | B |
| FW-07 | US-04 | WikiOps.gatherContext() | B |
| FW-08 | US-03 | Validação JSON no ingest | B |
| FW-10 | US-01 | InboxView: lista + filtros | C |
| FW-11 | US-02,03 | InboxView: ações | C |
| FW-12 | US-04 | ChatView: UI | D |
| FW-13 | US-04 | ChatView: LLM integration | D |
| FW-14 | US-04 | ChatView: wikilinks | D |
| FW-15 | US-05 | LintView: órfãos | E |
| FW-16 | US-05 | LintView: frontmatter | E |
| FW-18 | — | LLM: /v1 auto | F |
| FW-19 | — | LLM: timeout/abort | F |
