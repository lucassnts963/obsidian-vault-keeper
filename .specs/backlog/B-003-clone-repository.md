# B-003 — Comando: clonar repositório

## Problema
O fluxo atual assume que o vault já existe localmente. Não há como iniciar um vault a partir de um repositório GitHub existente — o usuário precisa criar o vault manualmente e depois configurar o sync.

## Comportamento desejado
Comando "Vault Keeper: Clonar repositório" que:
1. Pede ao usuário o remote URL (ou usa o já configurado em Settings).
2. Usa a GitHub REST API para baixar todos os arquivos do branch `main`.
3. Cria a estrutura de pastas necessária (mkdir para cada path antes de write).
4. Exibe progresso via Notice: "Clonando: N/M arquivos".
5. Ao terminar: salva o `sync_state.json` com os SHAs remotos (estado inicial sincronizado).

## Análise técnica
A lógica de `pull()` em `sync.ts` já faz quase tudo isso — baixa todos os arquivos do remote tree. A diferença é:
- `pull()` é incremental (só arquivos com SHA diferente do cache).
- Clone é uma operação destrutiva inicial: ignora o cache, cria todos os arquivos.

Implementação:
1. Novo método `clone(onPhase)` em `GitHubSync` — variante de `pull()` sem verificação de cache nem conflito.
2. Garantir `mkdir` recursivo para cada path antes de `write` (problema já identificado para mobile).
3. Registrar comando `clone-repository` em `main.ts`.
4. Exibir modal de confirmação antes de sobrescrever arquivos existentes.

## Impacto estimado
- Médio: ~60 linhas em `sync.ts`, ~20 linhas em `main.ts`.
- Depende do fix de `mkdir` recursivo (B-004 / bugfix mobile).
- Testes: estender `github-sync.test.ts` com cenário de clone.

## Plataforma
Desktop e Mobile (usa GitHub REST API, sem shell).
