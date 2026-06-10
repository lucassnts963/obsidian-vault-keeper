# Vault Keeper — Plugin Obsidian

Plugin para **gestão completa de conhecimento** seguindo a metodologia LLM Wiki (Karpathy adaptado).

Delega inteligência a um CLI externo instalado e cai de volta para LLM interno quando nenhum CLI é detectado.

## Status

✅ **Beta funcional** — 221 testes passando, 28 arquivos de teste. Scaffold completo, wizard de onboarding, CLI bridge, BM25 search, monitor automático, build de produção OK (84 KB).

**CLI testado:** OpenCode ✅ — Claude Code, Gemini CLI, Antigravity e Custom estão implementados mas ainda não foram testados em produção.

---

## Funcionalidades

| Fase | Ícone | O que faz |
|------|-------|-----------|
| **Onboarding** | 🚀 | Wizard de primeira execução: "Começar do zero" ou "Migrar vault existente" — cria estrutura, gera CLAUDE.md / GEMINI.md / AGENTS.md automaticamente |
| **CLI Bridge** | 🤖 | Detecta CLIs instalados. Desktop: spawna e transmite saída linha a linha. Mobile: copia comando para clipboard. **Testado:** OpenCode ✅ — demais CLIs implementados, não testados |
| **Inbox** | 📥 | Painel com filtro por status. Aprovar/rejeitar com botões |
| **Approve** | ✅ | Move fonte pra `raw/`, seta `status: approved`, registra no log |
| **Ingest** | 🧠 | LLM/CLI lê a fonte → propõe página wiki com citações + frontmatter rico (`title`, `summary`, `key_entities`, `tags`) |
| **BM25 Search** | 🔎 | Índice full-text local em `.vault-keeper/bm25-index.json`. Reindexação automática (debounced 2s) ao salvar arquivos em `wiki/` |
| **Query** | 💬 | Chat sobre o vault. BM25 ranqueia contexto → LLM/CLI responde com `[[wiki/links]]` |
| **Lint** | 🔍 | Auditoria: páginas sem frontmatter, entries faltando no index |
| **Slots** | 📌 | Estado vivo de sessão em `_slots/` (foco atual, relatório de lint) |
| **Git Sync** | 🔄 | Push/pull via **GitHub REST API** (fetch puro, funciona no mobile sem shell). Estratégias de conflito: `ask` / `keep-local` / `keep-remote`. Suporte a syncOnOpen/syncOnClose |

---

## Idioma / Language

O plugin entende **português e inglês**. Prompts do agente, instruções de CLI e detecção de intenção no chat aceitam perguntas e comandos em ambos os idiomas.

The plugin understands **Portuguese and English**. Agent prompts, CLI instructions, and chat intent detection accept queries in both languages.

---

## Modo de operação

```
ChatView detecta CLI instalado?
  │
  ├─ SIM (desktop) ──→ spawna CLI (opencode ✅ / outros não testados)
  │                        └─ streama stdout → bolhas de chat
  │
  ├─ SIM (mobile)  ──→ copia comando para clipboard
  │
  └─ NÃO ──────────→ VaultAgent interno (LLM via HTTP)
                          └─ bm25_search → read_file → answer
```

---

## LLM — Agnóstico a modelo

O usuário escolhe o provider (interno — usado quando não há CLI):

```
Provider: [HTTP API] [Ollama (local)]
Endpoint: https://api.deepseek.com/v1
Model:    deepseek-chat
```

| Plataforma | CLI Bridge | LLM Interno |
|------------|------------|-------------|
| **Desktop (Electron)** | ✅ Spawna CLI | ✅ HTTP ou Ollama |
| **Mobile (Android/iOS)** | ✅ Copia comando | ✅ HTTP apenas |

---

## Metodologia (Fluxo Completo)

```
inbox/*.md  ──aprovar──▶  raw/*.md  ──ingest──▶  wiki/*.md
(status: inbox)        (status: approved)      (status: ingested)
                                                      │
                                              bm25-index.json
                                                      │
                                           query ◀────┘────▶ lint

_slots/focus.md  ──▶  contexto de sessão injetado em toda query
```

1. Conteúdo chega no `inbox/` (notas do celular, Google Keep, blog posts, etc.)
2. Você revisa no painel Inbox → aprova (`status: approved`, move pra `raw/`) ou rejeita (`status: rejected`, fica no inbox)
3. **Ingest**: LLM/CLI lê a fonte, propõe página wiki com citações fiéis (FAITHFULNESS)
4. Página criada em `wiki/`, `index.md` e `bm25-index.json` atualizados automaticamente
5. **Query**: pergunta sobre o vault → BM25 ranqueia contexto → LLM/CLI responde com links
6. **Lint**: auditoria periódica detecta problemas
7. **Slots**: `_slots/focus.md` mantém contexto de sessão ativo

