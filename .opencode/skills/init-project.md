# Bootstrap New Project

**Name:** init-project
**Version:** 1.0.0
**Triggers:** "start project", "new project", "init", "bootstrap", "começar projeto", "novo projeto", "iniciar projeto", "create project"

## Purpose

Guide users through the initial setup of a new project following the spec-driven + TDD methodology. Asks all necessary decisions, fills in `AGENTS.md`, `conventions.md`, creates the first ADR and spec, and leaves the project ready for development.

## Prerequisites

- The starter-kit must already be copied to the project root
- Read `AGENTS.md`, `METHODOLOGY.md`, `.specs/memory/conventions.md`, `.specs/memory/architecture.md`

## Instructions

### Step 1: Gather Project Metadata

Ask the user sequentially (one question at a time). Use the `question` tool with sensible defaults where applicable.

| # | Question | Field | Options / Format |
|---|---|---|---|
| 1 | What is the project name? | `{PROJECT_NAME}` | free text (PascalCase or kebab-case) |
| 2 | What is the shell/platform? | Shell/Platform | `TAURI`, `ELECTRON`, `WAILLS`, `WEB`, `CLI`, `MOBILE`, `LIBRARY` |
| 3 | What is the frontend framework? | Frontend | `REACT`, `VUE`, `SVELTE`, `ANGULAR`, `SOLID`, `HTMX`, `VANILLA`, `NONE` |
| 4 | What is the backend language/framework? | Backend | `RUST`, `NODE`, `PYTHON`, `GO`, `CSHARP`, `JAVA`, `ELIXIR`, `NONE` |
| 5 | What database will you use? | Database | `SQLITE`, `POSTGRES`, `MYSQL`, `MONGODB`, `SURREALDB`, `NONE` |
| 6 | What is the project/team language? | Language | `en`, `pt-BR`, `bilingual (pt + en)`, `other` |
| 7 | What testing framework? | Test Framework | `VITEST`, `JEST`, `PYTEST`, `CARGO_TEST`, `GO_TEST`, `JUNIT`, `XUNIT` |
| 8 | What coverage threshold (%)? | Coverage | `70`, `80`, `90` (recommended: 80) |
| 9 | What package manager? | Package Manager | `npm`, `pnpm`, `yarn`, `bun`, `cargo`, `pip`, `go mod` |

### Step 2: Fill in AGENTS.md

Read `AGENTS.md` and replace placeholders with the user's answers:

| Placeholder | User's Answer |
|---|---|
| `{PROJECT_NAME}` | Project name |
| `{TAURI or ...}` | Keep only the chosen shell |
| `{REACT or ...}` | Keep only the chosen frontend |
| `{RUST or ...}` | Keep only the chosen backend |
| `{SQLITE or ...}` | Keep only the chosen database |
| `{LANGUAGE}` | User's choice |
| `{TEST_FRAMEWORK}` | User's choice |
| `{COVERAGE_THRESHOLD}` | User's choice |
| `{DEV_COMMAND}` | Ask or set as `<package-manager> run dev` |
| `{BUILD_COMMAND}` | Ask or set as `<package-manager> run build` |
| `{TEST_COMMAND}` | Ask or set as `<package-manager> run test` |
| `{LINT_COMMAND}` | Ask or set as `<package-manager> run lint` |
| `{EXT}` | File extension for the chosen stack |
| `{MANIFEST_FILE}` | Based on package manager (package.json, Cargo.toml, etc.) |
| `{HANDLER_PATTERN}` | Based on backend (commands, controllers, routes, handlers) |
| `{STYLING_APPROACH}` | Ask or leave as placeholder |
| `{UI_LIBRARY}` | Ask or leave as placeholder |
| `{STATE_MANAGEMENT}` | Ask or leave as placeholder |
| `{FORM_PATTERN}` | Ask or leave as placeholder |
| `{ROUTING_STRATEGY}` | Ask or leave as placeholder |
| `{AUTH_MECHANISM}` | Ask or leave as placeholder |
| `{NAMING_CONVENTION}` | Ask or leave as placeholder |
| `{ID_STRATEGY}` | Ask or leave as placeholder |

**IMPORTANT:** Only replace placeholders the user explicitly answered. Leave others as `{PLACEHOLDER}` for later.

### Step 3: Update conventions.md

