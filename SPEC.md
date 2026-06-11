# Vault Keeper — Especificação Completa

> Obsidian plugin para metodologia completa de gestão de conhecimento pessoal com LLM.
> Versão atual: **0.3.0**

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
| Obsidian Mobile (Android WebView) | ✅ Funcional (v0.2.0 com correções mobile) |
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
| Hash | SubtleCrypto (SHA-256, nativo do browser) + fallback JS puro |
| Testes | Vitest (238 testes) |

### 2.2 Estrutura de Diretórios

```
src/
├── main.ts                   # Plugin entry point — registra views, commands, initSyncs()
├── settings.ts               # Config schema + defaults (inclui ProjectVault)
├── settings-tab.ts           # Obsidian SettingTab UI (inclui seção Projetos)
├── github/
│   ├── sync.ts               # GitHubSync: push/pull/clone/status, rootDir + excludeRoots
│   ├── base64.ts             # Base64 chunked encode/decode (sem atob/btoa)
│   └── clone-modal.ts        # Modal de clonagem de repositório remoto
├── diagnostics/
│   └── probe.ts              # Diagnóstico de adapter (walk, stat, contagem)
├── termux/
│   └── sync.ts               # Termux bridge (comandos copia-e-cola)
├── llm/
│   └── provider.ts           # LLM provider factory + prompt templates
├── wiki/
│   ├── ops.ts                # Ingest, write page, update index/log
│   └── log.ts                # Logger append-only
├── agents/
│   ├── cli-bridge.ts         # Detecção CLI, spawn com abort() (SIGTERM→SIGKILL)
│   └── monitor.ts            # Watch wiki/ → reindexação BM25 debounced
├── search/
│   ├── bm25.ts               # Okapi BM25 puro TypeScript
│   ├── index-builder.ts      # WikiSearchIndex
│   └── index-persistence.ts  # .vault-keeper/bm25-index.json com write queue
├── views/
│   ├── onboarding-view.ts    # Wizard primeira execução
│   ├── chat-view.ts          # CLI Task Panel + Vault Chat + botão ⏹ Parar
│   ├── inbox-view.ts         # Inbox panel com filtros de status
│   └── lint-view.ts          # Relatório de auditoria
├── scripts/
│   └── install.sh            # Build + zip + deploy (desktop e Android via adb)
└── __tests__/
    └── github-sync.test.ts   # 238 testes unitários
```

### 2.3 Bundle

| Métrica | v0.1.0 (isomorphic-git) | v0.2.0 (GitHub API) | v0.3.0 |
|---------|------------------------|---------------------|--------|
| Tamanho | 227 KB | 26 KB | **96 KB** |
| Dependências | isomorphic-git, buffer, yaml, pako, crypto | yaml | **yaml** |
| Polyfills | Buffer, process, stream | Nenhum | **Nenhum** |
| Testes | 0 | 35 | **238 (vitest)** |

> Crescimento de 26→96 KB deve-se ao BM25, scaffold, views completas e CLI bridge — todas features novas sem dependências externas.

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

#### 3.1.2 Construtor e Multi-repo

```typescript
new GitHubSync(vault, settings, pluginDataDir, rootDir?, excludeRoots?)
```

| Parâmetro | Tipo | Descrição |
|-----------|------|-----------|
| `rootDir` | `string` (default `''`) | Subpasta do vault scoped a este sync (ex: `'projects/alpha'`). Paths enviados ao GitHub são relativos a `rootDir`. |
| `excludeRoots` | `string[]` (default `[]`) | Subpastas a ignorar no walk — usado pelo main sync para pular subpastas de projeto. |

O state file recebe sufixo único por projeto: `sync_state_projects_alpha.json`.

#### 3.1.3 API do `GitHubSync`

