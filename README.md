# Vault Keeper — Plugin Obsidian

Plugin para **gestão completa de conhecimento** seguindo a metodologia LLM Wiki (Karpathy adaptado).

Delega inteligência a um CLI externo instalado e cai de volta para LLM interno quando nenhum CLI é detectado.

## Status

✅ **Beta funcional** — 238 testes passando. Scaffold completo, wizard de onboarding, CLI bridge, BM25 search, monitor automático, multi-repo sync, build de produção OK (96 KB).

**CLI testado:** OpenCode ✅ — Claude Code, Gemini CLI, Antigravity e Custom estão implementados mas ainda não foram testados em produção.

---

## Funcionalidades

| Fase | Ícone | O que faz |
|------|-------|-----------|
| **Onboarding** | 🚀 | Wizard de primeira execução: "Começar do zero" ou "Migrar vault existente" — cria estrutura, gera CLAUDE.md / GEMINI.md / AGENTS.md automaticamente |
| **CLI Bridge** | 🤖 | Detecta CLIs instalados. Desktop: spawna e transmite saída linha a linha (com botão ⏹ Parar). Mobile: copia comando para clipboard. **Testado:** OpenCode ✅ |
| **Inbox** | 📥 | Painel com filtro por status. Aprovar/rejeitar com botões |
| **Approve** | ✅ | Move fonte pra `raw/`, seta `status: approved`, registra no log |
| **Ingest** | 🧠 | LLM/CLI lê a fonte → propõe página wiki com citações + frontmatter rico (`title`, `summary`, `key_entities`, `tags`) |
| **BM25 Search** | 🔎 | Índice full-text local em `.vault-keeper/bm25-index.json`. Reindexação automática (debounced 2s) ao salvar arquivos em `wiki/` |
| **Query** | 💬 | Chat sobre o vault. BM25 ranqueia contexto → LLM/CLI responde com `[[wiki/links]]` |
| **Lint** | 🔍 | Auditoria: páginas sem frontmatter, entries faltando no index |
| **Slots** | 📌 | Estado vivo de sessão em `_slots/` (foco atual, relatório de lint) |
| **Git Sync** | 🔄 | Push/pull/clone via **GitHub REST API** (fetch puro, funciona no mobile sem shell). Multi-repo: cada subpasta de projeto sincroniza com seu próprio repositório. Estratégias de conflito: `ask` / `keep-local` / `keep-remote` |

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
  │                        ├─ streama stdout → bolhas de chat
  │                        └─ botão ⏹ Parar (SIGTERM → SIGKILL)
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
├── inbox/            ← conteúdo novo (status: inbox)
├── raw/              ← fontes aprovadas (status: approved)
├── wiki/             ← páginas de conhecimento
│   ├── index.md      ← tabela mestre
│   └── log.md        ← log de atividade
├── _slots/           ← estado vivo da sessão
│   └── focus.md
├── projects/         ← projetos com repos próprios (opcional)
│   ├── alpha/        ← sincroniza com github.com/user/alpha
│   └── beta/         ← sincroniza com github.com/user/beta
└── .vault-keeper/
    └── bm25-index.json
```

---

## Instalação

### Opção 1 — Script automático (recomendado)

```bash
git clone https://github.com/lucassnts963/obsidian-vault-keeper.git
cd obsidian-vault-keeper
npm install

# Build + zip de distribuição
npm run zip

# Build + instalar direto no vault (desktop)
bash scripts/install.sh --vault /caminho/para/seu/vault

# Build + enviar para Android via adb
bash scripts/install.sh --android

