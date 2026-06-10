# AGENTS.md — Vault Keeper

> Obsidian plugin for complete knowledge management methodology: inbox → approve → ingest → wiki → query → lint → cross-ingest. Delegates intelligence to an installed external CLI and falls back to a built-in LLM provider when no CLI is detected.
>
> **CLI status:** OpenCode ✅ tested in production — Claude Code, Gemini CLI, Antigravity (`agy`) and Custom are implemented but not yet tested.

## Overview

| Layer | Tech |
|---|---|
| Shell / Platform | OBSIDIAN_PLUGIN (Electron desktop + Mobile WebView) |
| Frontend | VANILLA (Obsidian API: ItemView, Setting, Modal, Notice) |
| Backend | NONE (pure frontend plugin, no server) |
| Database | NONE (Obsidian Vault API + BM25 JSON index at `.vault-keeper/bm25-index.json`) |
| Git Sync | GitHub REST API (fetch puro — sem isomorphic-git, sem shell; funciona no mobile) |
| Auth | NONE (user configures API key / CLI in plugin settings) |
| Language | TYPESCRIPT |
| Test suite | vitest — **221 tests, 28 files** |

---

## Spec-Driven Development Methodology

This project uses **spec-driven development**. All changes flow through specs in `.specs/`.

### Directory Structure

```
.opencode/
└── skills/                    # Custom agent skills
    ├── create-skill.md
    ├── init-project.md
    ├── requirements-gathering.md
    └── tdd-workflow.md

.specs/
├── requirements/              # Requirements documents
├── templates/                 # Spec templates
├── changes/                   # Active specs (one folder per change)
├── archive/                   # Completed specs
├── memory/                    # Persistent project knowledge
│   ├── architecture.md        # ADRs
│   ├── conventions.md         # Code conventions
│   └── glossary.md            # Terminology
└── shared/                    # Shared reference docs
```

### Spec Workflow

1. Identify need → create folder `changes/<nnn>-<slug>/`
2. Write `spec.md` using the appropriate template
3. Review and approve spec
4. Implement following spec's checklist
5. Move folder to `archive/`
6. Update `memory/` if new architectural decisions

---

## Project Structure

```
src/
├── main.ts                   # Entry point: Plugin.onload/onunload
├── settings.ts               # Config schema + defaults (LLMSettings, GitSettings, CLISettings)
├── settings-tab.ts           # Obsidian SettingTab UI
│
├── agents/
│   ├── cli-bridge.ts         # CLIBridge: detect CLI (opencode ✅ / others not tested), build CLAUDE.md / GEMINI.md / AGENTS.md, spawn tasks
│   └── monitor.ts            # VaultIntegrityMonitor: watch wiki/ → debounced BM25 reindex
│
├── scaffold/
│   ├── installer.ts          # VaultInstaller: first-run ensureStructure() + migrateExistingFiles()
│   └── templates.ts          # defaultVaultTemplate(): dirs + seed files
│
├── chat/
│   ├── agent.ts              # VaultAgent: tool-calling loop
│   ├── prompts.ts            # System prompts with FAITHFULNESS rules
│   └── tools.ts              # Tool implementations (bm25_search, read_file, write_page, …)
│
├── github/
│   └── sync.ts               # isomorphic-git: push/pull/status
│
├── llm/
│   └── provider.ts           # LLM provider factory (OpenAI-compatible)
│
├── search/
│   ├── bm25.ts               # Okapi BM25 algorithm
│   ├── index-builder.ts      # WikiSearchIndex builder
│   └── index-persistence.ts  # Read/write .vault-keeper/bm25-index.json
│
├── slots/
│   └── manager.ts            # SlotsManager: _slots/ session state
│
├── termux/
│   └── sync.ts               # Termux shell sync helper
│
├── wiki/
│   ├── ops.ts                # WikiOps: ingest, approve, reject, gatherContext, writePage
│   └── log.ts                # Append-only activity log (wiki/log.md)
│
└── views/
    ├── onboarding-view.ts    # First-run wizard: fresh setup or migrate existing vault
    ├── chat-view.ts          # CLI Task Panel (CLI mode) + Vault Chat (LLM fallback)
    ├── inbox-view.ts         # Inbox panel with status filters + approve/reject buttons
    ├── lint-view.ts          # Audit report with actionable buttons
    ├── markdown.ts           # Markdown renderer
    └── ui.ts                 # Shared UI helpers
```

---

## Commands

| Command | Where | Description |
|---|---|---|
| `npm run dev` | root | Bundle with sourcemaps (esbuild, single pass) |
| `npm run build` | root | Type-check + production bundle (`main.js`) |
| `npm test` | root | Run all 209 tests (vitest) |
| `npm run lint` | root | ESLint TypeScript |

---

## Architecture & Data Flow