| Método | Descrição |
|--------|-----------|
| `push(onPhase?)` | Varre vault (respeitando rootDir/excludeRoots) → envia `.md` alterados/deletados |
| `pull(onPhase?)` | Compara remote SHA → baixa arquivos alterados, escreve em `rootDir/` |
| `clone(onPhase?)` | Baixa todos os `.md` do repo remoto, cria diretórios, salva SHA-256 + gitSha no state |
| `status()` | Varre vault local + compara SHA remoto → relatório completo |
| `quickStatus()` | Apenas GET `/git/ref/heads/main` → compara SHA (sem I/O local) |
| `pushFile(vaultPath)` | Push de arquivo único; strip do prefixo rootDir para o path no GitHub |
| `ownsFile(vaultPath)` | Retorna true se este sync é responsável pelo arquivo (usado para roteamento) |
| `backupState()` | Salva `sync_state.json` em `.backup` antes de push |
| `restoreBackup()` | Restaura state do backup + limpa arquivo de backup |

#### 3.1.4 Robustez Mobile

| Mecanismo | Descrição |
|-----------|-----------|
| **Base64 chunked** | `arrayBufferToBase64()` / `base64ToUint8Array()` processam em triplas sem `atob`/`btoa` (inexistente no WebView mobile). Sem stack overflow para arquivos >65KB. |
| **SHA-256 fallback** | `crypto.subtle.digest('SHA-256')` com fallback para implementação JS pura se indisponível (Android WebView antigo). |
| **Retry + backoff** | 3 tentativas com `delay(500ms * 2^attempt)` em todas as chamadas à API. |
| **Rate-limit** | 100ms entre PUT/DELETE, 50ms entre GET (evita secondary rate limit do GitHub). |
| **Max file size** | Arquivos > 1MB são pulados com log de aviso (GitHub Contents API rejeita). |
| **ensureDataDir()** | Cria `.obsidian/vault-keeper/` via `adapter.mkdir()` antes de toda escrita (mobile não auto-cria dirs). |
| **ensureParentDirs()** | Cria recursivamente diretórios intermediários antes de `write()` — necessário em pull/clone no Android. |
| **Snapshot safety** | `backupState()` salva state antes do push. Se push falhar, `restoreBackup()` recupera estado anterior. |
| **walkFiles strip** | CapacitorAdapter (Android) retorna paths completos de `list()` em vez de basenames. `walkFiles` normaliza com `strip()` antes de concatenar. |
| **SHA duplo** | `FileEntry` tem dois campos: `sha` (SHA-256 do conteúdo, usado em push) e `gitSha` (Git blob SHA1 do GitHub, usado no skip de pull). Formatos incompatíveis → campos separados evitam push redundante após pull/clone. |
| **PUT com SHA** | `push()` sempre busca o SHA remoto atual antes de cada PUT, evitando erro 422 "sha wasn't supplied" para arquivos que existem no GitHub mas não no state local. |

#### 3.1.5 Otimização do `status()`

Antes de hashear um arquivo, compara `adapter.stat()` → `mtime` + `size` com o cache. Só faz SHA-256 se `stat` diferir. Reduz drasticamente I/O no mobile.

Se `adapter.stat()` não estiver disponível (mobile), o catch é silencioso (`continue`), sem false positive.

#### 3.1.6 Ordem Push → Pull

Correção crítica para mobile: o `doSync()` agora faz **push antes do pull**. A ordem anterior `pull → push` fazia o pull sobrescrever modificações locais antes do push detectá-las.

```
doSync() = backupState() → push() → [rollback on fail] → pull()
doPush() = backupState() → push() → [rollback on fail]
doPull() = pull()
```

#### 3.1.7 State Tracking

Arquivo `sync_state.json` (main) ou `sync_state_<rootDir>.json` (projeto) em `.obsidian/vault-keeper/`:

```json
{
  "lastRemoteSHA": "abc123...",
  "files": {
    "wiki/pagina.md": {
      "sha":    "e3b0c44...",
      "gitSha": "a1b2c3d...",
      "mtime":  1718234567891,
      "size":   5120
    }
  }
}
```