Edit `.specs/memory/conventions.md` to narrow down the placeholder options to match the chosen tech stack. For example:
- If frontend is `REACT`, keep React-related options in state management and remove Vue/Svelte ones
- If backend is `RUST`, keep Rust-related ORM and connection pool options
- If database is `POSTGRES`, keep only PostgreSQL in database options
- If no UI framework: set Component Test Lib to `NONE`, E2E to `NONE`

### Step 4: Create ADR-001

Create or update `.specs/memory/architecture.md` to add:

```markdown
## ADR-001: Technology Stack

- **Date:** <today>
- **Status:** Accepted

**Context:** A new project needed a technology stack decision.

**Decision:** 
- Shell: {choice}
- Frontend: {choice}
- Backend: {choice}
- Database: {choice}
- Package Manager: {choice}
- Testing: {choice} (coverage: {choice}%)

**Consequences:**
- Tooling and conventions will follow this stack
- All ADRs and specs must align with these choices
```

### Step 5: Create Bootstrap Spec and Requirements

Create `.specs/requirements/001-init/requirements.md` with:
- Problem: new project initialization
- Methodology: User Stories (for the setup itself)
- Stakeholder: development team
- Functional Requirements: project structure, conventions, ADR-001

Create `.specs/changes/001-init/spec.md` using the `feature-spec.md` template with:

- **ID:** CHG-001
- **Status:** draft
- **Context:** Initial project setup with bootstrap configuration
- **Scope:** Project scaffolding, AGENTS.md configuration, ADR-001, conventions setup
- **Requirements:** REQ-01: Project structure created with chosen tech stack
- **Design:** N/A (no UI)
- **Tests:** N/A (setup-only change)
- **Requirements Traceability:** Linked to requirements/001-init/
- **Validation Checklist:** AGENTS.md filled, conventions set, ADR-001 written

### Step 6: Report Summary

Display a summary table of all decisions made and what files were created/modified:

```
## {PROJECT_NAME} — Bootstrap Complete

| Category | Decision |
|---|---|
| Shell | {choice} |
| Frontend | {choice} |
| Backend | {choice} |
| Database | {choice} |
| Language | {choice} |
| Testing | {choice} |
| Coverage | {choice}% |

### Files Created/Updated
- AGENTS.md — updated
- conventions.md — updated
- architecture.md — ADR-001 added
- .specs/requirements/001-init/requirements.md — created
- .specs/changes/001-init/spec.md — created

### Next Steps
1. Fill remaining {PLACEHOLDERS} in AGENTS.md
2. Create the project structure (run the init command for your framework)
3. Review and approve requirements REQ-001
4. Review and approve spec CHG-001
5. Start your first feature: run the requirements-gathering skill for `.specs/requirements/002-<slug>/`
```

## Examples

### Example 1: Web + React + Node

**User says:** "start a new project"

**Agent should:**
1. Ask project name → "MyApp"
2. Ask shell → "WEB"
3. Ask frontend → "REACT"
4. Ask backend → "NODE"
5. Ask database → "POSTGRES"
6. Ask language → "en"
7. Ask testing → "VITEST"
8. Ask coverage → 80
9. Ask package manager → "pnpm"
10. Fill AGENTS.md with: React, Node, PostgreSQL, Vitest
11. Narrow conventions.md to React+Node+PostgreSQL options
12. Create ADR-001 with the full stack
13. Create requirements/001-init/requirements.md and changes/001-init/spec.md
14. Report summary

### Example 2: CLI + Python

**User says:** "iniciar projeto"

**Agent should:**
1. Ask project name → "data-tool"
2. Ask shell → "CLI"
3. Ask frontend → "NONE"
4. Ask backend → "PYTHON"
5. Ask database → "SQLITE"
6. Ask language → "pt-BR"
7. Ask testing → "PYTEST"
8. Ask coverage → 90
9. Ask package manager → "pip"
10. Fill AGENTS.md with: CLI, Python, SQLite, Pytest
11. Remove frontend sections from conventions.md (no UI)
12. Create ADR-001 with the full stack
13. Create requirements/001-init/requirements.md and changes/001-init/spec.md
14. Report summary

## References

- `AGENTS.md` — template to fill
- `METHODOLOGY.md` — full methodology guide
- `.specs/memory/conventions.md` — coding conventions to narrow
- `.specs/memory/architecture.md` — ADR template
- `.specs/templates/feature-spec.md` — spec template for 001-init
