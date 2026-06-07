# Requirements Gathering

**Name:** requirements-gathering
**Version:** 1.0.0
**Triggers:** "requirements", "levantar requisitos", "elicitation", "análise de requisitos", "user stories", "use cases", "casos de uso", "gather requirements", "levantamento"

## Purpose

Guide the requirements elicitation process — from a raw idea or problem statement to a structured requirements document. Supports multiple methodologies (User Stories, Use Cases, Job Stories, BDD) and lets the engineer choose the best fit.

## Prerequisites

- `METHODOLOGY.md` — full methodology reference
- `.specs/templates/requirements-spec.md` — the requirements template
- `AGENTS.md` — project context and conventions

## Instructions

### Step 1: Determine Starting Point

Ask the user to describe where they are:

```
"Do you have a concrete idea/problem, or are you starting from scratch?"

Options:
- "I have a problem to solve" → go to Step 2A
- "I'm exploring / brainstorming" → go to Step 2B
```

### Step 2A: Elicitation from a Problem

Ask sequentially:

1. **"Describe the problem or need in 2-3 sentences."**
   - Capture the raw description verbatim in the `## 1. Problem Statement` section.

2. **"What happens if we do nothing? What is the cost of inaction?"**
   - Fill `### Why This Matters`.

3. **"How would you measure success? What metrics should change?"**
   - Fill `### Success Definition` table.

4. **"Who is affected by this problem or its solution? List everyone."**
   - Build the `## 2. Stakeholder Map` table. Ask for each: name, role, interest, influence level, key concern.

### Step 2B: Exploration / Brainstorming

If starting from scratch:

1. **"What domain or area are we working in?"** (e.g., e-commerce, healthcare, internal tool)

2. **"Who are the potential users? What do they do today?"**

3. **"What frustrates them about the current process?"**

4. **"What competitors or alternatives exist? What do they do well / poorly?"**

5. **"If you could wave a magic wand, what would the ideal solution do?"**

6. From the answers, synthesize a problem statement and present it back to the user for confirmation:
   ```
   "Based on what you described, the core problem seems to be:
   [synthesized statement]
   
   Does this capture it correctly?"
   ```

7. After confirmation, fill `## 1. Problem Statement`.

### Step 3: Choose Methodology

Present the options and let the engineer decide:

```
"Which requirements methodology fits best for this?"

Options:
1. User Stories (As a <role>, I want <action>, so that <benefit>)
2. Use Cases (Actor, Pre-condition, Main Flow, Alternatives, Exceptions)
3. Job Stories (When <situation>, I want <motivation>, so that <outcome>)
4. BDD / Gherkin (Given / When / Then scenarios)
5. Hybrid — mix and match multiple approaches
```

**IMPORTANT:** Mark the chosen methodology in `## 3. Methodology` and guide the user through the corresponding section (`4.1`, `4.2`, `4.3`, or `4.4`).

### Step 4: Elicit Functional Requirements

Based on the chosen methodology, extract requirements:

**For User Stories:**
1. "For each user role, what do they need to accomplish?"
2. For each story, ask: "How will we know this works? What are the acceptance criteria?"
3. Write stories in `### 4.1 User Stories`

**For Use Cases:**
1. "Who initiates this interaction?" → Actor
2. "What must be true before it starts?" → Pre-condition
3. "Walk me through the main success scenario step by step."
4. "What could go wrong? Are there alternative paths?"
5. Write in `### 4.2 Use Cases`

**For Job Stories:**
1. "What situation triggers this need?"
2. "What is the user's motivation in that moment?"
3. "What outcome do they expect?"
4. Write in `### 4.3 Job Stories`

**For BDD:**
1. "What feature are we describing?"
2. "Walk me through a concrete scenario: Given [context], When [action], Then [result]."
3. "What about edge cases?"
4. Write in `### 4.4 BDD Scenarios`

### Step 5: Create Functional Requirements Table

Extract formal `REQ-XX` items from the stories/use cases:

1. For each story/use case, ask: "What is the core system requirement here?"
2. Fill `## 5. Functional Requirements` table
3. Link each REQ back to its source (US-01, UC-01, etc.)
4. Mark preliminary priority (will refine in Step 7)

### Step 6: Non-Functional Requirements

Ask about each category:

| Category | Prompt |
|---|---|
| **Performance** | "Any speed, load, or response time requirements?" |
| **Security** | "Any auth, encryption, or data protection needs?" |
| **Accessibility** | "Any accessibility standards (WCAG, ARIA, etc.)?" |
| **Usability** | "Ease of use requirements? Onboarding time? Error rates?" |
| **Compliance** | "Any legal or regulatory constraints (GDPR, LGPD, HIPAA, SOX)?" |