| Campo | Tipo | Descrição |
|-------|------|-----------|
| `sha` | SHA-256 hex (64 chars) | Hash do conteúdo do arquivo — usado em `push()` para detectar mudança |
| `gitSha` | Git blob SHA1 (40 chars) | Hash do blob GitHub — usado em `pull()` para skip de arquivos inalterados |
| `mtime` | timestamp ms | Último `mtime` registrado — otimização: pula SHA se `stat` não mudou |
| `size` | bytes | Último tamanho — otimização conjunta com `mtime` |

> `sha` e `gitSha` são formatos incompatíveis. Campos separados resolvem o bug que causava push de todos os arquivos após pull/clone.

### 3.2 Base64 Chunked (`src/github/base64.ts`)

Substitui `atob`/`btoa` (não confiáveis no WebView mobile do Obsidian):

| Função | Descrição |
|--------|-----------|
| `arrayBufferToBase64(buf)` | Codifica ArrayBuffer → base64 string (itera por índice de triple, sem stack overflow) |
| `base64ToUint8Array(str)` | Decodifica base64 string → Uint8Array |
| `base64ToString(str)` | Decodifica base64 → string UTF-8 via TextDecoder |

### 3.3 Termux Bridge (`src/termux/sync.ts`)

Bridge ultra-simples para usuários com Termux no Android.

#### 3.3.1 Funcionamento

1. Plugin gera comandos git em shell script
2. Copia para clipboard via `navigator.clipboard.writeText()`
3. Mostra em Notice com timeout de 12s
4. Usuário cola no Termux e executa

#### 3.3.2 Comandos Gerados

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

#### 3.3.3 Status

Lê `.git/HEAD` e `.git/refs/heads/main` via `vault.adapter.read()` (fast path, sem API):
```
git: main (abc1234)
```

### 3.4 LLM Provider (`src/llm/provider.ts`)

Interface agnóstica de LLM. Suporta 3 providers:

| Provider | Descrição |
|----------|-----------|
| `http` | OpenAI-compatible (DeepSeek, OpenAI, Groq, etc.) |
| `ollama` | Local via Ollama |
| `hermes-gateway` | Hermes Gateway interno |

#### 3.4.1 API

```typescript
interface LLMProvider {
  chat(messages: Message[], opts?: ChatOptions): Promise<string>
  models?(): Promise<string[]>
}
```

#### 3.4.2 Prompt Templates

- **Ingest:** Sistema + fonte raw → proposta de página wiki
- **Chat:** Sistema + contexto do vault (index + páginas relevantes) + pergunta

### 3.5 Wiki Operations (`src/wiki/ops.ts`)

#### 3.5.1 Operações

| Operação | Descrição |
|----------|-----------|
| `approve(file)` | Move de `inbox/` → `raw/`, atualiza status |
| `ingestFile(file, llm)` | Lê raw → LLM propõe página → cria em `wiki/` |
| `writePage(title, content, tags)` | Cria/atualiza página wiki com frontmatter |
| `updateIndex()` | Atualiza `wiki/index.md` |
| `gatherContext(question)` | Busca páginas relevantes para uma query |

#### 3.5.2 Frontmatter das Páginas Wiki

```yaml
---
title: "Título da Página"
date: 2026-06-07
tags: [tag1, tag2]
category: categoria
---
```

### 3.6 Views

| View | Type ID | Descrição |
|------|---------|-----------|
| `InboxView` | `vault-keeper-inbox` | Lista notas do inbox com filtros (pendente/aprovado/rejeitado) |
| `ChatView` | `vault-keeper-chat` | Chat com LLM que cita páginas do vault |
| `LintView` | `vault-keeper-lint` | Relatório de auditoria (contradições, órfãos, gaps) |

#### 3.6.1 Estado Atual das Views

Todas as views estão como **stubs** — mostram "em desenvolvimento". A UI completa será implementada em versões futuras.

---

## 4. Configurações

### 4.1 Schema

