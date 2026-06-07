# Glossary — Vault Keeper

| Term | Definition |
|------|-----------|
| **Vault** | Obsidian knowledge base — a folder of markdown files |
| **Inbox** | Source files awaiting review (status: inbox) |
| **Raw** | Approved source files, immutable (status: raw) |
| **Ingest** | LLM reads a raw source → proposes a wiki page |
| **Query** | User asks a question → LLM answers with vault citations |
| **Lint** | Automated audit of wiki health (contradictions, orphans, broken links) |
| **Cross-Ingest** | Promoting content from one vault to another (e.g., Montisol → Knowledge) |
| **Frontmatter** | YAML metadata block at the top of markdown files (`--- ... ---`) |
| **FAITHFULNESS** | Principle: every claim in a wiki page must be grounded in the source |
| **isomorphic-git** | Pure JavaScript Git implementation (no shell/binary dependency) |
| **ItemView** | Obsidian API class for custom panels |
| **WorkspaceLeaf** | Obsidian's panel container (left sidebar, right sidebar, main) |
| **Notice** | Obsidian's toast notification |
