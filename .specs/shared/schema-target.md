# Target Schema ({DATABASE})

{Describe the target/future schema to migrate to.}

## Legend

- ✅ = Already exists
- 🔧 = Needs modification
- 🆕 = Must be created

## Changes

### 🔧 {TABLE_1}
| Column | Type | Notes |
|---|---|---|
| {col} | {type} | {description} |
| **+ {new_col}** | {type} | *(ADDED: reason)* |

### 🆕 {NEW_TABLE}
| Column | Type | Notes |
|---|---|---|
| {col} | {type} | {description} |

## Migration Order

1. {step_1}
2. {step_2}
...
