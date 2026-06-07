# TDD Workflow

**Name:** tdd-workflow
**Version:** 1.0.0
**Triggers:** "write tests", "TDD", "test first", "red green refactor", "test driven", "escrever testes", "teste primeiro"

## Purpose

Guide agents through the Test-Driven Development cycle integrated with the spec-driven methodology. Ensures tests are always written before implementation code.

## Prerequisites

- `AGENTS.md` — project conventions and test commands
- `.specs/memory/conventions.md` — testing conventions
- `.specs/memory/architecture.md` — ADR-002 (TDD)
- The active spec in `.specs/changes/<nnn>-<slug>/spec.md`

## Instructions

### Step 1: Read the Spec

Read the active spec's `## Tests` section (or `## Regression Test` for bugfixes). Extract:
- All test case IDs (TEST-01, TEST-02, ...)
- Test types (unit, integration, e2e)
- Expected behaviors
- Test file locations

### Step 2: Set Up Test Infrastructure

Check if test files already exist at the paths specified in the spec.
- If they exist: append new test cases
- If they don't: create the test file using the project's test file convention from `conventions.md`

### Step 3: Write Tests (RED Phase)

Write exactly the test cases defined in the spec:
1. Each test must have a descriptive name following: `should <expected behavior> when <condition>`
2. Tests must be independent (no shared mutable state)
3. For bugfixes: the regression test must faithfully reproduce the bug
4. Use existing test utilities, mocks, and fixtures already present in the project

**CRITICAL:** Do NOT write any implementation code yet. Only tests.

### Step 4: Verify Tests Fail (RED)

Run the tests:
```
<TEST_COMMAND>
```

All new tests must FAIL. If any pass without implementation:
- The test might not be testing the right thing
- The feature might already exist (re-evaluate the spec)

Report failures to the user: "X tests written, all failing as expected (Red phase)."

### Step 5: Implement (GREEN Phase)

Write the minimum implementation code to make all tests pass:
1. Follow the spec's `## Design` and `## Requirements` sections
2. Follow coding conventions from `AGENTS.md` and `conventions.md`
3. Do NOT over-engineer — write only what makes tests pass
4. Handle all states: loading, empty, error, success (see spec's `## Design > States`)

### Step 6: Verify Tests Pass (GREEN)

Run the tests again:
```
<TEST_COMMAND>
```

All tests must PASS. If any fail:
- Fix the implementation (not the test)
- Re-run until all green

Report: "All tests passing (Green phase)."

### Step 7: Refactor

Clean up the implementation:
1. Remove duplication
2. Improve readability
3. Ensure naming follows conventions
4. Verify ALL tests still pass after refactoring

Report: "Refactored. All tests still passing."

### Step 8: Run Full Test Suite

Run the entire test suite (including coverage):
```
<TEST_COVERAGE_COMMAND>
```

Verify:
- No regressions in existing tests
- Coverage threshold met (`{COVERAGE_THRESHOLD}%`)

### Step 9: Update Spec Checklist

Mark these items as complete in the spec:
- `[x] Tests written BEFORE implementation (Red phase)`
- `[x] All tests passing (Green phase)`
- `[x] Code refactored without breaking tests (Refactor phase)`
- `[x] Coverage meets threshold`

## Output

After completing the cycle, report:
1. Number of tests written
2. Number of tests passing
3. Coverage percentage (if available)
4. Files created/modified
5. Any edge cases discovered during implementation that should be added to the spec

## Examples

### Example 1: Feature Implementation

**User says:** "Implement the spec at .specs/changes/001-search-fields/"

**Agent should:**
1. Read `spec.md` → find 5 test cases in `## Tests`
2. Create `{Component}.test.{EXT}` with 3 unit tests
3. Create `{module}.test.{EXT}` with 2 integration tests
4. Run tests → all 5 fail (Red)
5. Implement `{Component}.{EXT}` and `{module}.{EXT}`
6. Run tests → all 5 pass (Green)
7. Refactor → extract helper function
8. Run full suite → coverage 85% meets 80% threshold
9. Update spec checklist

### Example 2: Bugfix

**User says:** "Fix the encoding bug from FIX-002"

**Agent should:**
1. Read `spec.md` → find `## Regression Test` section
2. Write test that reproduces the bug (special characters not displaying)
3. Run test → FAILS (Red)
4. Fix encoding in the 3 affected files
5. Run test → PASSES (Green)
6. Run full suite → no regressions
7. Update spec checklist

## References

- `AGENTS.md` — project overview, test commands, conventions
- `.specs/memory/conventions.md` — testing standards and patterns
- `.specs/memory/architecture.md` — ADR-002 (TDD)
- `.specs/templates/feature-spec.md` — feature spec template with test section
- `.specs/templates/bugfix-spec.md` — bugfix spec with regression test
- `.specs/templates/test-spec.md` — test-only spec template
