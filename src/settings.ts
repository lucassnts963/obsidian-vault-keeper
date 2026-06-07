/** LLM provider configuration — agnóstico a modelo */
export interface LLMSettings {
  provider: 'http' | 'ollama' | 'hermes-gateway'
  endpoint: string       // e.g. http://localhost:11434/v1
  model: string           // e.g. deepseek-chat, llama3.2:3b
  apiKey?: string
  maxTokens?: number
}

/** Git sync settings */
export interface GitSettings {
  enabled: boolean
  remote: string           // e.g. https://github.com/user/vault.git
  username: string
  token: string
  authorName: string
  authorEmail: string
  autoSyncMinutes: number  // 0 = desligado
}

export interface VaultKeeperSettings {
  llm: LLMSettings
  git: GitSettings
  vaults: {                // multi-vault support
    knowledge: string       // path relativo ao vault raiz
    projects: string[]
  }
  inboxPath: string         // default: 'inbox'
  rawPath: string           // default: 'raw'
  wikiPath: string          // default: 'wiki'
  logPath: string           // default: 'wiki/log.md'
  indexPath: string         // default: 'wiki/index.md'
}

export const DEFAULT_SETTINGS: VaultKeeperSettings = {
  llm: {
    provider: 'http',
    endpoint: 'https://api.deepseek.com/v1',
    model: 'deepseek-chat',
    apiKey: '',
    maxTokens: 4096,
  },
  git: {
    enabled: false,
    remote: '',
    username: '',
    token: '',
    authorName: '',
    authorEmail: '',
    autoSyncMinutes: 0,
  },
  vaults: {
    knowledge: '',
    projects: [],
  },
  inboxPath: 'inbox',
  rawPath: 'raw',
  wikiPath: 'wiki',
  logPath: 'wiki/log.md',
  indexPath: 'wiki/index.md',
}
