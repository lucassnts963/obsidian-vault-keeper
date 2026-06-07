# Spec Template: Migration

| Field | Value |
|---|---|
| **ID** | MIG-<nnn> |
| **Status** | draft | review | approved | implemented |
| **Author** | <name> |
| **Created** | <YYYY-MM-DD> |
| **Approved** | <YYYY-MM-DD> |

## Context

Why is this migration needed? What triggers it?

## Entity Mapping

| Source (Current) | Target (New) | Notes |
|---|---|---|
| `<source table>` | `<target table>` | <differences, transformations> |

## Changes

### Tables to Create
| Table | Columns | Purpose | Constraints |
|---|---|---|---|
| `<name>` | `<col:type, ...>` | <why> | <PK, FK, UNIQUE> |

### Tables to Alter
| Table | Operation | Column | Type | Reason |
|---|---|---|---|---|
| `<name>` | ADD / ALTER / DROP | `<col>` | `<type>` | <why> |

### Tables to Drop
| Table | Reason | Data Handling |
|---|---|---|
| `<name>` | <why> | <migrate first? archive?> |

### Indexes to Add/Remove
| Table | Index | Action | Reason |
|---|---|---|---|
| `<name>` | `<col(s)>` | CREATE / DROP | <why> |

## Data Migration

### Migration Order
Respecting foreign key constraints:
1. `<step>`
2. ...

### Transformation Rules
| Column | Source → Target | Transform |
|---|---|---|
| `<col>` | `<source.value>` → `<target.value>` | `<rule or function>` |

### Validation Queries
```sql
SELECT COUNT(*) FROM <source>; -- should match
SELECT COUNT(*) FROM <target>;
```

## Rollback Plan
1. <step>

## Risks
| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| <risk> | Low / Med / High | Low / Med / High | <plan> |

## Tests

> **TDD:** Write schema integrity and data migration tests BEFORE executing the migration.

### Schema Tests

| ID | Test | Description |
|---|---|---|
| MIG-TEST-01 | `<test name>` | `<e.g., verify new column type, FK constraint, index>` |
| MIG-TEST-02 | `<test name>` | `<e.g., verify NOT NULL constraint on new column>` |

### Data Integrity Tests

| ID | Test | Description |
|---|---|---|
| MIG-TEST-03 | `<test name>` | `<e.g., row count matches between source and target>` |
| MIG-TEST-04 | `<test name>` | `<e.g., transformed values are correct>` |

### Test Files

| File | What It Covers |
|---|---|
| `<test file path>` | `<schema or data checks>` |

---

## Validation Checklist
- [ ] Schema tests written and FAILING (Red)
- [ ] Migration executed, schema tests PASSING (Green)
- [ ] Data integrity tests PASSING
- [ ] Schema matches spec
- [ ] Foreign keys intact
- [ ] Indexes created
- [ ] Data row count matches
- [ ] Data integrity verified (spot checks)
- [ ] Application functional with new schema

## Notes
<additional context, migration script location>