```
Obsidian User
  → Vault Keeper Plugin (main.ts)
      │
      ├─ OnboardingView      ← first-run wizard (fresh | migrate)
      │     └─ CLIBridge.buildInstructions() → writes CLAUDE.md / GEMINI.md / AGENTS.md
      │
      ├─ InboxView           ← inbox/*.md list → approve / reject
      │     └─ WikiOps.approve() / reject()
      │
      ├─ ChatView (CLI mode)  ← detects installed CLI on load
      │     └─ CLIBridge.buildCommand(task) → spawn (desktop) | copy (mobile)
      │           └─ streams stdout line-by-line back into chat bubbles
      │
      ├─ ChatView (LLM mode)  ← fallback when no CLI configured
      │     └─ VaultAgent.run(question, context)
      │           → bm25_search → read_file → answer
      │
      ├─ LintView            ← audit: orphans, frontmatter, index drift
      │
      ├─ VaultIntegrityMonitor (background)
      │     └─ vault events (create/modify wiki/**) → debounced reindex → bm25-index.json
      │
      └─ GitSync (commands: push / pull / sync)
            └─ isomorphic-git (pure JS, works on mobile)
```

### Vault Directory Layout (post-setup)

```
<vault-root>/
├── inbox/          ← new content lands here (status: inbox)
├── raw/            ← approved sources (status: raw)
├── wiki/           ← processed knowledge pages
│   ├── index.md    ← master table (title, category, tags, summary)
│   └── log.md      ← append-only activity log
├── _slots/         ← live session state
│   ├── focus.md    ← current task context
│   └── lint-report.md
└── .vault-keeper/
    └── bm25-index.json   ← persistent full-text index
```

### Methodology Flow (Karpathy LLM Wiki)

```
inbox/*.md  ──approve──▶  raw/*.md  ──ingest──▶  wiki/*.md
(status: inbox)        (status: approved)      (status: ingested)
                                                      │
                                              bm25-index.json
                                                      │
                                           query ◀────┘────▶ lint
```

1. **Inbox** — content arrives with `status: inbox` (notes, clips, blog posts)
2. **Approve** — user moves file to `raw/`, sets `status: approved`, activity logged. Rejected files stay in inbox with `status: rejected`.
3. **Ingest** — LLM/CLI reads source → produces wiki page with YAML frontmatter (`title`, `summary`, `key_entities`, `tags`) + citations
4. **Index** — `wiki/index.md` and `bm25-index.json` updated automatically; upserts are serialized via write queue to prevent race conditions
5. **Query** — BM25 search seeds LLM context → answer with `[[wiki/links]]`
6. **Lint** — periodic audit: orphaned pages, missing index entries, frontmatter issues (uses configured paths, not hardcoded)
7. **Slots** — `_slots/focus.md` holds current session context (injected on every query)

---

## CLI Bridge

`CLIBridge` (`src/agents/cli-bridge.ts`) is the primary intelligence layer.

### Detection Priority

1. `opencode` ✅ tested
2. `claude` (Claude Code) — implemented, not tested
3. `gemini` — implemented, not tested
4. `agy` (Antigravity) — implemented, not tested
5. Custom binary path (from `CLISettings.customBinaryPath`) — implemented, not tested
6. None → fall back to internal LLM

### Instruction Files Generated

| File | Purpose |
|------|---------|
| `CLAUDE.md` | Full vault methodology for Claude Code |
| `GEMINI.md` | Same methodology for Gemini CLI |
| `AGENTS.md` | Same for OpenCode / any agent |

All three are written simultaneously during onboarding or on-demand from settings.

### Task Dispatch

| ChatView intent | CLI command template |
|----------------|---------------------|
| `ingest <source>` | `claude "Read raw/<source>…"` |
| `lint` | `claude "Scan wiki/ and write _slots/lint-report.md…"` |
| `query <question>` | `claude "Using BM25 index, answer: <question>"` |
| `focus <task>` | `claude "Write _slots/focus.md with task: <task>"` |

On desktop (Electron): command is **spawned**, stdout streamed line-by-line into chat.
On mobile: command string is **copied to clipboard** with a notice.

---

## Settings Schema

```typescript
interface CLISettings {
  preferred: 'claude' | 'opencode' | 'gemini' | 'custom' | 'none';
  customBinaryPath: string;
  autoDetect: boolean;           // default true — persisted on first successful detect
}

interface GitSettings {
  enabled: boolean
  remote: string                 // HTTPS GitHub URL
  token: string                  // GitHub PAT (ghp_...)
  authorName: string
  authorEmail: string
  autoSyncMinutes: number        // 0 = off
  syncOnOpen: boolean            // auto-pull on vault open (default true)
  syncOnClose: boolean           // auto-push on vault close (fire-and-forget)
  conflictStrategy: 'ask' | 'keep-local' | 'keep-remote'
  // ask: backup local file + overwrite (default)
  // keep-local: skip remote changes for locally-modified files
  // keep-remote: always overwrite local (backup saved as .backup.md)
}
```

