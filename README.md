# Vault Keeper — Plugin Obsidian

Plugin para **gestão completa de conhecimento** seguindo a metodologia LLM Wiki (Karpathy adaptado).

## Funcionalidades

| Fase | Ícone | O que faz |
|------|-------|-----------|
| **Inbox** | 📥 | Painel com filtro por status. Arrasta pra aprovar/rejeitar |
| **Approve** | ✅ | Move fonte pra `raw/`, seta `status: raw`, registra no log |
| **Ingest** | 🧠 | LLM lê a fonte → propõe página wiki com citações → você aprova/edita |
| **Query** | 💬 | Chat com LLM sobre o vault. Respostas com citações [[wiki/pagina]] |
| **Lint** | 🔍 | Auditoria: contradições, órfãos, frontmatter, index desatualizado |
| **Cross-Ingest** | 🔗 | Promove conteúdo entre vaults com link bidirecional |
| **Slots** | 📌 | Estado vivo: foco atual, pendências |
| **Rules** | 📐 | "Isso já aconteceu 3x" → sugere virar regra |
| **Git Sync** | 🔄 | Push/pull via **isomorphic-git** (JS puro, sem shell, sem bugs) |

## LLM — Agnóstico a modelo

O usuário escolhe o provider:

```
Provider: [HTTP API] [Ollama (local)] [Hermes Gateway]
Endpoint: http://localhost:11434/v1
Model: deepseek-chat
```

### LLM Local — Análise

| Plataforma | Viabilidade | Solução |
|------------|-------------|---------|
| **Desktop (Electron)** | ✅ Viável | OllamaProvider — conecta em `localhost:11434` |
| **Mobile (Android)** | ❌ Inviável hoje | WebView sem WebGPU, bateria, RAM, aquecimento |
| **Mobile (iOS)** | ❌ Inviável | Mesmas limitações + sandbox mais restritivo |

**Estratégia:**
- **MVP:** HTTP Provider (DeepSeek, OpenAI, Groq, etc.) + Ollama (desktop)
- **Futuro:** WebLLM Provider quando WebGPU chegar no Android WebView

No mobile, o HTTP Provider apontando pra API da DeepSeek ou Hermes Gateway no servidor é a solução prática — latência baixa, qualidade alta, sem drenar bateria.

## Metodologia (Fluxo Completo)

```
inbox ──→ raw ──→ wiki
  │         │        │
  │    ┌────┘        └────┐
  ▼    ▼                  ▼
rejected  INGEST        QUERY / LINT
          (LLM lê,      (perguntas,
           propõe        auditoria)
           página)
```

1. Conteúdo chega no `inbox/` (notas do celular, Google Keep, blog posts, etc.)
2. Você revisa no painel Inbox → aprova (move pra `raw/`) ou rejeita
3. **Ingest**: LLM lê a fonte, propõe página wiki com citações fiéis (FAITHFULNESS)
4. Página criada em `wiki/`, `index.md` e `log.md` atualizados automaticamente
5. **Query**: pergunta sobre o vault → LLM responde com links
6. **Lint**: auditoria periódica detecta problemas

## Instalação

```bash
git clone https://github.com/lucassnts963/obsidian-vault-keeper.git
cd obsidian-vault-keeper
npm install
npm run build
```

Copiar `main.js` e `manifest.json` para `.obsidian/plugins/vault-keeper/` no seu vault.

## Configuração

1. **LLM**: endpoint + modelo + API key (opcional)
2. **Git**: remote URL + token GitHub (opcional, para sync)
3. **Vaults**: paths dos vaults de projeto (para cross-ingest)

## Arquitetura

```
src/
├── main.ts              # Entry point
├── settings.ts          # Config schema
├── settings-tab.ts      # Painel de configuração
├── git/
│   └── sync.ts          # isomorphic-git: push/pull/status
├── llm/
│   └── provider.ts      # Factory agnóstica + prompt templates
├── wiki/
│   ├── ops.ts           # Ingest, write page, update index/log
│   └── log.ts           # Logger append-only
└── views/
    ├── inbox-view.ts    # Painel inbox com filtros
    ├── chat-view.ts     # Chat lateral com citações
    └── lint-view.ts     # Relatório de auditoria
```

## Stack

- **Obsidian API** — views, commands, ribbon, settings
- **isomorphic-git** — Git puro em JS (substitui plugin oficial bugado)
- **Fetch API** — LLM provider agnóstico (qualquer endpoint `/v1/chat/completions`)
- **esbuild** — bundle rápido

## Status

🟡 Em desenvolvimento — scaffold pronto. Views e lógica de negócio em implementação.
