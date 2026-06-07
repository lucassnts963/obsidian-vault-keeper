# Architecture — Vault Keeper

## ADR-001: isomorphic-git for Git Sync

**Decision:** Use isomorphic-git (pure JS) instead of shell git or the official Obsidian Git plugin.

**Rationale:**
- Official Obsidian Git plugin calls system binary → broken on Android ("buffer error" with binary files)
- isomorphic-git runs in browser/WebView — no shell dependency
- HTTP transport with GitHub token auth — works on mobile and desktop identically

**Tradeoffs:**
- isomorphic-git is slower than native git for large repos
- No SSH support — HTTPS only with token
- Requires manual implementation of push/pull logic (not 1:1 with git CLI)

## ADR-002: LLM Provider Agnostic via Factory Pattern

**Decision:** Use a factory pattern (`createProvider(settings) → LLMProvider`) supporting HTTP API, Ollama, and Hermes Gateway.

**Rationale:**
- Users should not be locked into a single LLM provider
- OpenAI-compatible API (`/v1/chat/completions`) is a de facto standard
- Ollama for local/desktop users
- Hermes Gateway for the user's own infrastructure

**Tradeoffs:**
- Provider-specific features (thinking, streaming) not available in v1
- Error handling varies between providers

## ADR-003: ItemView for Panels (Not Custom HTML)

**Decision:** Use Obsidian's `ItemView` class for inbox, chat, and lint panels.

**Rationale:**
- Native Obsidian integration (leaf management, drag/resize)
- Consistent look and feel with the rest of Obsidian
- Simpler than building custom HTML panels

**Tradeoffs:**
- Less design flexibility than custom HTML/CSS
- ItemView has specific lifecycle (onOpen/onClose) that must be followed

## ADR-004: Filesystem as Database

**Decision:** No database. All state stored in markdown files within the Obsidian vault.

**Rationale:**
- Obsidian IS a filesystem-based knowledge base
- Frontmatter YAML provides structured metadata
- Git-friendly (markdown diffs are readable)
- No migration headaches

**Tradeoffs:**
- No query language (must parse files manually)
- No transactions (file writes are atomic but multi-file ops aren't)
- Full-text search relies on Obsidian's built-in search or ripgrep
