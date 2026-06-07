# Spec Template: Test Coverage

| Field | Value |
|---|---|
| **ID** | TST-<nnn> |
| **Status** | draft | review | approved | implemented |
| **Author** | <name> |
| **Created** | <YYYY-MM-DD> |
| **Approved** | <YYYY-MM-DD> |

## Context

What area of the codebase needs test coverage? Why is it untested? What risk does that pose?

## Scope

### In Scope

- <module, component, or feature to be tested>

### Out of Scope

- <explicitly excluded areas>

## Test Plan

### Unit Tests

| ID | File Under Test | Test Description | Expected Behavior |
|---|---|---|---|
| UT-01 | `<path>` | `<scenario>` | `<expected result>` |
| UT-02 | `<path>` | `<scenario>` | `<expected result>` |

### Integration Tests

| ID | Modules Involved | Test Description | Expected Behavior |
|---|---|---|---|
| IT-01 | `<module A> → <module B>` | `<scenario>` | `<expected result>` |
| IT-02 | `<module A> → <module B>` | `<scenario>` | `<expected result>` |

### E2E Tests

| ID | User Flow | Test Description | Expected Behavior |
|---|---|---|---|
| E2E-01 | `<flow>` | `<scenario>` | `<expected result>` |

## Test Files to Create

| File | Type | Covers |
|---|---|---|
| `<test file path>` | unit / integration / e2e | `<what>` |

## Edge Cases

| Case | Expected Behavior | Test ID |
|---|---|---|
| <case> | <behavior> | <TEST-XX> |

## Dependencies

- <existing test utils, mocks, fixtures needed>

## Risks

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| <risk> | Low / Med / High | Low / Med / High | <plan> |

## Validation Checklist

- [ ] All planned test files created
- [ ] All tests passing (Green)
- [ ] Coverage threshold met ({COVERAGE_THRESHOLD}%)
- [ ] Edge cases covered
- [ ] No flaky tests
- [ ] Tests are deterministic and independent
- [ ] Regression from existing tests: none

## Notes

<additional context, coverage gaps, future test needs>
