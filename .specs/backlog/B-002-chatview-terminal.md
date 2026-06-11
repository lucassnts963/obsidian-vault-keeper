# B-002 — ChatView como terminal embutido

## Problema
O ChatView atual streama a saída do CLI em bolhas de chat — funciona bem para respostas finais em markdown, mas perde interatividade (sem cursor, sem ANSI nativo, sem stdin interativo após o envio inicial).

## Comportamento desejado
Modo alternativo "Terminal" no ChatView que embute um emulador de terminal real dentro do Obsidian, mantendo o modo "Chat" atual como padrão.

## Análise de trade-offs

| Aspecto | Chat (atual) | Terminal |
|---------|-------------|---------|
| Markdown rendering | ✅ nativo | ❌ precisa de parse extra |
| ANSI colors / cursor | ❌ strippado | ✅ nativo via xterm.js |
| Integração visual Obsidian | ✅ total | ⚠️ iframe/div separado |
| Interatividade (stdin) | ❌ só envio inicial | ✅ completa |
| Tamanho do bundle | +0 KB | +~300 KB (xterm.js) |
| Histórico persistido | ✅ messages[] | ❌ só texto raw |
| Mobile | ✅ copia comando | ❌ inútil sem shell |

## Abordagem sugerida
- Adicionar toggle "Modo Terminal" no header do ChatView (persiste em settings).
- No modo terminal: usar `xterm.js` + `xterm-addon-fit` como dependência opcional.
- O processo é spawnado com `pty` (pseudo-terminal) em vez de `pipe` → stdin aberto.
- Modo Chat continua sendo o padrão; Terminal é opt-in por usuário.

## Bloqueios
- `node-pty` não é disponível no contexto Electron renderer sem native addons — pode exigir preload script ou IPC.
- `xterm.js` adiciona ~300 KB ao bundle.
- Avaliar alternativa mais leve: `hterm` (usado pelo Obsidian internamente em algumas versões).

## Decisão pendente
Antes de iniciar spec completa: confirmar se `node-pty` é viável no contexto do plugin Obsidian (Electron renderer). Se não for, a feature fica bloqueada tecnicamente.
