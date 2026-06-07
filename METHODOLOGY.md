# Methodology Guide: Spec-Driven Development

## Overview

This methodology structures software development around **specification documents** (specs) that precede implementation. It combines:

- **Spec-driven workflow** — write what to build before building it
- **Architectural Decision Records** (ADRs) — document why decisions were made
- **Agent-friendly conventions** — structure your project so AI agents can work effectively
- **Custom skills** — reusable instructions for common project tasks

This guide is extracted from the **Horizon** project, where the methodology was developed and proven.

---

## 1. The Directory Structure

Every project following this methodology has:

```
project/
├── .opencode/
│   └── skills/                  # Custom agent skills
│       └── create-skill.md      # How to create new skills (always first)
│
├── .specs/
│   ├── requirements/            # Requirements documents (elicitation & analysis)
│   │   └── <nnn>-<slug>/
│   │       └── requirements.md
│   │
│   ├── templates/               # Reusable spec templates
│   │   ├── feature-spec.md      # For new features
│   │   ├── migration-spec.md    # For schema/database changes
│   │   └── bugfix-spec.md       # For bug corrections
│   │
│   ├── changes/                 # Active specs (one folder per change)
│   │   └── <nnn>-<slug>/
│   │       └── spec.md
│   │
│   ├── archive/                 # Completed specs
│   │
│   ├── memory/                  # Persistent project knowledge
│   │   ├── architecture.md      # Architectural decisions (ADRs)
│   │   ├── conventions.md       # Code conventions
│   │   └── glossary.md          # Terminology / entity map
│   │
│   └── shared/                  # Reference documents
│       ├── schema-current.md    # Current database schema
│       ├── schema-target.md     # Target / future schema
│       └── entity-map.md        # Column-level migration mapping
│
└── AGENTS.md                    # Project overview & agent instructions
```

### Starter Kit

A ready-to-use template is provided in `starter-kit/`. Clone or copy it to bootstrap a new project with the full structure plus blank templates with placeholder markers like `{PROJECT_NAME}`, `{STYLING_APPROACH}`, etc.

---

## 2. Requirements Engineering

Before writing a spec, requirements must be elicited, analyzed, and documented. This phase lives in `.specs/requirements/`.

### Full Lifecycle

```
IDEA (raw problem or opportunity)
  → ELICITATION (gather requirements from stakeholders)
    → ANALYSIS (prioritize, resolve conflicts, identify dependencies)
      → REQUIREMENTS DOC (requirements-spec.md in requirements/<nnn>-<slug>/)
        → SPECIFICATION (spec.md in changes/<nnn>-<slug>/)
          → IMPLEMENTATION (TDD: Red → Green → Refactor)
            → VALIDATION (tests pass, stakeholder sign-off)
              → ARCHIVE
```

### Directory Flow

```
.specs/requirements/<nnn>-<slug>/requirements.md   (Phase: Elicitation & Analysis)
    →  .specs/changes/<nnn>-<slug>/spec.md          (Phase: Specification & Implementation)
        →  .specs/archive/<nnn>-<slug>/             (Phase: Completed)
```

The same `<nnn>` number is used across directories for full traceability: from requirements → spec → archive.

### Elicitation Methodologies

The engineer chooses the best fit for each requirement. Supported approaches:

| Methodology | Format | When to Use |
|---|---|---|
| **User Stories** | `As a <role>, I want <action>, so that <benefit>` | End-user facing features |
| **Use Cases** | Actor, Pre/Post conditions, Main Flow, Alternatives, Exceptions | Complex multi-actor interactions |
| **Job Stories** | `When <situation>, I want <motivation>, so that <outcome>` | Situational or task-driven needs |
| **BDD / Gherkin** | `Given <context>, When <action>, Then <result>` | Behavior-driven, testable at acceptance level |
| **Hybrid** | Mix & match any combination | Complex domains with varied needs |

### Requirements Document Structure

The `requirements-spec.md` template includes:

