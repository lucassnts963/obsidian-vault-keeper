# Spec Template: Feature

| Field | Value |
|---|---|
| **ID** | CHG-<nnn> |
| **Status** | draft | review | approved | implemented |
| **Author** | <name> |
| **Created** | <YYYY-MM-DD> |
| **Approved** | <YYYY-MM-DD> |

## Context

Why is this feature needed? What problem does it solve? What user scenario triggers this?

## Scope

What IS included in this change.

### Out of Scope

What is explicitly NOT included — avoid scope creep.

## Requirements

### Functional

- [ ] REQ-01: <description>
- [ ] REQ-02: <description>

### Non-Functional

- [ ] NFR-01: <performance, security, accessibility, etc.>

### Technical

| Layer | File / Component | Change Description |
|---|---|---|
| {LAYER} | `<file path>` | <what changes> |
| {LAYER} | `<file path>` | <what changes> |

## Design

### States (UI)

> Applicable for visual interfaces. Skip for API/headless features.

| State | Behavior |
|---|---|
| Loading | <spinner, skeleton, etc.> |
| Empty | <message when no data> |
| Error | <error display> |
| Success | <normal render> |

### User Interaction Flow

1. User <action>
2. System <response>
3. ...

### Edge Cases

- <case 1>: <how handled>
- <case 2>: <how handled>

## Risks

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| <risk> | Low / Med / High | Low / Med / High | <plan> |

## Dependencies

- <dependency on another spec or system>

## Requirements Traceability

> Links this implementation spec back to the requirements document.

| REQ ID | Source (requirements/) | Requirement Summary | Priority | Acceptance Criteria |
|---|---|---|---|---|
| REQ-01 | requirements/<nnn>-<slug>/ | <summary> | Must | <criterion> |
| REQ-02 | requirements/<nnn>-<slug>/ | <summary> | Should | <criterion> |

## Tests

> **TDD:** Write these tests BEFORE implementation. Tests must fail (Red) before code exists.

### Test Cases

| ID | Test | Type | Description |
|---|---|---|---|
| TEST-01 | `<test name>` | unit / integration / e2e | `<what it validates>` |
| TEST-02 | `<test name>` | unit / integration / e2e | `<what it validates>` |

### Test Files

| File | What It Covers |
|---|---|
| `<test file path>` | `<components or logic tested>` |

---

## Validation Checklist

- [ ] Tests written BEFORE implementation (Red phase)
- [ ] All tests passing (Green phase)
- [ ] Code refactored without breaking tests (Refactor phase)
- [ ] Coverage meets threshold ({COVERAGE_THRESHOLD}%)
- [ ] Requirements met
- [ ] States handled (loading, empty, error, success)
- [ ] Edge cases tested
- [ ] No regression in related features
- [ ] Code follows conventions

## Notes

<decisions, tradeoffs, references>
