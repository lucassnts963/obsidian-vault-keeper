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
  token: string
  authorName: string
  authorEmail: string
  autoSyncMinutes: number  // 0 = desligado
  syncOnOpen: boolean
  syncOnClose: boolean
  conflictStrategy: 'ask' | 'keep-local' | 'keep-remote'
}

/** External CLI settings (Claude Code, OpenCode, Gemini CLI, etc.) */
export interface CLISettings {
  preferred: 'claude' | 'opencode' | 'gemini' | 'agy' | 'custom' | 'none'
  customBinaryPath: string
  autoDetect: boolean
}

export interface VaultKeeperSettings {
  llm: LLMSettings
  git: GitSettings
  cli: CLISettings
  agent: {
    maxIterations: number
    maxFileChars: number
    resetContext: boolean
  }
  vaults: {
    knowledge: string
    projects: string[]
  }
  inboxPath: string
  rawPath: string
  wikiPath: string
  logPath: string
  indexPath: string
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
    token: '',
    authorName: '',
    authorEmail: '',
    autoSyncMinutes: 0,
    syncOnOpen: true,
    syncOnClose: false,
    conflictStrategy: 'ask',
  },
  cli: {
    preferred: 'none',
    customBinaryPath: '',
    autoDetect: true,
  },
  agent: {
    maxIterations: 5,
    maxFileChars: 3000,
    resetContext: true,
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
