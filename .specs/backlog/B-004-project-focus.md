# B-004 — Foco em projeto(s)

## Problema

O vault raiz agrega múltiplos projetos em subpastas (`projects/alpha`, `projects/beta`…).
Quando o usuário está trabalhando num projeto específico, queries, ingest e sugestões de
contexto continuam sendo vault-wide — ruído desnecessário e respostas menos relevantes.
Não há como sinalizar "agora estou no contexto do alpha" sem abrir o vault do projeto em
separado no Obsidian.

Adicionalmente, há momentos de **cross-project** — relacionar ideias de dois projetos —
que também devem ser suportados sem exigir múltiplas janelas.

---

## Comportamento desejado

### Estado padrão
Sem foco ativo → comportamento atual (vault-wide). Nenhum elemento extra na UI.

### Ativação de foco
O usuário pode ativar foco de **três formas**:

1. **`@nome` no input do chat** — digitar `@alpha` mostra autocomplete com projetos
   disponíveis; ao confirmar, o foco é adicionado e o `@alpha` é removido do campo.

2. **Barra de foco** — strip minimalista acima do input, sempre oculta quando nenhum foco
   ativo; ao clicar `+` aparece um mini-dropdown com os projetos configurados.

3. **Comando Obsidian** — `Vault Keeper: Definir foco de projeto` abre um `SuggestModal`
   com os projetos disponíveis (útil via Command Palette / hotkey).

### Foco múltiplo
- É possível ativar mais de um projeto simultaneamente.
- Chip extra `[vault raiz]` pode ser adicionado para incluir conteúdo fora de `projects/`.
- Chips exibidos na barra de foco; cada um tem botão ×.
- Botão `✕ Limpar foco` remove todos e volta ao estado vault-wide.

### Efeito do foco

| Operação | Com foco | Sem foco |
|----------|----------|----------|
| Chat / query | BM25 scoped para wiki/ do(s) projeto(s) focado(s) | vault-wide |
| Ingest | Pergunta se deve ir para inbox/ do projeto focado | comportamento atual |
| Push / pull manual | Executa só nos syncs dos projetos focados | todos os syncs |
| Push automático (on-save) | Inalterado — sempre usa syncForFile() | inalterado |
| Context slot injetado | Adiciona "Projetos em foco: alpha, beta" ao prompt | inalterado |

### Persistência
- Foco salvo em `_slots/focus.md` (campo `projects:` no frontmatter).
- Restaurado quando o ChatView é reaberto.
- Resetado automaticamente ao fechar o vault (opcional, configurável).

---

## UX — Detalhes de design

### Barra de foco (focus strip)
```
┌─────────────────────────────────────────────────────────────┐
│  Foco:  [📁 alpha ×]  [📁 beta ×]   [+ projeto]  [✕ limpar] │
└─────────────────────────────────────────────────────────────┘
[__________________________________input__________________] [➤]
```
- Aparece **apenas quando há foco ativo** (sem poluição quando vault-wide).
- Chips usam `var(--interactive-accent)` para o ativo (padrão existente).
- Altura fixa ~28px; fonte 11px (mesmo estilo dos botões de continuar sessão).
- Sem scroll horizontal — se muitos chips, mostra contador `+2` ao final.

### Autocomplete `@` no input
- Ao digitar `@` sozinho ou `@<prefix>`, um dropdown de até 5 sugestões aparece
  ancorado acima do campo.
- Seleção via teclado (↑↓ Enter) ou clique.
- Projetos já focados aparecem marcados com ✓ (clicar de novo remove o foco).
- `@vault` é um alias para incluir o vault raiz explicitamente.

### Fallback sem projetos configurados
Se `settings.vaults.projects` estiver vazio, a feature é invisível. Nenhum botão ou
barra aparece — sem overhead para quem usa vault simples.

---

## Análise técnica

### Estado de foco
```typescript
// src/slots/manager.ts — novo campo
interface FocusState {
  projects: string[]   // ex: ['projects/alpha', 'projects/beta']
  includeRoot: boolean // se true, também inclui arquivos fora de projects/
}
```

### BM25 scoping
`WikiSearchIndex.search()` aceita `rootDir` opcional. Quando foco ativo, passar
`rootDir: 'projects/alpha'` (ou multiple search + merge de resultados ranqueados).

### SlotsManager
Novo método `getFocus(): FocusState` / `setFocus(state: FocusState): Promise<void>` —
lê/escreve o frontmatter de `_slots/focus.md`.

### ChatView
- `private focusState: FocusState` sincronizado com SlotsManager.
- Método `renderFocusBar()` constrói/atualiza a strip acima do input.
- Intercepta input: ao detectar `@` no início ou após espaço, ativa autocomplete overlay.
- Ao enviar query com foco ativo, injeta no contexto BM25 e no system prompt.

### VaultAgent / prompts
`buildSystemPrompt()` já recebe settings; adicionar `focusedProjects?: string[]` ao
parâmetro de contexto.

```typescript
// src/chat/prompts.ts
if (ctx.focusedProjects?.length) {
  prompt += `\nFoco atual: ${ctx.focusedProjects.join(', ')}. Priorize conteúdo desses projetos.`
}
```

### Push/pull com foco
`doPush()` / `doPull()` em `main.ts` — quando `focusedProjects` definido, filtrar
`allSyncs` para incluir apenas os `GitHubSync` cujo `rootDir` está na lista de foco.

---

## Impacto estimado

| Arquivo | Mudança |
|---------|---------|
| `src/slots/manager.ts` | getFocus / setFocus |
| `src/chat/prompts.ts` | focusedProjects no system prompt |
| `src/search/index-builder.ts` | search com rootDir scope |
| `src/views/chat-view.ts` | focus strip, @ autocomplete |
| `src/main.ts` | doPush/doPull filtrado por foco |
| `src/__tests__/` | 4–6 novos testes |

Estimativa: ~200 linhas novas, 50 modificadas.

---

## Questões em aberto

- **Reset automático de foco**: resetar ao fechar vault ou manter para sempre? Sugestão:
  manter (o usuário explicita quando quer vault-wide) — mas adicionar opção nas settings.
- **Foco no Inbox View**: exibir apenas itens do projeto focado no painel inbox?
  Provável sim, mas pode ser fase 2.
- **Hotkey sugerida**: `Mod+Shift+O` (de fOcus) — verificar conflito.
