# Spec Template: Bugfix

| Field | Value |
|---|---|
| **ID** | FIX-<nnn> |
| **Status** | draft | review | approved | implemented |
| **Author** | <name> |
| **Created** | <YYYY-MM-DD> |
| **Approved** | <YYYY-MM-DD> |

## Context

When was the bug discovered? What is affected?

## Reproduction

Steps to reproduce the bug:
1. <step>
2. <step>
3. <step>

## Expected Behavior

What should happen.

## Actual Behavior

What actually happens.

## Root Cause

Why the bug occurs — the underlying issue in code or data.

## Regression Test

> **TDD Rule:** Write this test FIRST — it must fail (Red) before the fix is applied, then pass (Green) after.

### Test File
`<test file path>`

### Test Description
```<language>
// Test that reproduces the bug (should FAIL before fix)
<test code>
```

### Expected After Fix
- Test passes
- Original behavior remains unchanged for non-buggy scenarios

---

## Fix

### Files to Change
| File | Change |
|---|---|
| `<path>` | <description of change> |

### Code Changes
<before/after or logic description>

## Side Effects

Could this fix affect other features?

- <potential side effect 1>
- <potential side effect 2>

## Validation Checklist
- [ ] Regression test written and FAILING (Red)
- [ ] Fix applied, regression test PASSING (Green)
- [ ] Bug no longer reproduces
- [ ] No regression in related features
- [ ] Edge cases considered
- [ ] Code follows conventions

## Notes
<additional observations, affected users, urgency>
