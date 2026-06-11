# B-006 — Suporte a Subprojetos

**Status:** backlog  
**Prioridade:** Média  

---

## Motivação

Um projeto como `montisol` pode crescer o suficiente para ganhar seus próprios subprojetos internos. Quando o usuário abre `projects/montisol/` como vault raiz no Obsidian, ele deve poder criar projetos dentro desse vault (ex: `projects/solar-farm`, `projects/urban`) usando a mesma interface de settings e comandos já existentes.

O vault pai (`vault-raiz`) enxerga tudo via `projects/montisol/projects/solar-farm/…` e precisa saber se deve sincronizar esses arquivos junto com `montisol` ou ignorá-los (cada subprojeto tem seu próprio repositório).

---

## Análise de Impacto

### Estrutura pretendida

```
vault-raiz/
└── projects/
    └── montisol/           ← ProjectVault no vault-raiz
        ├── inbox/  raw/  wiki/
        └── projects/
            ├── solar-farm/   ← subprojeto (ProjectVault dentro do vault montisol)
            └── urban/
```

Quando `montisol` é aberto como vault standalone o plugin enxerga `projects/solar-farm` e `projects/urban` como ProjectVaults normais — sem nenhuma mudança necessária nessa camada.

### O que o vault-raiz precisa

1. **Excluir subprojetos do sync do `montisol`**: o sync do projeto `montisol` (rootDir=`projects/montisol`) deve pular `projects/montisol/projects/solar-farm/` e `projects/montisol/projects/urban/` — exatamente o que `excludeRoots` já faz para projetos no vault raiz.

2. **Sincronizar subprojetos como syncs independentes**: o vault-raiz precisaria ter entradas `ProjectVault` para cada subprojeto com seu `path` vault-relativo completo (ex: `projects/montisol/projects/solar-farm`).

### A estrutura atual atende?

| Aspecto | Situação |
|---|---|
| `ProjectVault { name, path, remote, token? }` com `path` multi-nível | **Suporta** — `path` é string livre |
| `excludeRoots` em GitHubSync exclui subpastas de projeto-pai | **Suporta** — comparação por prefixo de string |
| `walkFiles()` respeita `excludeRoots` recursivamente | **Suporta** — verifica vault-relative path a cada yield |
| `ownsFile()` para focus routing | **Suporta** — `startsWith(rootDir + '/')` funciona para qualquer profundidade |
| Settings UI mostra projetos em lista plana | **Limitação UX** — não há hierarquia visual; subprojetos aparecem na mesma lista dos projetos raiz |
| Descoberta automática de subprojetos | **Não existe** — usuário precisa cadastrar manualmente cada nível |

### Lacuna principal: settings do vault-raiz não conhece subprojetos de montisol

Quando o vault raiz configura `montisol`, ele não sabe que `montisol` tem subprojetos. Há duas abordagens:

**Opção A — Cadastro manual explícito** (minimal, já funciona com código atual)  
Usuário adiciona `projects/montisol/projects/solar-farm` diretamente na lista de projetos do vault-raiz. Funciona sem nenhuma mudança de código — só UX melhora.

**Opção B — Propagação via arquivo de manifesto** (automática)  
Cada ProjectVault que tem subprojetos exporta um `_vault_manifest.json` na raiz do seu repo. O vault-raiz, ao fazer pull de `montisol`, lê o manifesto e oferece importar os subprojetos. Requer mudança no pull flow e UI de confirmação.

---

## Escopo para implementação

### MVP (Opção A — Cadastro manual com hierarquia visual)

1. **`src/settings.ts`**: adicionar campo opcional `parent?: string` em `ProjectVault` para indicar o path do projeto pai. Usado apenas para agrupamento visual.

2. **`src/settings-tab.ts`**: na lista de projetos, agrupar por `parent` — projetos sem parent aparecem no nível 1, projetos com parent aparecem indentados abaixo do pai. Botão "Adicionar subprojeto" dentro de cada projeto pai.

3. **`src/main.ts` — `initSyncs()`**: ao construir GitHubSync para um projeto pai, calcular automaticamente `excludeRoots` como union dos paths dos filhos diretos. Hoje o usuário precisa passar `excludeRoots` manualmente; com `parent` no settings isso vira automático.

4. **Sem mudança em `sync.ts`**: a lógica já funciona para qualquer profundidade.

### Testes necessários

**T-Sub-01**: vault-raiz com `projects/montisol` (pai) e `projects/montisol/projects/solar-farm` (filho) — `initSyncs()` deve criar sync para montisol com `excludeRoots=['projects/montisol/projects/solar-farm']` automaticamente.

**T-Sub-02**: `walkFiles()` de montisol (rootDir=`projects/montisol`) com subprojeto no `excludeRoots` — não itera `projects/montisol/projects/solar-farm/`.

**T-Sub-03**: focus modal no vault-raiz com subprojeto registrado — `ProjectFocusModal` exibe ambos os níveis, selecionando subprojeto filtra BM25 ao path completo.

---

## Decisão de design pendente

- **Profundidade máxima**: por ora limitar a 2 níveis (projeto + subprojeto) para evitar complexidade de UI. Nível 3+ pode ser revisitado sob demanda.
- **Manifesto automático (Opção B)**: postergar para quando houver casos de uso concretos de equipes grandes com muitos subprojetos.