```typescript
interface ProjectVault {
  name: string    // display name, ex: 'alpha'
  path: string    // relativo ao vault, ex: 'projects/alpha'
  remote: string  // URL GitHub deste projeto
  token?: string  // token próprio; sem isso usa git.token
}

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
    token: string           // GitHub personal access token
    authorName: string
    authorEmail: string
    autoSyncMinutes: number // 0 = desligado
    syncOnOpen: boolean     // pull automático ao abrir vault
    syncOnClose: boolean    // push automático ao fechar vault
    conflictStrategy: 'ask' | 'keep-local' | 'keep-remote'
  }
  cli: {
    preferred: 'claude' | 'opencode' | 'gemini' | 'agy' | 'custom' | 'none'
    customBinaryPath: string
    autoDetect: boolean
    timeoutMinutes: number  // 0 = sem timeout
  }
  agent: {
    maxIterations: number   // default: 5
    maxFileChars: number    // default: 3000
    resetContext: boolean
  }
  vaults: {
    knowledge: string
    projects: ProjectVault[]
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
  llm: { provider: 'http', endpoint: 'https://api.deepseek.com/v1', model: 'deepseek-chat', apiKey: '', maxTokens: 4096 },
  git: { enabled: false, remote: '', token: '', authorName: '', authorEmail: '', autoSyncMinutes: 0,
         syncOnOpen: true, syncOnClose: false, conflictStrategy: 'ask' },
  cli: { preferred: 'none', customBinaryPath: '', autoDetect: true, timeoutMinutes: 5 },
  agent: { maxIterations: 5, maxFileChars: 3000, resetContext: true },
  vaults: { knowledge: '', projects: [] },
  inboxPath: 'inbox', rawPath: 'raw', wikiPath: 'wiki',
  logPath: 'wiki/log.md', indexPath: 'wiki/index.md'
}
```

---

## 5. Comandos Registrados

| ID | Nome | Ação |
|----|------|------|
| `open-inbox` | Abrir inbox | Ativa InboxView |
| `open-chat` | Vault Chat | Ativa ChatView |
| `open-lint` | Auditoria (lint) | Ativa LintView |
| `git-sync` | Sincronizar (push + pull) | push → pull com snapshot safety (todos os repos) |
| `git-push` | Push (enviar alterações) | backupState → push → rollback on fail (todos os repos) |
| `git-pull` | Pull (baixar alterações) | pull via GitHub API (todos os repos) |
| `git-push-current` | Push: arquivo atual | pushFile() do arquivo ativo — roteado para o sync correto |
| `git-status` | Status do sync | Termux status + GitHub status completo |
| `clone-repository` | Clonar repositório remoto | Modal de confirmação → clone() do main repo |
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
| `vault-keeper-push` | Push (upload para GitHub) — só aparece se git habilitado |
| `vault-keeper-pull` | Pull (download do GitHub) — só aparece se git habilitado |
| `vault-keeper-sync` | Sync completo (push + pull) — só aparece se git habilitado |

---

## 7. Status Bar

Mostra o estado do git no canto inferior (via Termux `status()`):

| Estado | Exemplo |
|--------|---------|
| Normal | `git: main (abc1234)` |
| Sem git | _(vazio)_ |
| Erro | _(vazio)_ |

---

## 8. Auto-Pull no Startup

Ao abrir o vault, após 2 segundos:

1. `quickStatus()` verifica se remote SHA difere do cache
2. Se remote está à frente → `pull()` silencioso
3. Mostra notice apenas se baixou arquivos

Evita o custo de um scan completo no load (que era problemático no mobile).

---

## 9. Auto-Sync

Timer configurável (`autoSyncMinutes`). Executa `doSync()` periodicamente:

1. `backupState()` — snapshot do estado atual
2. `push()` — envia alterações locais
3. Se push falhar → `restoreBackup()` + notice de erro
4. `pull()` — baixa alterações remotas
5. Atualiza status bar

