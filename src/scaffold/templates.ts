export interface VaultTemplate {
  dirs: string[]
  files: { path: string; content: string }[]
}

export function defaultVaultTemplate(): VaultTemplate {
  return {
    dirs: ['inbox', 'raw', 'wiki', 'wiki/_slots', '.vault-keeper'],
    files: [
      {
        path: 'wiki/index.md',
        content: '# Índice do Wiki\n\n| Título | Categoria | Tags | Resumo |\n|--------|-----------|------|--------|\n',
      },
      {
        path: 'wiki/log.md',
        content: '# Log de Atividades\n',
      },
      {
        path: 'wiki/_slots/focus.md',
        content: '',
      },
      {
        path: '.vault-keeper/bm25-index.json',
        content: '{"version":1,"entries":[]}',
      },
    ],
  }
}