# Ambos ao mesmo tempo
bash scripts/install.sh --vault ~/vault --android --adb-vault /sdcard/obsidian/knowledge
```

### Opção 2 — Manual

```bash
git clone https://github.com/lucassnts963/obsidian-vault-keeper.git
cd obsidian-vault-keeper
npm install
npm run build
# Copiar main.js e manifest.json para .obsidian/plugins/vault-keeper/ no seu vault
```

### Opções do instalador

```
--vault <path>      Instala em <path>/.obsidian/plugins/vault-keeper/
--android           Envia via adb (requer Android com depuração USB ativa)
--adb-vault <path>  Caminho do vault no Android (padrão: /sdcard/Documents/obsidian/knowledge)
--no-build          Usa main.js existente (pula build e testes)
--skip-tests        Pula a suite de testes antes do build
```

## Configuração

1. **CLI** (recomendado): instale **OpenCode** (✅ testado) ou outro CLI compatível — o plugin detecta automaticamente
2. **LLM** (fallback): endpoint + modelo + API key
3. **Git Sync**: remote URL + token GitHub. Estratégia de conflito: `ask` (backup + sobrescrever), `keep-local`, `keep-remote`
4. **Projetos**: em Settings → Git Sync → Projetos, adicione subpastas do vault mapeadas para repos GitHub próprios. Cada projeto pode ser aberto como vault standalone no Obsidian

Na primeira execução, o **wizard de onboarding** cria a estrutura e gera os arquivos de instrução para o CLI detectado.

---

## Multi-repo Sync

Cada subpasta de projeto sincroniza com seu próprio repositório GitHub:

```
Settings → Git Sync → Projetos → + Adicionar projeto
  Nome:   alpha
  Caminho: projects/alpha       ← relativo ao vault
  Remote: https://github.com/user/alpha
  Token:  ghp_... (opcional — usa o token principal se vazio)
```

- **Push** do vault raiz: repo principal recebe os arquivos fora de `projects/`; cada projeto envia seus arquivos para o repo configurado
- **Pull**: todos os repos são puxados; arquivos de cada projeto chegam na subpasta correta
- **Paths no GitHub**: `projects/alpha/wiki/page.md` é armazenado no repo do projeto como `wiki/page.md` — compatível com abertura standalone

---

## Arquitetura

```
src/
├── main.ts              # Entry point — registra views, commands, multi-repo sync, monitor
├── settings.ts          # LLMSettings + GitSettings + CLISettings + ProjectVault
├── settings-tab.ts      # Painel de configuração (CLI, LLM, Agent, Git, Projetos)
│
├── agents/
│   ├── cli-bridge.ts    # Detecção, geração de CLAUDE.md/GEMINI.md/AGENTS.md, spawn + abort
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
│   ├── sync.ts          # GitHubSync: push/pull/clone/status, rootDir (multi-repo), excludeRoots
│   ├── base64.ts        # Base64 chunked encode/decode (sem atob/btoa)
│   └── clone-modal.ts   # Modal de clonagem de repositório remoto
│
├── diagnostics/
│   └── probe.ts         # Diagnóstico de adapter (walk, stat, contagem de arquivos)
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
├── views/
│   ├── onboarding-view.ts  # Wizard primeira execução
│   ├── chat-view.ts        # CLI Task Panel + Vault Chat + botão ⏹ Parar
│   ├── inbox-view.ts       # Painel inbox com filtros
│   └── lint-view.ts        # Relatório de auditoria
│
└── scripts/
    └── install.sh       # Build + zip + deploy (desktop e Android via adb)
```

## Stack

- **Obsidian API** — views, commands, ribbon, settings
- **GitHub REST API** — Git push/pull/clone via fetch puro (funciona no mobile sem shell)
- **Fetch API** — LLM provider agnóstico (qualquer endpoint `/v1/chat/completions`)
- **BM25 interno** — full-text search sem dependência extra (write queue para upserts concorrentes)
- **esbuild** — bundle rápido (96 KB produção)
- **vitest + happy-dom** — 238 testes, TDD obrigatório

---

## Roadmap

| Feature | Descrição |
|---------|-----------|
| **iOS** | Nunca testado — comportamento do adapter desconhecido |
| **Conflict Modal** | UI interativa para `conflictStrategy: 'ask'` (hoje faz backup silencioso + sobrescreve) |
| **YAML robusto** | Parser baseado no pacote `yaml` já presente no projeto |
| **Rules Engine** | Detecção de padrões repetidos no log → sugerir regra |
