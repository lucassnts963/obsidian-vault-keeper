# Vault Keeper — Especificação Completa

> Obsidian plugin para metodologia completa de gestão de conhecimento pessoal com LLM.
> Versão atual: **0.2.0**

---

## 1. Visão Geral

O Vault Keeper implementa o fluxo completo da metodologia [LLM Wiki de Andrej Karpathy](https://gist.github.com/karpathy/442a6bf555914893e9891c11519de94f):

```
inbox → approve → raw → ingest (LLM) → wiki → query → lint → cross-ingest
```

Além disso, gerencia sincronização Git e serve como interface LLM-agnóstica dentro do Obsidian.

### 1.1 Plataformas

| Ambiente | Status |
|----------|--------|
| Obsidian Desktop (Electron) | ✅ Funcional |
| Obsidian Mobile (Android WebView) | 🟡 Em validação (v0.2.0 reescrito sem isomorphic-git) |
| iOS | ❌ Não testado |

---

## 2. Arquitetura

### 2.1 Stack

| Camada | Tecnologia |
|--------|-----------|
| Plataforma | Obsidian Plugin API |
| UI | Vanilla (ItemView, Setting, Modal, Notice) |
| Linguagem | TypeScript |
| Bundler | esbuild (CJS, target ES2022) |
| Dependências runtime | **yaml** (apenas — 18 KB total) |
| Git Sync | GitHub REST API (`requestUrl()`) + Termux bridge |
| LLM | HTTP fetch para endpoint OpenAI-compatible |
| Hash | SubtleCrypto (SHA-256, nativo do browser) |

### 2.2 Estrutura de Diretórios

```
src/
├── main.ts                   # Plugin entry point (onload/onunload)
├── settings.ts               # Config schema + defaults
├── settings-tab.ts           # Obsidian SettingTab UI
├── github/
│   └── sync.ts               # GitHub REST API sync (push/pull/status)
├── termux/
│   └── sync.ts               # Termux bridge (comandos copia-e-cola)
├── llm/
│   └── provider.ts           # LLM provider factory + prompt templates
├── wiki/
│   ├── ops.ts                # Ingest, write page, update index/log
│   └── log.ts                # Logger append-only
└── views/
    ├── inbox-view.ts         # Inbox panel com filtros de status
    ├── chat-view.ts          # Vault Chat com citações do LLM
    └── lint-view.ts          # Relatório de auditoria
```

### 2.3 Bundle

| Métrica | v0.1.0 (isomorphic-git) | v0.2.0 (GitHub API) |
|---------|------------------------|---------------------|
| Tamanho | 227 KB | **18 KB** |
| Dependências | isomorphic-git, buffer, yaml, pako, crypto | **yaml** |
| Polyfills | Buffer, process, stream | **Nenhum** |
| Build time | ~200ms | **~22ms** |

---

## 3. Módulos

### 3.1 GitHub Sync (`src/github/sync.ts`)

Sincronização de arquivos via GitHub REST API. **Zero dependências de git.**

#### 3.1.1 Endpoints Utilizados

| Operação | Método | Endpoint |
|----------|--------|----------|
| HEAD remoto | GET | `/repos/{owner}/{repo}/git/ref/heads/main` |
| Tree completa | GET | `/repos/{owner}/{repo}/git/trees/{sha}?recursive=1` |
| Conteúdo do arquivo | GET | `/repos/{owner}/{repo}/contents/{path}?ref=main` |
| Criar/atualizar | PUT | `/repos/{owner}/{repo}/contents/{path}` |
| Deletar | DELETE | `/repos/{owner}/{repo}/contents/{path}` |

#### 3.1.2 Algoritmo de Push

```
1. Carrega sync_state.json (cache local de hashes)
2. Varre vault recursivamente (só .md, ignora dot-dirs)
3. Para cada .md:
   - Lê conteúdo binário via adapter.readBinary()
   - Calcula SHA-256 via SubtleCrypto
   - Compara com hash cacheado
   - Se diferente → PUT /contents/:path (base64 + commit message)
4. Detecta deletados (no cache mas não no disco) → DELETE
5. Salva sync_state.json atualizado
```

#### 3.1.3 Algoritmo de Pull

```
1. GET /git/ref/heads/main → remoteSHA
2. Se remoteSHA == lastRemoteSHA → skip
3. GET /git/trees/{remoteSHA}?recursive=1 → lista de {path, sha, type}
4. Filtra só blobs .md
5. Para cada arquivo com SHA diferente do cache:
   - GET /contents/{path}?ref=main
   - Decodifica base64 → escreve no vault
6. Atualiza sync_state.json
```

#### 3.1.4 State Tracking

Arquivo `sync_state.json` na pasta de dados do plugin:

```json
{
  "lastRemoteSHA": "abc123...",
  "files": {
    "inbox/nota.md": { "sha": "def456...", "mtime": 1718234567890 },
    "wiki/pagina.md": { "sha": "ghi789...", "mtime": 1718234567891 }
  }
}
```

### 3.2 Termux Bridge (`src/termux/sync.ts`)

Bridge ultra-simples para usuários com Termux no Android.

#### 3.2.1 Funcionamento

1. Plugin gera comandos git em shell script
2. Copia para clipboard via `navigator.clipboard.writeText()`
3. Mostra em Notice com timeout de 12s
4. Usuário cola no Termux e executa

#### 3.2.2 Comandos Gerados

**Push:**
```bash
cd /storage/emulated/0/Documents/Obsidian/Knowledge
git add *.md inbox/*.md raw/*.md wiki/*.md wiki/**/*.md templates/*.md
git commit -m "vault: sync 2026-06-07 23:59:00" || echo "nada pra commitar"
git push
```

**Pull:**
```bash
cd /storage/emulated/0/Documents/Obsidian/Knowledge
git pull --no-rebase
```

**Sync (pull + push):**
```bash
cd /storage/emulated/0/Documents/Obsidian/Knowledge
git pull --no-rebase
git add *.md inbox/*.md raw/*.md wiki/*.md wiki/**/*.md templates/*.md
git commit -m "vault: sync 2026-06-07 23:59:00" || echo "nada pra commitar"
git push
```

#### 3.2.3 Status

Lê `.git/HEAD` e `.git/refs/heads/main` via `vault.adapter.read()` (fast path, sem API):
```
git: main (abc1234)
```

### 3.3 LLM Provider (`src/llm/provider.ts`)

Interface agnóstica de LLM. Suporta 3 providers:

| Provider | Descrição |
|----------|-----------|
| `http` | OpenAI-compatible (DeepSeek, OpenAI, Groq, etc.) |
| `ollama` | Local via Ollama |
| `hermes-gateway` | Hermes Gateway interno |

#### 3.3.1 API

```typescript
interface LLMProvider {
  chat(messages: Message[], opts?: ChatOptions): Promise<string>
  models?(): Promise<string[]>
}
```

#### 3.3.2 Prompt Templates

- **Ingest:** Sistema + fonte raw → proposta de página wiki
- **Chat:** Sistema + contexto do vault (index + páginas relevantes) + pergunta

### 3.4 Wiki Operations (`src/wiki/ops.ts`)

#### 3.4.1 Operações

| Operação | Descrição |
|----------|-----------|
| `approve(file)` | Move de `inbox/` → `raw/`, atualiza status |
| `ingestFile(file, llm)` | Lê raw → LLM propõe página → cria em `wiki/` |
| `writePage(title, content, tags)` | Cria/atualiza página wiki com frontmatter |
| `updateIndex()` | Atualiza `wiki/index.md` |
| `gatherContext(question)` | Busca páginas relevantes para uma query |

#### 3.4.2 Frontmatter das Páginas Wiki

```yaml
---
title: "Título da Página"
date: 2026-06-07
tags: [tag1, tag2]
category: categoria
---
```

### 3.5 Views

| View | Type ID | Descrição |
|------|---------|-----------|
| `InboxView` | `vault-keeper-inbox` | Lista notas do inbox com filtros (pendente/aprovado/rejeitado) |
| `ChatView` | `vault-keeper-chat` | Chat com LLM que cita páginas do vault |
| `LintView` | `vault-keeper-lint` | Relatório de auditoria (contradições, órfãos, gaps) |

#### 3.5.1 Estado Atual das Views

Todas as views estão como **stubs** — mostram "em desenvolvimento". A UI completa será implementada em versões futuras.

---

## 4. Configurações

### 4.1 Schema

```typescript
interface VaultKeeperSettings {
  llm: {
    provider: 'http' | 'ollama' | 'hermes-gateway'
    endpoint: string        // ex: https://api.deepseek.com/v1
    model: string           // ex: deepseek-chat
    apiKey?: string
    maxTokens?: number      // default: 4096
  }
  git: {
    enabled: boolean
    remote: string          // ex: https://github.com/user/vault
    username: string
    token: string           // GitHub personal access token
    authorName: string
    authorEmail: string
    autoSyncMinutes: number // 0 = desligado
  }
  vaults: {
    knowledge: string
    projects: string[]
  }
  inboxPath: string         // default: 'inbox'
  rawPath: string           // default: 'raw'
  wikiPath: string          // default: 'wiki'
  logPath: string           // default: 'wiki/log.md'
  indexPath: string         // default: 'wiki/index.md'
}
```

### 4.2 Defaults

```typescript
{
  llm: {
    provider: 'http',
    endpoint: 'https://api.deepseek.com/v1',
    model: 'deepseek-chat',
    apiKey: '',
    maxTokens: 4096
  },
  git: {
    enabled: false,
    remote: '',
    username: '',
    token: '',
    authorName: '',
    authorEmail: '',
    autoSyncMinutes: 0
  },
  vaults: { knowledge: '', projects: [] },
  inboxPath: 'inbox',
  rawPath: 'raw',
  wikiPath: 'wiki',
  logPath: 'wiki/log.md',
  indexPath: 'wiki/index.md'
}
```

---

## 5. Comandos Registrados

| ID | Nome | Ação |
|----|------|------|
| `open-inbox` | Abrir inbox | Ativa InboxView |
| `open-chat` | Vault Chat | Ativa ChatView |
| `open-lint` | Auditoria (lint) | Ativa LintView |
| `git-sync` | Sincronizar (GitHub API) | Pull → Push via GitHub REST API |
| `git-status` | Status do sync | Mostra branch + SHA + alterações |
| `termux-sync` | Termux: sync (pull+push) | Copia comando pro clipboard |
| `termux-push` | Termux: push | Copia comando pro clipboard |
| `termux-pull` | Termux: pull | Copia comando pro clipboard |
| `ingest-current` | Ingest: arquivo atual | LLM processa e cria página wiki |

---

## 6. Ícones Ribbon

| Ícone | Ação |
|-------|------|
| `inbox` | Abre InboxView |
| `message-square` | Abre ChatView |
| `vault-keeper-sync` | Executa GitHub sync (só aparece se git habilitado) |

---

## 7. Status Bar

Mostra o estado do git no canto inferior:

| Estado | Exemplo |
|--------|---------|
| Normal | `git: main (abc1234)` |
| Sem git | _(vazio)_ |
| Erro | _(vazio)_ |

---

## 8. Auto-Sync

Timer configurável (`autoSyncMinutes`). Executa `doSync()` periodicamente:
1. Pull (GitHub API)
2. Push (GitHub API)
3. Atualiza status bar

---

## 9. Fluxo de Dados

### 9.1 Inbox → Wiki

```
Usuário escreve nota no inbox/
  → InboxView lista notas com filtros
  → Usuário aprova → move para raw/, status: raw
  → Usuário faz ingest → LLMProvider.chat()
  → LLM propõe página wiki → confirmação
  → WikiOps.writePage() → wiki/nova-pagina.md
  → WikiOps.updateIndex() → wiki/index.md atualizado
  → Logger.append() → wiki/log.md atualizado
```

### 9.2 Sync (GitHub API)

```
Usuário clica Sync ou auto-sync dispara
  → GitHubSync.pull()
    → GET /git/ref/heads/main → SHA remoto
    → GET /git/trees/{sha}?recursive=1 → árvore
    → Compara com sync_state.json
    → GET /contents/{path} → baixa arquivos alterados
    → Escreve no vault
  → GitHubSync.push()
    → Varre vault por .md
    → SHA-256 de cada arquivo
    → Compara com sync_state.json
    → PUT /contents/{path} → envia alterados
    → DELETE /contents/{path} → remove deletados
    → Atualiza sync_state.json
```

### 9.3 Sync (Termux)

```
Usuário dispara Termux: sync
  → TermuxSync.sync()
  → Gera script shell
  → navigator.clipboard.writeText(script)
  → Notice mostra comando
  → Usuário cola no Termux e executa
```

---

## 10. Segurança

### 10.1 Token GitHub

- Armazenado em `data.json` do plugin (Obsidian criptografa? Não — texto plano)
- Transmitido via header `Authorization: token {token}`
- Usado apenas em chamadas `requestUrl()` do Obsidian
- **Recomendação:** Usar token fine-grained com escopo mínimo (`contents: read/write`)

### 10.2 API Key LLM

- Armazenada em `data.json` (texto plano)
- Transmitida via header `Authorization: Bearer {key}`
- Suporta endpoints locais (Ollama, Hermes Gateway) sem autenticação

---

## 11. Histórico de Problemas Resolvidos

| # | Problema | Causa | Solução |
|---|----------|-------|---------|
| 1 | CSP bloqueia fetch() no mobile | WebView Android | `requestUrl()` nativo do Obsidian |
| 2 | `R.isDirectory is not a function` | stat() sem métodos | Implementar `isFile()`, `isDirectory()`, `isSymbolicLink()` |
| 3 | `ENOENT .git/index` | MobileGitFs desnecessário | `adapter.readBinary()` funciona pra `.git/` |
| 4 | Timeout 30s no status | statusMatrix em 500+ arquivos | `listFiles()` → `statusMatrix({filepaths})` |
| 5 | `Buffer is not defined` | isomorphic-git usa Node.js API | Abandonado — reescrita sem isomorphic-git |

---

## 12. Estado Atual (v0.2.0)

### 12.1 Funcional

- ✅ GitHub REST API sync (push/pull/status)
- ✅ Termux bridge (comandos copia-e-cola)
- ✅ Status bar com branch + SHA
- ✅ LLM provider agnóstico (HTTP, Ollama, Hermes)
- ✅ Wiki operations (inbox→raw→wiki)
- ✅ Settings UI completo
- ✅ Build: 18 KB, 22ms

### 12.2 Stubs (UI pendente)

- 🟡 InboxView — placeholder "em desenvolvimento"
- 🟡 ChatView — placeholder "em desenvolvimento"
- 🟡 LintView — placeholder "em desenvolvimento"

### 12.3 Pendente

- 🔴 iOS — nunca testado
- 🔴 Cross-ingest — lógica implementada, UI pendente
- 🔴 Conflito de merge — GitHub API sync sobrescreve (sem merge)
- 🔴 Testes automatizados — removidos junto com isomorphic-git

---

## 13. Roadmap Sugerido

| Versão | Features |
|--------|----------|
| **0.2.1** | Validar GitHub sync no mobile, corrigir bugs |
| **0.3.0** | InboxView funcional (listar, filtrar, aprovar/rejeitar) |
| **0.4.0** | ChatView funcional (chat com contexto do vault) |
| **0.5.0** | LintView funcional (auditoria de contradições/órfãos) |
| **1.0.0** | Todas as views completas, cross-ingest, testes |

---

## 14. Repositório

**GitHub:** [`lucassnts963/obsidian-vault-keeper`](https://github.com/lucassnts963/obsidian-vault-keeper)

```
git clone https://github.com/lucassnts963/obsidian-vault-keeper.git
cd obsidian-vault-keeper
npm install
npm run build
# Copiar main.js + manifest.json para .obsidian/plugins/vault-keeper/
```
