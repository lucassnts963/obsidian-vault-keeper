# Spec: Views Fix + Redesign

| Field | Value |
|---|---|
| **ID** | CHG-007 |
| **Status** | draft |
| **Author** | Lucas Santos |
| **Created** | 2026-06-07 |

## Scope

1. Consertar path handling e error handling nas 3 views
2. Criar `src/views/ui.ts` com helpers de estilo compartilhados
3. Redesenhar InboxView, ChatView, LintView com cards e Obsidian CSS vars

## Design

### UI Module (`src/views/ui.ts`)

```typescript
// Helpers:
- card(container): HTMLElement — cria div com estilo card
- badge(text, color): HTMLElement — span com cor de status
- center(text): void — mensagem centralizada
- loading(): void — indicador de carregamento
```

### Colors (via Obsidian CSS variables)
- `var(--background-primary)` — fundo card
- `var(--background-modifier-border)` — borda
- `var(--text-normal)` — texto
- `var(--text-accent)` — links/destaques
- `var(--color-red)` — erro
- `var(--color-orange)` — warning
- `var(--color-green)` — sucesso

### Path Handling Fix
```typescript
// Antes: const path = `${inboxPath}/${f}`
// Depois: const path = normalizePath(inboxPath, f)

function normalizePath(dir: string, file: string): string {
  if (file.startsWith(dir + '/') || file.startsWith(dir + '\\')) return file
  return `${dir}/${file}`
}
```

### Error Handling Pattern
```typescript
try {
  const list = await vault.adapter.list(dir)
  mdFiles = list.files.filter(f => f.endsWith('.md'))
} catch {
  await vault.adapter.mkdir(dir)
  mdFiles = []
}
// Per-file:
for (const f of mdFiles) {
  try { await read(f) } catch { continue }
}
```

### LintView Fixes
- Orphan check: remove `> 1` threshold
- Index check: match `f` against path segments in index

## Tests

| ID | Test |
|---|---|
| T-01 | InboxView mostra "Nenhuma nota" com dir vazio (não crasha) |
| T-02 | InboxView cria diretório se não existe |
| T-03 | normalizePath lida com arquivos com prefixo |
| T-04 | LintView detecta órfão com 1 página |
| T-05 | Views mostram estado loading |
| T-06 | Cards usam Obsidian CSS variables |