| Section | Purpose |
|---|---|
| **Problem Statement** | Current situation, cost of inaction, success metrics |
| **Stakeholder Map** | Who is impacted, power vs. interest |
| **Methodology** | Which approach(es) were chosen |
| **Requirements** | User stories, use cases, job stories, or BDD scenarios |
| **Functional Requirements** | Formal REQ-XX with sources and priority |
| **Non-Functional Requirements** | Performance, security, accessibility, compliance |
| **Constraints & Assumptions** | Limits and premises |
| **MoSCoW** | Must / Should / Could / Won't have |
| **Dependencies** | External systems, teams, blocking specs |
| **Domain Glossary** | Terms and definitions |
| **Risks & Mitigations** | What can go wrong and how to prevent |
| **Traceability Matrix** | REQ → Story → Spec → Test |
| **Appendix** | Research, interview notes, open questions |

### Requirements → Spec Transition

When requirements are approved:
1. The requirement document stays in `requirements/<nnn>-<slug>/`
2. A new spec is created in `changes/<nnn>-<slug>/` using the **same number**
3. The spec's `## Requirements Traceability` section links back to the requirements document
4. Stories/use cases from requirements are broken into technical tasks in the spec

### Skill

Use the `requirements-gathering` skill (`"levantar requisitos"`, `"requirements"`) to guide the elicitation process interactively.

### When to Skip

Not every change needs formal requirements. Skip this phase when:
- The change is purely technical (refactoring, dependency update)
- The change is a bugfix with clear reproduction steps (use `bugfix-spec.md` directly)
- The change is a database migration with clear schema mapping (use `migration-spec.md` directly)

---

## 3. The Spec Workflow

### Step-by-Step

```
0. ELICIT REQUIREMENTS (if applicable)
   Use requirements-spec.md in .specs/requirements/<nnn>-<slug>/
   Choose methodology: User Stories, Use Cases, Job Stories, or BDD
   See Section 2 for full details.

1. IDENTIFY NEED
   A feature, bugfix, or migration is needed.
   
2. CREATE SPEC FOLDER
   .specs/changes/<sequential-number>-<kebab-slug>/
   Example: .specs/changes/001-search-fields/
   
3. WRITE SPEC
   Use the appropriate template from .specs/templates/.
   Fill in: context, scope, requirements, design, risks, checklist.
   
4. REVIEW & APPROVE
   Stakeholders review the spec. Status: draft → review → approved.
   
5. IMPLEMENT
   Follow the spec's requirements and checklist.
   Update checklist items as work progresses.
   
6. VALIDATE
   All checklist items checked? Build passes? Tests pass?
   
7. ARCHIVE
   Move the spec folder from changes/ to archive/.
   
8. UPDATE MEMORY
   If new architectural decisions were made, add them to memory/architecture.md.
   If conventions changed, update memory/conventions.md.
```

### Naming Convention

- Folders: `changes/<sequential-number>-<kebab-slug>/`
- The number is sequential across the project lifetime
- The slug is a short description
- Examples: `001-search-fields`, `002-fix-encoding`, `003-migration-foundation`

### Spec Statuses

| Status | Meaning |
|---|---|
| `draft` | Initial write-up, not yet reviewed |
| `review` | Under stakeholder review |
| `approved` | Ready for implementation |
| `implemented` | Code is done, checks pass |

---

## 4. TDD Integration (Test-Driven Development)

This methodology combines spec-driven development with TDD. Tests are written **before** implementation code — always.

### Combined Workflow

```
1. IDENTIFY NEED
   A feature, bugfix, or migration is needed.

2. CREATE SPEC FOLDER
   .specs/changes/<sequential-number>-<kebab-slug>/

3. WRITE SPEC
   Use the appropriate template from .specs/templates/.
   Must include the `## Tests` section with test case definitions.

4. RED (Write Failing Tests)
   Write tests that correspond to the spec's test cases.
   All tests must FAIL at this stage — proving they catch missing functionality.