Full schema in `src/settings.ts`. All fields are exposed in Settings UI.

---

## Coding Conventions

### Obsidian Plugin
- **Views**: Extend `ItemView`, register with `registerView()`, activate via `WorkspaceLeaf`
- **Settings**: Use `PluginSettingTab` with `new Setting(containerEl)`
- **Commands**: `this.addCommand({ id, name, callback })`
- **File access**: `this.app.vault.adapter.read/write()`, `this.app.vault.create()`
- **Notifications**: `new Notice('message')`

### External Dependencies
- **isomorphic-git**: Git in pure JS. `import * as git from 'isomorphic-git'`
- **LLM**: Any OpenAI-compatible endpoint. Use `fetch()` with Bearer token
- **BM25**: Internal implementation — no extra runtime dep
- **No additional runtime deps** beyond `yaml` and the Obsidian API types

### Naming
- Files: kebab-case (`cli-bridge.ts`)
- Classes: PascalCase (`CLIBridge`)
- Functions: camelCase (`buildCommand`)
- Interfaces: PascalCase, no `I` prefix

---

## Testing (TDD Mandatory)

> **IMPORTANT:** Tests are written BEFORE implementation. Current suite: **221 tests / 28 files**.

### Framework
- **Unit:** vitest + happy-dom
- **Mocks:** `src/__mocks__/obsidian.ts` — mock all Obsidian API types

### Test File Convention
- Location: `src/__tests__/`
- Naming: `<FileUnderTest>.test.ts`

### TDD Workflow
```
Spec → Red (write failing test) → Green (implement) → Refactor → Repeat
```

### Key Test Files

| Test file | What it covers |
|-----------|---------------|
| `cli-bridge.test.ts` | CLI detection, command building, instruction file generation |
| `vault-installer.test.ts` | ensureStructure(), migrateExistingFiles() |
| `vault-monitor.test.ts` | BM25 reindex on wiki file events |
| `bm25.test.ts` | Okapi BM25 scoring |
| `index-persistence.test.ts` | JSON index read/write |
| `slots-manager.test.ts` | SlotsManager session state |
| `chat-view.test.ts` | CLI mode vs LLM mode dispatch |
| `github-sync.test.ts` | isomorphic-git push/pull/conflicts |

---

## Key Observations for Agents

1. **CLI Bridge is the primary intelligence layer** — prefer spawning `claude`/`opencode`/`gemini` over calling the internal LLM. The internal agent is a fallback.
2. **Git sync uses GitHub REST API** — NOT isomorphic-git. Pure fetch, works on mobile without shell. `src/github/sync.ts`.
3. **Obsidian API is only available at runtime** — mock `obsidian` module in tests. Never instantiate `App`, `Vault`, `TFile` directly in tests.
4. **All views must extend ItemView** and implement `getViewType()`, `getDisplayText()`, `onOpen()`, `onClose()`.
5. **File operations are async** — always await `vault.adapter.read()`, `vault.create()`, etc.
6. **LLM provider is a runtime dependency** — plugin works without it (views show "Nenhuma IA configurada"). Never crash on missing LLM — `provider.ts` already returns null on missing config.
7. **BM25 index is the retrieval layer** — always use `bm25_search` before `read_file` for topic queries.
8. **_slots/ is the session context** — inject `_slots/focus.md` at the start of every agent turn.
9. **IndexPersistence uses a write queue** — all `upsert`/`remove` calls are serialized. Don't bypass this by calling `load()` + `save()` directly in concurrent code.
10. **runLint respects configured paths** — `executeTool` accepts `lintPaths` param. Pass `{ wikiPath, inboxPath, rawPath }` from settings; don't rely on defaults.
11. **All changes go through `.specs/`** — write spec first, implement second.
12. **TDD is mandatory** — write tests BEFORE implementation.
13. **Every view command must be accessible via both ribbon icon and command palette.**

---

## Vault Agent

You are a knowledge vault assistant built on the Karpathy LLM Wiki methodology.
Answer questions based solely on vault content.

### Intent Routing

| Detected intent | First tool | Next |
|----------------|-----------|------|
| Question about topic | `bm25_search(topic)` | `read_file` on top results |
| Ingest a source | `read_file(raw/source.md)` | `ingest_file` |
| Review inbox | `list_dir(inbox/)` | `approve_file` / `reject_file` |
| Find issues / lint | `run_lint({})` | report findings |
| Session focus | `read_file(_slots/focus.md)` | use as context |
| Create a wiki page | `write_page(title, content, tags)` | done |

Prefer `bm25_search` over `read_index` for topic queries — it returns ranked results directly.

### FAITHFULNESS Rules

- Never fabricate citations. Only reference files that exist in `wiki/`.
- Every factual claim must cite `[[wiki/page]]`.
- If uncertain, say so explicitly — do not guess.
- Ingest produces pages from sources; it does not paraphrase or summarize without grounding.