### Estrutura do vault após setup

```
<vault>/
├── inbox/          ← conteúdo novo (status: inbox)
├── raw/            ← fontes aprovadas (status: approved)
├── wiki/           ← páginas de conhecimento
│   ├── index.md    ← tabela mestre
│   └── log.md      ← log de atividade
├── _slots/         ← estado vivo da sessão
│   └── focus.md
└── .vault-keeper/
    └── bm25-index.json
```

---

## Instalação

```bash
git clone https://github.com/lucassnts963/obsidian-vault-keeper.git
cd obsidian-vault-keeper
npm install
npm run build
```

Copiar `main.js` e `manifest.json` para `.obsidian/plugins/vault-keeper/` no seu vault.

## Configuração

1. **CLI** (recomendado): instale **OpenCode** (✅ testado) ou outro CLI compatível — o plugin detecta automaticamente e salva a preferência. Claude Code, Gemini CLI e Antigravity estão implementados mas ainda não foram testados
2. **LLM** (fallback): endpoint + modelo + API key
3. **Git Sync**: remote URL + token GitHub. Estratégia de conflito: `ask` (backup + sobrescrever), `keep-local` (não sobrescreve modificações locais), `keep-remote` (sobrescreve sempre)
4. **Vaults**: paths dos vaults de projeto (reservado para cross-ingest)

Na primeira execução, o **wizard de onboarding** cria a estrutura e gera os arquivos de instrução para o CLI detectado.

---

## Arquitetura

```
src/
├── main.ts              # Entry point — registra views, commands, monitor, onboarding
├── settings.ts          # LLMSettings + GitSettings + CLISettings
├── settings-tab.ts      # Painel de configuração (CLI, LLM, Agent, Git avançado)
│
├── agents/
│   ├── cli-bridge.ts    # Detecção de CLI, geração de CLAUDE.md/GEMINI.md/AGENTS.md, spawn
│   └── monitor.ts       # Watch wiki/ → reindexação BM25 debounced (2s)
│
├── scaffold/
│   ├── installer.ts     # Primeira execução: cria dirs/arquivos, migra vault existente
│   └── templates.ts     # Estrutura padrão de dirs e arquivos seed
│
├── chat/
│   ├── agent.ts         # VaultAgent: loop de tools com histórico de conversa
│   ├── prompts.ts       # System prompts bilíngues com regras FAITHFULNESS
│   └── tools.ts         # bm25_search, read_file, write_page, approve, lint, …
│
├── github/
│   └── sync.ts          # GitHub REST API: push/pull/status/conflitos
│
├── llm/
│   └── provider.ts      # Factory agnóstica (OpenAI-compatible) com null-safety
│
├── search/
│   ├── bm25.ts          # Okapi BM25
│   ├── index-builder.ts # WikiSearchIndex
│   └── index-persistence.ts  # .vault-keeper/bm25-index.json (com write queue)
│
├── slots/
│   └── manager.ts       # SlotsManager (_slots/ session state)
│
├── wiki/
│   ├── ops.ts           # Ingest, approve, reject, gatherContext, writePage
│   └── log.ts           # Log append-only (path configurável)
│
└── views/
    ├── onboarding-view.ts  # Wizard primeira execução
    ├── chat-view.ts        # CLI Task Panel + Vault Chat (fallback)
    ├── inbox-view.ts       # Painel inbox com filtros
    └── lint-view.ts        # Relatório de auditoria
```

## Stack

- **Obsidian API** — views, commands, ribbon, settings
- **GitHub REST API** — Git push/pull via fetch puro (funciona no mobile sem shell)
- **Fetch API** — LLM provider agnóstico (qualquer endpoint `/v1/chat/completions`)
- **BM25 interno** — full-text search sem dependência extra (write queue para upserts concorrentes)
- **esbuild** — bundle rápido (76 KB produção)
- **vitest + happy-dom** — 221 testes, TDD obrigatório

---

## Roadmap

| Feature | Descrição |
|---------|-----------|
| **Cross-Ingest** | Promover conteúdo entre vaults com links bidirecionais (campo `vaults.projects` já reservado nas settings) |
| **Rules Engine** | Detecção de padrões repetidos no log → sugerir regra |
| **Conflict Modal** | UI interativa para `conflictStrategy: 'ask'` (hoje faz backup silencioso + sobrescreve) |
| **YAML robusto** | Parser baseado no pacote `yaml` já presente no projeto |
