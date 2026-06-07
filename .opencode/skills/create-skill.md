# Create Skill

**Name:** create-skill
**Version:** 1.0.0
**Triggers:** "create a skill", "add a skill", "nova skill", "criar uma skill", "create skill"

## Purpose

Guide to create new, standardized skills for this project. Skills are agent instructions stored in `.opencode/skills/` that teach agents how to perform specific project tasks.

## Instructions

### Step 1: Gather Requirements

Ask the user:
- What should this skill do? (1-2 sentence purpose)
- When should it trigger? (keywords, phrases, or scenarios)
- Does it need access to specific project files or directories?
- Should it follow a particular spec template from `.specs/templates/`?

### Step 2: Read Context

Read these files for project-wide context:
- `AGENTS.md` — overall project conventions and structure
- `.specs/memory/conventions.md` — detailed coding patterns
- `.specs/memory/architecture.md` — architectural decisions (ADRs)

### Step 3: Choose File Path

Skills go in `.opencode/skills/<skill-name>.md`.
- Use **kebab-case** names (e.g., `create-migration`, `fix-encoding`)
- Name should describe what the skill DOES, not what it IS

### Step 4: Write the Skill File

Use this template:

```markdown
# <Skill Title>

**Name:** <skill-name>
**Version:** 1.0.0
**Triggers:** <comma-separated trigger phrases or keywords>

## Purpose

<1-2 sentences describing what this skill accomplishes.>

## Prerequisites

<Any context files the agent should read before following this skill.>

## Instructions

### Step 1: <Clear Action Name>

<What the agent should do. Be specific and actionable.>

### Step 2: <Clear Action Name>

<What the agent should do.>

## Output

<What the agent should produce or report back to the user.>

## Examples

### Example 1: <Scenario Description>

**User says:** "<trigger phrase>"

**Agent should:**
1. <step>
2. <step>

## References

- AGENTS.md
- `.specs/memory/conventions.md`
- `.specs/templates/<relevant-template>.md`
```

### Step 5: Validate

Before confirming, check:
- [ ] Triggers are **distinct** from other existing skills (check `.opencode/skills/`)
- [ ] Instructions are **actionable** (no vague "figure it out" steps)
- [ ] At least **one example** is provided
- [ ] References section lists relevant `.specs/` files

### Step 6: Confirm with User

Show the skill content and ask if triggers are correct and if any steps are missing.

## Output

The created `.md` file in `.opencode/skills/`. Report the file path to the user.

## Examples

### Example 1: Creating a migration skill

**User says:** "create a skill for database migrations"

**Agent should:**
1. Ask: what kind of migrations? (schema, data, framework?)
2. Read `AGENTS.md` and `.specs/memory/architecture.md`
3. Note that migration specs use `.specs/templates/migration-spec.md`
4. Write skill that guides agent to: create spec first, then implement, then validate
5. Place at `.opencode/skills/create-migration.md`

### Example 2: Creating a code review skill

**User says:** "add a skill for reviewing code"

**Agent should:**
1. Ask: what to review? (frontend? backend? both?)
2. Read `.specs/memory/conventions.md` for style rules
3. Write skill that checks conventions, patterns, edge cases
4. Place at `.opencode/skills/review-code.md`

## References

- `AGENTS.md` — project overview and conventions
- `.specs/memory/conventions.md` — detailed code conventions
- `.specs/memory/architecture.md` — architectural decisions
- `.opencode/skills/` — existing skills directory