---

## 10. Fluxo de Dados

### 10.1 Inbox → Wiki

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

### 10.2 Sync (GitHub API)

```
Usuário clica Push/Sync ou auto-sync dispara
  → GitHubSync.backupState()
    → salva sync_state.json → sync_state.json.backup
  → GitHubSync.push()
    → Varre vault por .md
    → Compara mtime+size com cache (só hasheia se diferente)
    → PUT /contents/{path} → envia alterados
    → DELETE /contents/{path} → remove deletados
    → Atualiza sync_state.json
  → Se push falhou:
    → GitHubSync.restoreBackup() — recupera estado anterior
    → Notice de erro
  → GitHubSync.pull()
    → GET /git/ref/heads/main → SHA remoto
    → Compara com lastRemoteSHA (skip se igual)
    → GET /git/trees/{sha}?recursive=1 → árvore
    → Compara SHA com sync_state.json
    → GET /contents/{path} → baixa arquivos alterados
    → Escreve no vault via base64ToString()
    → Atualiza sync_state.json
```

### 10.3 Sync (Termux)

```
Usuário dispara Termux: sync
  → TermuxSync.sync()
  → Gera script shell
  → navigator.clipboard.writeText(script)
  → Notice mostra comando
  → Usuário cola no Termux e executa
```

### 10.4 Push de Arquivo Único

```
Usuário dispara Push: arquivo atual
  → GitHubSync.pushFile(file.path)
    → Lê conteúdo binário
    → SHA-256 + arrayBufferToBase64()
    → Se arquivo existe no cache → GET sha remoto atual
    → PUT /contents/{path} (com sha se existente)
    → Atualiza sync_state.json
```

---

## 11. Segurança

### 11.1 Token GitHub

- Armazenado em `data.json` do plugin (Obsidian criptografa? Não — texto plano)
- Transmitido via header `Authorization: token {token}`
- Usado apenas em chamadas `requestUrl()` do Obsidian
- **Recomendação:** Usar token fine-grained com escopo mínimo (`contents: read/write`)

### 11.2 API Key LLM

- Armazenada em `data.json` (texto plano)
- Transmitida via header `Authorization: Bearer {key}`
- Suporta endpoints locais (Ollama, Hermes Gateway) sem autenticação

---

## 12. Histórico de Problemas Resolvidos

| # | Problema | Causa | Solução |
|---|----------|-------|---------|
| 1 | CSP bloqueia fetch() no mobile | WebView Android | `requestUrl()` nativo do Obsidian |
| 2 | `R.isDirectory is not a function` | stat() sem métodos | Implementar `isFile()`, `isDirectory()`, `isSymbolicLink()` |
| 3 | `ENOENT .git/index` | MobileGitFs desnecessário | `adapter.readBinary()` funciona pra `.git/` |
| 4 | Timeout 30s no status | statusMatrix em 500+ arquivos | `listFiles()` → `statusMatrix({filepaths})` |
| 5 | `Buffer is not defined` | isomorphic-git usa Node.js API | Abandonado — reescrita sem isomorphic-git |
| 6 | Push `Maximum call stack size` no mobile | `btoa(String.fromCharCode(...uint8array))` estoura > 65KB | `arrayBufferToBase64()` chunked processando por índice de triple |
| 7 | Pull `atob is not defined` no mobile | `atob` não confiável no WebView | `base64ToString()` + `TextDecoder` |
| 8 | `sync_state.json ENOENT` no mobile | `vault.adapter.write()` não auto-cria diretórios | `ensureDataDir()` via `adapter.mkdir()` antes de toda escrita |
| 9 | Pull sobrescrevia modificações locais | Ordem `pull → push` | Invertido para `push → pull` com snapshot safety |
| 10 | `status()` travava load do vault no mobile | `walkFiles` + `sha256` de todos `.md` no onload | `quickStatus()` (só remote SHA) + debounce 5s na status bar |
| 11 | `status()` falso-positivo no mobile | `adapter.stat()` inexistente marcava arquivo como alterado | Catch silencioso (`continue`) |
| 12 | Concorrência de sync | Auto-sync + manual simultâneos | Mutex `syncing` boolean |
| 13 | `walkFiles` double-path no Android | CapacitorAdapter retorna paths completos em `list()`, `walkFiles` concatenava prefix novamente → `wiki/wiki/page.md` | Normalização `strip()`: remove prefixo antes de concatenar |
| 14 | Push 422 "sha wasn't supplied" | Arquivo existe no GitHub mas não no `sync_state` → `if (existing)` pulava GET do SHA | Sempre faz GET do SHA remoto; captura 404 (arquivo novo, sem SHA) |
| 15 | Push envia todos os arquivos após pull/clone | `pull()` salvava Git blob SHA1 em `FileEntry.sha`; `push()` calculava SHA-256 — formatos incompatíveis, nunca casavam | Campo `gitSha` separado; pull/clone calculam e salvam SHA-256 em `sha` |
| 16 | `p.split is not a function` no chat mobile | Args de tool call podiam ser número (ex: `topK: 5`); `(v as string).split('/')` jogava TypeError | `typeof v === 'string' ? v : String(v)` antes do `.split()` |

