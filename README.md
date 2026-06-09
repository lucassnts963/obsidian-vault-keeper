# Vault Keeper — Plugin Obsidian

Plugin para **gestão completa de conhecimento** seguindo a metodologia LLM Wiki (Karpathy adaptado).

Delega inteligência a um CLI externo instalado (Claude Code, OpenCode, Gemini CLI) e cai de volta para LLM interno quando nenhum CLI é detectado.

## Status

✅ **Funcional** — 209 testes passando, 27 arquivos de teste. Scaffold completo, wizard de onboarding, CLI bridge, BM25 search, monitor automático.

---

## Funcionalidades

| Fase | Ícone | O que faz |
|------|-------|-----------|
| **Onboarding** | 🚀 | Wizard de primeira execução: "Começar do zero" ou "Migrar vault existente" — cria estrutura, gera CLAUDE.md / GEMINI.md / AGENTS.md automaticamente |
| **CLI Bridge** | 🤖 | Detecta Claude Code / OpenCode / Gemini CLI instalados. No desktop: spawna e transmite saída linha a linha. No mobile: copia comando para clipboard |
| **Inbox** | 📥 | Painel com filtro por status. Aprovar/rejeitar com botões |
| **Approve** | ✅ | Move fonte pra `raw/`, seta `status: raw`, registra no log |
| **Ingest** | 🧠 | LLM/CLI lê a fonte → propõe página wiki com citações + frontmatter rico (`title`, `summary`, `key_entities`, `tags`) |
| **BM25 Search** | 🔎 | Índice full-text local em `.vault-keeper/bm25-index.json`. Reindexação automática ao salvar arquivos em `wiki/` |
| **Query** | 💬 | Chat sobre o vault. BM25 ranqueia contexto → LLM/CLI responde com `[[wiki/links]]` |
| **Lint** | 🔍 | Auditoria: páginas órfãs, frontmatter faltando, index desatualizado |
| **Slots** | 📌 | Estado vivo de sessão em `_slots/` (foco atual, relatório de lint) |
| **Git Sync** | 🔄 | Push/pull via **isomorphic-git** (JS puro, sem shell). Estratégias de conflito: `ours` / `theirs` / `manual`. Auto-sync ao abrir/fechar vault |

---

## Modo de operação

```
ChatView detecta CLI instalado?
  │
  ├─ SIM (desktop) ──→ spawna claude/opencode/gemini
  │                        └─ streama stdout → bolhas de chat
  │
  ├─ SIM (mobile)  ──→ copia comando para clipboard
  │
  └─ NÃO ──────────→ VaultAgent interno (LLM via HTTP)
                          └─ bm25_search → read_file → answer
```

---

## LLM — Agnóstico a modelo

O usuário escolhe o provider (interno):

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
                                                      │
                                              bm25-index.json
                                                      │
                                           query ◀────┘────▶ lint

_slots/focus.md  ──▶  contexto de sessão injetado em toda query
```

1. Conteúdo chega no `inbox/` (notas do celular, Google Keep, blog posts, etc.)
2. Você revisa no painel Inbox → aprova (move pra `raw/`) ou rejeita
3. **Ingest**: LLM/CLI lê a fonte, propõe página wiki com citações fiéis (FAITHFULNESS)
4. Página criada em `wiki/`, `index.md` e `bm25-index.json` atualizados automaticamente
5. **Query**: pergunta sobre o vault → BM25 ranqueia contexto → LLM/CLI responde com links
6. **Lint**: auditoria periódica detecta problemas
7. **Slots**: `_slots/focus.md` mantém contexto de sessão ativo

### Estrutura do vault após setup

```
<vault>/
├── inbox/          ← conteúdo novo (status: inbox)
├── raw/            ← fontes aprovadas (status: raw)
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

1. **CLI** (recomendado): instale Claude Code (`npm i -g @anthropic-ai/claude-code`), OpenCode ou Gemini CLI — o plugin detecta automaticamente
2. **LLM** (fallback): endpoint + modelo + API key
3. **Git**: remote URL + token GitHub (opcional, para sync)
4. **Vaults**: paths dos vaults de projeto (para cross-ingest)

Na primeira execução, o **wizard de onboarding** cria a estrutura e gera os arquivos de instrução para o CLI detectado.

---

## Arquitetura

```
src/
├── main.ts              # Entry point — registra views, commands, monitor, onboarding
├── settings.ts          # LLMSettings + GitSettings + CLISettings
├── settings-tab.ts      # Painel de configuração
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
│   ├── agent.ts         # VaultAgent: loop de tools
│   ├── prompts.ts       # System prompts com regras FAITHFULNESS
│   └── tools.ts         # bm25_search, read_file, write_page, approve, lint, …
│
├── github/
│   └── sync.ts          # isomorphic-git: push/pull/status/conflitos
│
├── llm/
│   └── provider.ts      # Factory agnóstica (OpenAI-compatible)
│
├── search/
│   ├── bm25.ts          # Okapi BM25
│   ├── index-builder.ts # WikiSearchIndex
│   └── index-persistence.ts  # .vault-keeper/bm25-index.json
│
├── slots/
│   └── manager.ts       # SlotsManager (_slots/ session state)
│
├── wiki/
│   ├── ops.ts           # Ingest, approve, reject, gatherContext, writePage
│   └── log.ts           # Log append-only
│
└── views/
    ├── onboarding-view.ts  # Wizard primeira execução
    ├── chat-view.ts        # CLI Task Panel + Vault Chat (fallback)
    ├── inbox-view.ts       # Painel inbox com filtros
    ├── lint-view.ts        # Relatório de auditoria
    ├── markdown.ts         # Renderer markdown
    └── ui.ts               # Helpers de UI
```

## Stack

- **Obsidian API** — views, commands, ribbon, settings
- **isomorphic-git** — Git puro em JS (funciona no mobile sem shell)
- **Fetch API** — LLM provider agnóstico (qualquer endpoint `/v1/chat/completions`)
- **BM25 interno** — full-text search sem dependência extra
- **esbuild** — bundle rápido
- **vitest + happy-dom** — 209 testes, TDD obrigatório
