# Plan: Vault Keeper — Phase 1: Views Implementation

**Date:** 2026-06-07  
**Spec:** `001-views-implementation`  
**Status:** Planning

## Goal

Implement the three core views of Vault Keeper: Inbox, Chat, and Lint. These are the UI panels that users interact with directly.

## Current State

- Scaffold complete: `main.ts`, `settings.ts`, `settings-tab.ts`, `llm/provider.ts`, `wiki/ops.ts`, `wiki/log.ts`
- Views are stubs: each has a class extending `ItemView` but `onOpen()` only shows "em desenvolvimento"
- Git sync: interface exists, no implementation (deferred)

## Phase A: Inbox View

**File:** `src/views/inbox-view.ts`

### A1. File listing
- On open, scan `inbox/` directory for all `.md` files
- Parse frontmatter from each file (using Obsidian's `parseYaml` or regex)
- Extract: title, category, status, date, tags, priority

### A2. Status filtering
- Tab bar with filters: All | Inbox | Approved | Rejected
- Clicking a tab filters the list
- Show count per status (e.g., "Inbox (472)")

### A3. File actions
- Click file → open in Obsidian editor
- Right-click or button: Approve / Reject
  - Approve: move to `raw/`, change status to `raw`, update log
  - Reject: move to trash or change status to `rejected`

### A4. UI
- Use Obsidian's built-in components (no custom CSS framework)
- Each file shown as: icon + title + date + category badge + status pill
- Responsive: works in narrow sidebar on mobile

## Phase B: Chat View

**File:** `src/views/chat-view.ts`

### B1. Chat interface
- Input field at bottom
- Message history above (scrollable)
- Send button or Enter to submit

### B2. LLM integration
- Load LLM config from plugin settings
- If not configured, show "Configure LLM in settings" message
- On submit: gather context (index.md + relevant wiki pages) → send to LLM → stream or await response
- Parse citations in format `[[wiki/page]]` → render as clickable links

### B3. Context gathering
- Read `wiki/index.md` for overview
- Search vault for relevant pages based on user's question
- Include up to N pages in context (configurable, default 5)

### B4. UI
- User messages: right-aligned, colored
- Assistant messages: left-aligned, markdown rendered
- Citations rendered as Obsidian internal links
- Loading indicator while waiting for LLM

## Phase C: Lint View

**File:** `src/views/lint-view.ts`

### C1. Static checks (no LLM)
- Orphan detection: pages in `wiki/` not linked from any other page
- Index consistency: pages in index that don't exist, pages not in index
- Frontmatter validation: required fields present (title, category, date, tags)
- Broken wikilinks: `[[wiki/page]]` where page doesn't exist

### C2. LLM-powered checks (optional)
- Contradiction detection: LLM compares pairs of pages for conflicting claims
- Gap analysis: LLM identifies missing topics based on index overview

### C3. Report UI
- Severity levels: error (red), warning (yellow), info (blue)
- Filterable by severity
- Click issue → open relevant file
- Summary at top: "3 errors, 5 warnings, 12 info"

### C4. Auto-fix
- "Fix index" button: regenerate index.md from actual wiki/ contents
- "Fix frontmatter" button: add missing fields with sensible defaults

## Phase D: Polish & Integration

### D1. Git sync status bar
- Show git status in the status bar (bottom of Obsidian): "3 changes local, 2 remote"
- Click → open sync dialog

### D2. Cross-ingest command
- Command palette: "Cross-ingest current file"
- Detects target vault from settings
- Copies file to target vault's inbox

### D3. Settings improvements
- "Test LLM connection" button in settings tab
- "Test Git connection" button
- Model list dropdown (fetched from provider)

## Files To Change

| File | Phase | Action |
|------|-------|--------|
| `src/views/inbox-view.ts` | A | Full implementation |
| `src/views/chat-view.ts` | B | Full implementation |
| `src/views/lint-view.ts` | C | Full implementation |
| `src/main.ts` | D | Add status bar, cross-ingest command |
| `src/settings-tab.ts` | D | Add test connection buttons |
| `src/wiki/ops.ts` | B | Add `gatherContext()` method for chat |

## Tests

### Inbox View
- `listFiles()` returns correctly parsed frontmatter
- `filterByStatus('approved')` returns only approved files
- `approve(file)` moves file to raw/ and updates status
- `reject(file)` changes status to rejected

### Chat View
- `gatherContext(question)` returns relevant pages
- `parseCitations(response)` extracts [[wiki/links]]
- Chat renders messages in correct order

### Lint View
- `findOrphans()` returns pages with no inbound links
- `checkIndex()` finds mismatches between index and wiki/
- `validateFrontmatter()` catches missing required fields

## Risks

- **Obsidian mobile WebView limitations:** Some DOM APIs may not work. Test on both desktop and mobile.
- **LLM latency:** Chat might feel slow on first response. Show loading state immediately.
- **Large inbox:** 472 files. Listing them all at once may be slow. Implement pagination or lazy loading.
- **Frontmatter parsing:** Edge cases with malformed YAML. Wrap in try/catch.

## Verification

1. `npm run build` succeeds (no TypeScript errors)
2. Plugin loads in Obsidian without console errors
3. Inbox shows all files with correct status badges
4. Chat sends query and displays response with citations
5. Lint detects at least the intentional test issues
6. All views are keyboard-accessible (command palette)
