# Requirements Specification

| Field | Value |
|---|---|
| **ID** | REQ-<nnn> |
| **Status** | draft | review | approved |
| **Author** | <name> |
| **Created** | <YYYY-MM-DD> |
| **Stakeholders** | <names and roles> |

---

## 1. Problem Statement

### Current Situation

What is happening now? Describe the existing state, process, or gap.

### Why This Matters

What is the cost of inaction? Impact on users, business, or systems.

### Success Definition

How will we know this is solved? Be specific and measurable.

| Metric | Current | Target |
|---|---|---|
| <metric> | <current value> | <target value> |

---

## 2. Stakeholder Map

| Stakeholder | Role | Interest | Influence (High/Med/Low) | Key Concern |
|---|---|---|---|---|
| <name> | <role> | <what they need> | High | <main concern> |

---

## 3. Methodology

> Select the approach(es) that best fit this requirement. You may combine methodologies.

| Methodology | When to Use | Section to Fill |
|---|---|---|
| **User Stories** | End-user facing features | Section 4.1 |
| **Use Cases** | Complex interactions, multiple actors | Section 4.2 |
| **Job Stories** | Situational/task-driven features | Section 4.3 |
| **BDD Scenarios** | Behavior-driven, acceptance testing | Section 4.4 |

---

## 4. Requirements

### 4.1 User Stories

| ID | Story | Acceptance Criteria |
|---|---|---|
| US-01 | As a `<role>`, I want `<action>` so that `<benefit>` | 1. `<criterion>` 2. `<criterion>` |
| US-02 | As a `<role>`, I want `<action>` so that `<benefit>` | 1. `<criterion>` 2. `<criterion>` |

### 4.2 Use Cases

| ID | Title | Primary Actor |
|---|---|---|
| UC-01 | `<title>` | `<actor>` |

**UC-01: `<title>`**

| Field | Value |
|---|---|
| **Actor** | `<who initiates>` |
| **Pre-condition** | `<what must be true before>` |
| **Post-condition** | `<what must be true after>` |
| **Trigger** | `<what starts this use case>` |

**Main Flow:**
1. Actor `<action>`
2. System `<response>`
3. ...

**Alternative Flows:**
- **Alt-01:** `<condition>` → `<alternative path>`
- **Alt-02:** `<condition>` → `<alternative path>`

**Exception Flows:**
- **Exc-01:** `<error condition>` → `<error handling>`

### 4.3 Job Stories

| ID | Story |
|---|---|
| JS-01 | When `<situation>`, I want `<motivation>` so that `<expected outcome>` |
| JS-02 | When `<situation>`, I want `<motivation>` so that `<expected outcome>` |

### 4.4 BDD Scenarios

```gherkin
Feature: <feature name>
  As a <role>
  I want <action>
  So that <benefit>

  Scenario: <scenario name>
    Given <precondition>
    When <action>
    Then <expected result>

  Scenario: <edge case>
    Given <context>
    When <action>
    Then <expected result>
```

---

## 5. Functional Requirements

| ID | Description | Source | Priority (MoSCoW) |
|---|---|---|---|
| REQ-01 | <the system must...> | US-01 / UC-01 | Must |
| REQ-02 | <the system must...> | US-02 | Should |
| REQ-03 | <the system must...> | US-01 | Could |

---

## 6. Non-Functional Requirements

| ID | Category | Description | Measurement |
|---|---|---|---|
| NFR-01 | Performance | <requirement> | <how to measure> |
| NFR-02 | Security | <requirement> | <how to measure> |
| NFR-03 | Accessibility | <requirement> | <how to measure> |
| NFR-04 | Usability | <requirement> | <how to measure> |
| NFR-05 | Compliance | <requirement> | <how to measure> |

---

## 7. Constraints

| ID | Constraint | Type | Impact |
|---|---|---|---|
| C-01 | <constraint description> | Technical / Budget / Timeline / Regulatory | <what it limits> |

---

## 8. Assumptions

| ID | Assumption | Validation Needed? | Risk if Wrong |
|---|---|---|---|
| A-01 | <what we assume to be true> | Yes / No | <consequence> |

---

## 9. Out of Scope

What is explicitly NOT included in this requirement:

- <item 1>
- <item 2>
- <item 3>

---

## 10. MoSCoW Prioritization

| Priority | Requirements | Rationale |
|---|---|---|
| **Must have** | REQ-01, REQ-03 | <why essential for launch> |
| **Should have** | REQ-02 | <important but not critical> |
| **Could have** | — | <nice to have, if time allows> |
| **Won't have (now)** | — | <deferred to future iteration> |

---

## 11. Dependencies

| Dependency | Type | Status | Impact if Unavailable |
|---|---|---|---|
| <system, team, or spec> | Internal / External / Third-party | Available / Blocked | <what breaks> |

---

## 12. Domain Glossary

| Term | Definition | Context |
|---|---|---|
| `<term>` | <what it means in this domain> | <where it applies> |

---

## 13. Risks & Mitigations

| Risk | Likelihood (Low/Med/High) | Impact (Low/Med/High) | Mitigation |
|---|---|---|---|
| <risk> | Med | High | <how to prevent or reduce> |

---

## 14. Traceability Matrix

> This connects requirements to stories and tests. Fill test IDs after the spec is written.

| REQ ID | Source (US/UC/JS) | Requirement Summary | Priority | Implementation Spec | Test ID |
|---|---|---|---|---|---|
| REQ-01 | US-01 | `<summary>` | Must | changes/<nnn>-<slug>/ | — |
| REQ-02 | US-02 | `<summary>` | Should | changes/<nnn>-<slug>/ | — |

---

## 15. Appendix

### Research & References
- <links, competitor analysis, reference docs>

### Interview Notes
- <stakeholder interview summaries>

### Open Questions
- [ ] <question not yet resolved>
- [ ] <question not yet resolved>

---

## Validation Checklist

- [ ] All stakeholders identified
- [ ] Methodology chosen and section(s) filled
- [ ] Functional requirements documented with sources
- [ ] Non-functional requirements defined with measurements
- [ ] Constraints and assumptions listed
- [ ] MoSCoW prioritization complete
- [ ] Dependencies identified
- [ ] Risks assessed with mitigations
- [ ] Out of scope explicitly defined
- [ ] Traceability matrix populated
- [ ] Stakeholders reviewed and approved
