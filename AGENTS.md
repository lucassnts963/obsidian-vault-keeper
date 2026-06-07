# AGENTS.md — Vault Keeper

> Obsidian plugin for complete knowledge management methodology: inbox → approve → ingest → wiki → query → lint → cross-ingest.

## Overview

| Layer | Tech |
|---|---|
| Shell / Platform | OBSIDIAN_PLUGIN (Electron desktop + Mobile WebView) |
| Frontend | VANILLA (Obsidian API: ItemView, Setting, Modal, Notice) |
| Backend | NONE (pure frontend plugin, no server) |
| Database | NONE (Obsidian Vault API: adapter.read/write, TFile) |
| Auth | NONE (user configures API key in plugin settings) |
| Language | TYPESCRIPT |

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
src/                          # Plugin source
├── main.ts                   # Entry point: Plugin.onload/onunload
├── settings.ts               # Config schema + defaults
├── settings-tab.ts           # Obsidian SettingTab UI
├── git/
│   └── sync.ts               # isomorphic-git: push/pull/status
├── llm/
│   └── provider.ts           # LLM provider factory + prompt templates
├── wiki/
│   ├── ops.ts                # Ingest, write page, update index/log
│   └── log.ts                # Logger append-only
└── views/
    ├── inbox-view.ts         # Inbox panel with status filters
    ├── chat-view.ts          # Vault Chat with LLM citations
    └── lint-view.ts          # Audit report
```

---

## Commands

| Command | Where | Description |
|---|---|---|
| `npm run dev` | root | Build with sourcemaps (watch mode would need esbuild --watch) |
| `npm run build` | root | Build production bundle (main.js) |
| `npm test` | root | Run tests (vitest — to be configured) |
| `npx eslint . --ext .ts` | root | Lint TypeScript |

---

## Architecture & Data Flow

```
Obsidian User
  → Vault Keeper Plugin (main.ts registers views/commands)
    → InboxView (reads inbox/*.md → user approves/rejects)
      → WikiOps (moves to raw/, creates wiki pages)
    → ChatView (user question → LLMProvider.chat() → citations)
      → LLMProvider (HTTP fetch to /v1/chat/completions)
    → GitSync (isomorphic-git push/pull to GitHub)
  → Obsidian Vault (filesystem via Vault API)
```

### LLM Flow
```
User question → ChatView
  → WikiOps.gatherContext() (read index + relevant pages)
  → LLMProvider.chat(messages) → HTTP POST to endpoint
  → Response parsed → citations rendered as [[wiki/links]]
```

### Inbox Flow
```
inbox/*.md (frontmatter: status: inbox)
  → InboxView (list with filters: inbox/approved/rejected)
  → User clicks approve → WikiOps.approve() → moves to raw/, sets status: raw
  → User clicks ingest → WikiOps.ingestFile() → LLM proposes page → user confirms → wiki page created
```

---

## Coding Conventions

### Obsidian Plugin
- **Views**: Extend `ItemView`, register with `registerView()`, activate via `WorkspaceLeaf`
- **Settings**: Use `PluginSettingTab` with `new Setting(containerEl)`
- **Commands**: `this.addCommand({ id, name, callback })`
- **File access**: `this.app.vault.adapter.read/write()`, `this.app.vault.create()`
- **Notifications**: `new Notice('message')`

### External Dependencies
- **isomorphic-git**: Git in pure JS. Import: `import * as git from 'isomorphic-git'`
- **LLM**: Any OpenAI-compatible endpoint. Use `fetch()` with Bearer token
- **No runtime deps** beyond those above + obsidian API types

### Naming
- Files: kebab-case (`inbox-view.ts`)
- Classes: PascalCase (`InboxView`)
- Functions: camelCase (`ingestFile`)
- Interfaces: PascalCase with `I` prefix only for plugin-level interfaces (`LLMProvider`)

---

## Testing (TDD Mandatory)

> **IMPORTANT:** Tests are written BEFORE implementation.

### Framework
- **Unit:** vitest (to be installed)
- **Coverage:** c8 or istanbul via vitest

### Test File Convention
- Location: `src/__tests__/` directory
- Naming: `<FileUnderTest>.test.ts`

### TDD Workflow
```
Spec → Red (write failing test) → Green (implement) → Refactor → Repeat
```

---

## Key Observations for Agents

1. **Obsidian API is only available at runtime** — mock `obsidian` module in tests. Use `import { App, Vault, TFile } from 'obsidian'` but never instantiate directly in tests.
2. **All views must extend ItemView** and implement `getViewType()`, `getDisplayText()`, `onOpen()`, `onClose()`.
3. **File operations are async** — always await `vault.adapter.read()`, `vault.create()`, etc.
4. **isomorphic-git works in browser/mobile** — no shell required. Use HTTP transport with token auth.
5. **LLM provider is a runtime dependency** — plugin works without it (views show "LLM not configured"). Never crash on missing LLM.
6. **All changes go through `.specs/`** — write spec first, implement second.
7. **TDD is mandatory** — write tests BEFORE implementation.
8. **Every view command should be accessible via both ribbon icon and command palette.**