5. GREEN (Implement)
   Write minimum code to make all tests pass.
   All tests must PASS — proving the implementation meets the spec.

6. REFACTOR
   Clean up code without changing behavior.
   All tests must still PASS — proving no regressions.

7. REVIEW & APPROVE
   Stakeholders review the passing code. Status: draft → review → approved.

8. VALIDATE
   All checklist items checked? Build passes? All tests pass? Coverage threshold met?

9. ARCHIVE
   Move the spec folder from changes/ to archive/.

10. UPDATE MEMORY
    If new architectural decisions were made, add them to memory/architecture.md.
```

### TDD Rules

| Rule | Description |
|---|---|
| **Test First** | Never write implementation before tests. No exceptions. |
| **Red → Green → Refactor** | Each requirement follows this cycle independently |
| **Regression Tests for Bugs** | Every bugfix starts with a test that reproduces the bug |
| **Coverage Threshold** | Code coverage must meet or exceed `{COVERAGE_THRESHOLD}%` |
| **Tests Are Spec Artifacts** | Test cases are documented in the spec before implementation |

### TDD Spec Templates

| Template | Test Section | When Tests Are Written |
|---|---|---|
| `feature-spec.md` | `## Tests` | After spec approval, before implementation |
| `bugfix-spec.md` | `## Regression Test` | First thing — must reproduce the bug (Red) |
| `migration-spec.md` | `## Tests` | Schema + data integrity tests before migration |
| `test-spec.md` | Full spec for test coverage | When adding tests to existing code |

---

## 5. Spec Templates

### Feature Spec (`feature-spec.md`)

Use for: new features, UI changes, functional additions.

Key sections:
- **Context**: why this feature? what problem?
- **Scope**: what's included, what's explicitly NOT included
- **Requirements**: functional (REQ-01...), non-functional (NFR-01...), technical
- **Design**: frontend states (loading/empty/error/success), user flow, edge cases
- **Risks**: likelihood, impact, mitigation
- **Validation Checklist**: measurable pass/fail items

### Migration Spec (`migration-spec.md`)

Use for: schema changes, database migrations, data transformations.

Key sections:
- **Entity Mapping**: source → target with notes
- **Tables**: create, alter, drop with full column definitions
- **Data Migration**: order, transformation rules, validation queries
- **Rollback Plan**: how to undo if it fails

### Bugfix Spec (`bugfix-spec.md`)

Use for: correcting bugs.

Key sections:
- **Reproduction**: exact steps to trigger
- **Expected vs Actual**: what should happen vs what happens
- **Root Cause**: the underlying issue
- **Fix**: files to change, code changes
- **Side Effects**: what else could this affect?

---

## 6. Memory Documents

### `architecture.md` — Architecture Decision Records (ADRs)

Every significant technical decision gets recorded:

```markdown
## ADR-001: <Decision Title>
- Date: YYYY-MM-DD
- Status: Accepted | Proposed | Deprecated

**Context:** <Why was a decision needed?>
**Decision:** <What was decided?>
**Consequences:** <Trade-offs and impact>
```

ADRs serve as institutional memory. When someone asks "why is X built this way?", the answer is here.

### `conventions.md` — Code Conventions

Document your project's coding standards:
- Styling approach (inline CSS, Tailwind, etc.)
- Component patterns
- State management
- Form patterns
- Data fetching pattern
- Naming conventions
- Repository structure

### `glossary.md` — Terminology & Entity Map

Map between different terminologies:
- Domain terms across languages ({LANG_A} ↔ {LANG_B})
- Column name translations
- Status value mappings
- Legacy ↔ modern table names

---

## 7. `shared/` — Reference Documents

### `schema-current.md`

Full documentation of the current database schema:
- Every table with all columns, types, constraints
- Seed data
- Indexes
- Foreign key relationships

### `schema-target.md`

