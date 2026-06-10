# B-001 — Parar processo CLI em execução

## Problema
O CLI pode rodar por minutos (opencode em especial). Uma vez disparado, o usuário não tem como cancelar — só esperar o timeout configurado ou fechar o Obsidian.

## Comportamento desejado
- Botão **"Parar"** (ou ícone ✕) visível no header do ChatView enquanto o CLI está rodando.
- Ao clicar: envia SIGTERM ao processo, espera 3s, SIGKILL se ainda ativo.
- Mensagem de sistema na conversa: "CLI interrompido pelo usuário."
- O input e botão de envio ficam habilitados normalmente após o stop.

## Análise técnica
`CLIBridge.spawn()` hoje retorna apenas uma `Promise` — o processo interno `proc` não é exposto. Para implementar:
1. Adicionar `private currentProc: ChildProcess | null` em `CLIBridge`.
2. Método público `abort(): void` que chama `currentProc?.kill('SIGTERM')`.
3. `ChatView` chama `cliBridge.abort()` no clique do botão.
4. O botão só aparece quando `cliRunning === true`.

## Impacto estimado
- Pequeno: ~30 linhas em `cli-bridge.ts` + ~20 linhas em `chat-view.ts`.
- Testes: 1-2 novos em `cli-bridge.test.ts`.

## Plataforma
Desktop only (mobile não spawna processos).
