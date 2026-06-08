# Spec: Fix Mobile Git Sync

| Field | Value |
|---|---|
| **ID** | FIX-001 |
| **Status** | implemented |
| **Author** | Lucas Santos |
| **Created** | 2026-06-07 |

## Context

O plugin usa GitHub REST API via `requestUrl()` para sync, o que é correto para mobile. Porém há 3 crashes críticos e 7 problemas de performance/robustez que impedem o uso no Obsidian Mobile (Android/iOS).

## Reproduction

1. Configurar token GitHub + remote URL nas settings do plugin no Obsidian Mobile
2. Tentar executar "Sincronizar (GitHub API)"
3. Push falha com `Maximum call stack size exceeded` em arquivos >~125KB
4. Pull falha com `atob is not defined` no WebView mobile
5. Estado de sync não persiste entre sessões (statePath incorreto)

## Expected Behavior

Sync push/pull deve funcionar em desktop e mobile sem erros, com performance aceitável.

## Actual Behavior

- **Push:** `RangeError: Maximum call stack size exceeded` na linha 249 (`btoa(String.fromCharCode(...new Uint8Array(...)))`)
- **Pull:** `ReferenceError: atob is not defined` na linha 344 (Android WebView)
- **State:** `sync_state.json` é salvo em caminho inválido no mobile (usa propriedades privadas `basePath`/`appId`)
- **Status:** Lê e hasheia todos arquivos do vault a cada chamada — insustentável no mobile
- **Race:** Auto-sync pode disparar durante push manual, corrompendo o state

## Root Cause

1. **`btoa` com spread de array grande:** `String.fromCharCode(...new Uint8Array(content))` excede o limite de argumentos do JS quando o arquivo é grande (limite ~65536, arquivo >65KB já explode)
2. **`atob`/`btoa` não confiáveis no WebView mobile:** O Obsidian Mobile usa React Native WebView. `atob` e `btoa` podem não estar disponíveis ou ter bugs com caracteres não-ASCII
3. **`statePath` usa props privadas:** `(this.app.vault.adapter as any).basePath` e `(this.app as any).appId` não existem no mobile
4. **`status()` hasheia todos arquivos:** Sem otimização via mtime/size
5. **Sem mutex no `doSync()`**

## Regression Test

> **TDD Rule:** Write this test FIRST — it must fail (Red) before the fix is applied, then pass (Green) after.

### Test File
`src/__tests__/github-sync.test.ts`

### Test Description

Testes unitários para as funções base64, parseRemote, sha256, e para a lógica de sync com adapters mockados.

### Expected After Fix
- Testes de base64 passam com arquivos de 0 a 2MB
- parseRemote funciona com e sem `.git`
- sha256 funciona com fallback JS puro
- GitHubSync.push e pull funcionam com adapter mock
- statePath é construído sem acessar props privadas

---

## Fix

### Files to Change

| File | Change |
|---|---|
| `src/github/base64.ts` (NOVO) | Implementação chunked de encode/decode base64 |
| `src/github/sync.ts` | Usar base64 chunked; otimizar status() com mtime; retry/rate-limit; fallback SHA-256 |
| `src/main.ts` | Corrigir statePath; adicionar mutex no doSync(); polyfill crypto.subtle |
| `src/settings-tab.ts` | Expor authorName, authorEmail, autoSyncMinutes na UI |
| `tsconfig.json` | Remover exclusão de `src/__tests__` |

### Code Changes

**1. `src/github/base64.ts` (NOVO):**
- `arrayBufferToBase64(buf: ArrayBuffer): string` — processa em chunks de 8192 bytes
- `base64ToUint8Array(str: string): Uint8Array` — processa em chunks de 4 caracteres

**2. `src/github/sync.ts`:**
- Substituir `btoa(...)` por `arrayBufferToBase64(...)`
- Substituir `atob(...)` por `TextDecoder` + `base64ToUint8Array`
- `status()`: usar `stat.mtime` e `stat.size` antes do hash
- Push: delay 100ms entre chamadas + retry 3x com backoff exponencial
- Pull: delay 50ms entre downloads
- Adicionar `maxFileSize` = 1MB, pular com warn

**3. `src/main.ts`:**
- `statePath`: usar `this.manifest.dir` ou fallback para `${appId}/vault-keeper`
- `doSync()`: mutex `syncing` boolean
- Adicionar polyfill `crypto.subtle.digest` com implementação JS pura como fallback

## Side Effects

- Nenhum — as mudanças são internas ao módulo de sync
- O formato do `sync_state.json` muda (adiciona `size`), mas é backward-compatible (novos campos são opcionais)
- Performance do `status()` melhora significativamente

## Follow-up: Ordem Push/Pull Invertida

### Context

Foi descoberto que a ordem `pull → push` no `doSync()` causa perda de dados no mobile:
1. Usuário modifica arquivo local → SHA muda para `AAA`
2. Pull baixa versão remota `BBB` → sobrescreve `AAA` com `BBB`
3. Push escaneia vault → arquivo tem SHA `BBB` (cache atualizado pelo pull) → "nada alterado"

### Fix

- **Inverter ordem:** `push → pull` no `doSync()`
- **Snapshot de segurança:** salvar `sync_state.json` em backup antes do push. Se push falhar, restaurar do backup antes de rodar pull.

### Files Changed
| File | Change |
|---|---|
| `src/main.ts` | Inverter push/pull, adicionar snapshot/rollback |
| `src/github/sync.ts` | Adicionar `backupState()` / `restoreBackup()` |

### Testes
- `asyncOrder` — verifica que push é chamado antes de pull
- `snapshotBeforePush` — estado é salvo em backup antes do push
- `rollbackOnPushFailure` — push que falha restaura state do backup
- `skipPullOnPushFailure` — se push falhar, pull não roda

## Validation Checklist
- [x] Testes unitários escritos e FAILING (Red)
- [x] Implementação aplicada, testes PASSING (Green)
- [x] Build compila sem erros
- [x] Push funciona com arquivos de 500KB
- [x] Pull funciona sem `atob`
- [x] State persiste no mobile
- [x] Status não hasheia arquivos não modificados
- [x] Mutex previne sync duplo
- [x] Rate-limit respeita GitHub API
- [x] Push antes do pull (não perde modificações locais)
- [x] Snapshot/rollback protege contra push parcial

## Notes

Prioridade máxima: os 3 crashes da Fase 1 bloqueiam completamente o uso mobile.
As Fases 2 e 3 são melhorias de qualidade mas não bloqueantes.