---

## 13. Estado Atual (v0.3.0)

### 13.1 Funcional

- ✅ GitHub REST API sync — push / pull / clone / status / pushFile / quickStatus
- ✅ Multi-repo: cada subpasta de projeto sincroniza com repo próprio
- ✅ 3 ribbon icons separados (push / pull / sync)
- ✅ Auto-pull no startup com quickStatus
- ✅ Auto-push no save (roteado para o sync correto)
- ✅ Termux bridge (comandos copia-e-cola)
- ✅ Status bar com Termux status
- ✅ LLM provider agnóstico (HTTP, Ollama, Hermes)
- ✅ Wiki operations (inbox→raw→wiki)
- ✅ BM25 full-text search com persistência e reindexação automática
- ✅ CLI bridge com detecção automática + botão ⏹ Parar (SIGTERM→SIGKILL)
- ✅ InboxView funcional (filtros, aprovar/rejeitar)
- ✅ ChatView funcional (CLI Task Panel + Vault Chat interno)
- ✅ LintView funcional (auditoria frontmatter/index)
- ✅ Wizard de onboarding (scaffold + CLAUDE.md/GEMINI.md/AGENTS.md)
- ✅ Settings UI completo (inclui seção Projetos para multi-repo)
- ✅ Instalador (`scripts/install.sh` — build + zip + deploy desktop/Android)
- ✅ 238 testes unitários (vitest)
- ✅ Build: 96 KB, ~20ms

### 13.2 Pendente

- 🔴 iOS — nunca testado
- 🔴 Conflict Modal — hoje faz backup silencioso + sobrescreve; UI de resolução interativa pendente
- 🟡 B-002 Terminal no ChatView — standby (node-pty requer binários nativos, inviável em zip)

---

## 14. Roadmap

| Versão | Features |
|--------|----------|
| **0.3.x** | Validar sync iOS; Conflict Modal UI interativa |
| **0.4.0** | Rules engine (detectar padrões repetidos no log → sugerir regra) |
| **1.0.0** | YAML robusto (pacote `yaml` já presente), merge handling, cross-ingest UI |

---

## 15. Instalação e Deploy

```bash
git clone https://github.com/lucassnts963/obsidian-vault-keeper.git
cd obsidian-vault-keeper
npm install

# Build + zip
npm run zip

# Build + instalar em vault desktop
bash scripts/install.sh --vault /caminho/vault

# Build + enviar para Android via adb
bash scripts/install.sh --android

# Opções adicionais
bash scripts/install.sh --help
```

## 16. Repositório

**GitHub:** [`lucassnts963/obsidian-vault-keeper`](https://github.com/lucassnts963/obsidian-vault-keeper)