Fill `## 6. Non-Functional Requirements`.

### Step 7: Constraints, Assumptions, Scope

Ask:

1. **Constraints:** "What limits what we can build? (tech stack, budget, deadline, team size, regulatory)"
   → Fill `## 7. Constraints`

2. **Assumptions:** "What are we assuming to be true that might not be?"
   → Fill `## 8. Assumptions`

3. **Out of Scope:** "What would someone naturally expect to be included but is explicitly NOT in this requirement?"
   → Fill `## 9. Out of Scope`

### Step 8: MoSCoW Prioritization

Present the requirements list and ask:

```
"Let's prioritize. For each requirement, is it:
- Must have (won't launch without it)
- Should have (important but can wait)
- Could have (nice to have)
- Won't have this time (deferred)"

Query each REQ-XX individually or in logical groups.
```

Fill `## 10. MoSCoW Prioritization`.

### Step 9: Dependencies, Glossary, Risks

1. **Dependencies:** "What other systems, teams, or specs do we depend on?"
   → Fill `## 11. Dependencies`

2. **Glossary:** "Are there domain-specific terms we should define? Any terms that might cause confusion?"
   → Fill `## 12. Domain Glossary`

3. **Risks:** For each dependency, constraint, and assumption: "What's the worst case? How do we prevent it?"
   → Fill `## 13. Risks & Mitigations`

### Step 10: Traceability Matrix

Build `## 14. Traceability Matrix` by linking:
- REQ-XX → Source story/use case → Priority → (spec TBD) → (test TBD)

The last two columns (Implementation Spec, Test ID) remain empty — they are filled later when the spec and tests are created.

### Step 11: Assign ID and Save

1. Determine the next sequential number by checking `.specs/requirements/` for existing folders
2. Ask for a short slug: `"What short name describes this requirement? (kebab-case)"`
3. Create the folder: `.specs/requirements/<nnn>-<slug>/`
4. Save the document as `requirements.md`
5. If there are open questions in `## 15. Appendix > Open Questions`, flag them for follow-up

### Step 12: Next Steps

Report to the user:

```
## Requirements Documented — REQ-<nnn>

File: .specs/requirements/<nnn>-<slug>/requirements.md

### Summary
- Stakeholders: N identified
- Methodology: {choice}
- Functional Requirements: N (Must: X, Should: Y, Could: Z)
- Non-Functional Requirements: N
- Dependencies: N
- Risks: N

### Next Steps
1. Review and approve requirements with stakeholders
2. Move to specification: create .specs/changes/<nnn>-<slug>/spec.md
3. Use the same <nnn> number for traceability
4. Individual stories/use cases can branch into separate specs if needed
```

## Output

After completing the process, report:
1. Requirements document path
2. Summary of key decisions
3. Methodology chosen
4. Count by priority (Must/Should/Could/Won't)
5. Next step: transitioning to spec

## Examples

### Example 1: User Stories

**User says:** "levantar requisitos para um sistema de login"

**Agent should:**
1. Ask: problem? → "Users need secure access to their accounts"
2. Ask: stakeholders? → "End users, admin, security team"
3. Ask: methodology? → User chooses "User Stories"
4. Elicit: "As a user, I want to log in with email and password so that I can access my data"
5. Elicit acceptance criteria: "Invalid email shows error, locked after 5 attempts..."
6. Extract REQ-01, REQ-02 from stories
7. MoSCoW: Must = email login, Should = social login, Could = biometric
8. Save to `.specs/requirements/001-login/requirements.md`
9. Report summary

### Example 2: Use Cases + BDD

**User says:** "gather requirements for payment processing"

**Agent should:**
1. Ask: problem? → "We need to process credit card payments"
2. Ask: stakeholders? → "Buyer, seller, payment gateway, finance team"
3. Ask: methodology? → User chooses "Hybrid: Use Cases + BDD"
4. Elicit: UC-01 "Process Payment" with main/alternative/exception flows
5. Elicit BDD scenarios for happy path, declined card, timeout
6. Extract REQs, NFRs (PCI compliance, response time < 2s)
7. Save and report

## References

- `METHODOLOGY.md` — Section on Requirements Engineering
- `.specs/templates/requirements-spec.md` — template to fill
- `AGENTS.md` — project conventions and context
- `.specs/memory/glossary.md` — domain terms
