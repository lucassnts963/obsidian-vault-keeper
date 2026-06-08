# Spec: 6 Usability Fixes

| Field | Value |
|---|---|
| **ID** | CHG-008 |
| **Status** | draft |

## Changes

| # | File | Change |
|---|---|---|
| 1 | `main.ts` | + approve-current, reject-current commands |
| 2 | `wiki/ops.ts` | ingestFile: write status:ingested to source; gatherContext: link graph traversal |
| 3 | `views/inbox-view.ts` | Fix Todos count; try/catch ingest; click-to-open; ingested color |
| 4 | `views/ui.ts` | parseStatus return 'ingested'; add openFile helper |

## Tests

| ID | Test |
|---|---|
| T-01 | ingestFile sets source status to ingested |
| T-02 | InboxView shows Todos count when not active filter |
| T-03 | gatherContext follows links from matched pages |
| T-04 | gatherContext deduplicates pages |
