# B-005 — Approve respeita o projeto de origem

## Problema
`WikiOps.approve()` movia a nota do inbox para `raw/` usando `settings.rawPath`
fixo (`'raw'`) no check de `exists`/`mkdir`. Para notas dentro de um projeto
(`projects/alpha/inbox/nota.md`), o caminho de destino calculado via
`replace('inbox', 'raw')` estava correto (`projects/alpha/raw/nota.md`), mas a
pasta criada era a raiz `raw/` — gerando inconsistência e potencial falha de
escrita.

## Comportamento desejado
Ao aprovar uma nota do inbox de um projeto, ela deve ir para o `raw/` **daquele
projeto**, não para o `raw/` da raiz do vault.

- `inbox/nota.md` → `raw/nota.md` (inalterado)
- `projects/alpha/inbox/nota.md` → `projects/alpha/raw/nota.md`

## Solução
Derivar o diretório de destino do próprio `newPath`
(`newPath.substring(0, newPath.lastIndexOf('/'))`) em vez de usar
`settings.rawPath` fixo no `mkdir`.

## Status
✅ done — commit `8a8271a` na main. Teste:
"approve moves project inbox file to project raw" em `wiki-ops.test.ts`.