The schema you're migrating toward:
- Tables with 🔧 (needs changes) or 🆕 (must create)
- Column additions documented with reason
- Migration execution order

### `entity-map.md`

Column-level mapping from current → target:
- Every source column mapped to its destination
- Transformation rules
- What's dropped and why

---

## 8. `AGENTS.md` — The Agent Instruction File

This is the single most important file for AI-assisted development. It should contain:

1. **Overview** — project name, tech stack, language
2. **Directory structure** — full tree with annotations
3. **Commands** — dev, build, test, lint
4. **Architecture** — data flow, routing, auth
5. **Coding conventions** — styling, state, forms, filtering patterns
6. **Database** — tables, seed data, schema references
7. **Key features** — core workflows explained
8. **Known gaps** — missing CRUD, scaffolded features, pending work
9. **Future plans** — migrations, new schemas, planned additions
10. **Observations for agents** — critical rules agents must follow

The AGENTS.md is **living documentation** — update it when conventions change, new ADRs are written, or features are completed.

---

## 9. Custom Skills (`skills/`)

Skills are Markdown files that teach AI agents how to perform specific project tasks.

### Anatomy of a Skill

```markdown
# <Skill Title>

**Name:** <skill-name>
**Version:** 1.0.0
**Triggers:** <when to use this skill>

## Purpose
<1-2 sentences>

## Instructions
### Step 1: <action>
<specific guidance>

## Examples
<real-world scenario walkthrough>

## References
AGENTS.md, .specs/memory/conventions.md, ...
```

### The `create-skill` Skill

Always the first skill in any project. It teaches agents how to create new skills following the project's conventions.

### When to Create Skills

- Repetitive tasks (e.g., "create a CRUD endpoint", "add a search field")
- Domain-specific patterns (e.g., "add a new report", "create a dashboard tile")
- Compliance checks (e.g., "review for security", "validate conventions")
- Code generation (e.g., "generate data model from SQL", "create UI form from type definition")

---

## 10. Bootstrap Checklist

When starting a new project with this methodology:

1. [ ] Copy everything from this starter-kit to your new project root
2. [ ] Run the `init-project` skill (`"start project"`) to fill in project decisions
3. [ ] Fill in `AGENTS.md` with project specifics (replace `{PLACEHOLDERS}`)
4. [ ] Fill in `.specs/memory/conventions.md` with your coding standards
5. [ ] Fill in `.specs/shared/schema-current.md` with your DB schema
6. [ ] Create your first skill in `.opencode/skills/` (use `create-skill`)
7. [ ] Write your first ADR in `.specs/memory/architecture.md`
8. [ ] Begin spec-driven: create `.specs/requirements/001-init/` for your first requirements

---

## 11. Real-World Template

> **FILL THIS IN** when your project has accumulated enough specs and ADRs. Replace the examples below with your own.

The **{PROJECT_NAME}** project ({FULL_TECH_STACK}) adopted this methodology with these results:

### Specs Created
| ID | Title | Outcome |
|---|---|---|
| 001 | {FIRST_SPEC_TITLE} | {SUMMARY_OF_CHANGES} |
| 002 | {SECOND_SPEC_TITLE} | {SUMMARY_OF_CHANGES} |

### ADRs Written
- ADR-001: {FIRST_ADR_TITLE}
- ADR-002: {SECOND_ADR_TITLE}
- ...

### Key Pattern
Every spec follows: **draft → approved → implemented → archived**. The `memory/` folder grows with each ADR, building institutional knowledge that outlives any single developer.

---

## 12. Why This Works

- **No ambiguity**: specs define exactly what to build before coding starts
- **Traceability**: every change has a spec with context, decisions, and validation
- **Knowledge retention**: ADRs persist after developers leave
- **AI-friendly**: `AGENTS.md` + `skills/` give AI agents the full project context
- **Incremental**: start small (one spec, one ADR), grow organically
- **Portable**: the methodology is 100% file-based — works with any language, any framework, any Git host
