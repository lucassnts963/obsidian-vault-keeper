# Spec: Sync Confiável + Detecção de Conflitos

| Field | Value |
|---|---|
| **ID** | CHG-009 |
| **Status** | draft |

## Changes

| File | Change |
|---|---|
| `src/github/sync.ts` | +`detectConflicts()`, `push()` skip conflicts, `pull()` backup local modificado |
| `src/main.ts` | `doPush()`/`doSync()` adaptados para resumo de conflitos |

## New Methods

### `detectConflicts(changedFiles)` → `ConflictInfo[]`
- Para cada arquivo alterado localmente, GET `/contents/{path}?ref=main`
- Se `remote.sha !== cached.sha` → conflito
- Retorna lista de `{path, localSHA, remoteSHA}`

### `push()` modificado
```
1. Scan vault → changed[]
2. conflicts = detectConflicts(changed.map)
3. nonConflicted = changed - conflicts
4. Push nonConflicted
5. Para cada conflito: salvar backup + avisar
6. Commit logs mostra conflitos
```

### `pull()` modificado
```
1. Antes de sobrescrever arquivo:
   - Se cached.sha ≠ remote.sha AND arquivo local tem hash diferente do cached:
     → salvar como path.backup.md
   - Depois sobrescreve com remoto
```

## Tests

| ID | Test |
|---|---|
| T-01 | detectConflicts retorna vazio sem conflitos |
| T-02 | detectConflicts detecta arquivo modificado local+remoto |
| T-03 | push pula arquivo conflitado e salva backup |
| T-04 | push envia arquivo sem conflito normalmente |
| T-05 | pull salva backup de arquivo local modificado |
| T-06 | pull não salva backup se local = cached |
