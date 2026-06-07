# Entity Map: Current → Target

## Direct Mappings

### 1. {SOURCE_TABLE} → {TARGET_TABLE}
| Source ({source_db}) | Target ({target_db}) | Notes |
|---|---|---|
| {src_col} | {tgt_col} | {transform} |

### 2. ...

## Migration Order (FK dependency respecting)

1. {table_with_no_fks}
2. {table_with_fk_to_1}
3. ...
