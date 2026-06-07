import { Plugin, WorkspaceLeaf } from 'obsidian'
import { VaultKeeperSettings, DEFAULT_SETTINGS } from './settings'
import { VaultKeeperSettingTab } from './settings-tab'
import { GitSync } from './git/sync'
import { InboxView, INBOX_VIEW_TYPE } from './views/inbox-view'
import { ChatView, CHAT_VIEW_TYPE } from './views/chat-view'
import { LintView, LINT_VIEW_TYPE } from './views/lint-view'
import { LLMProvider, createProvider } from './llm/provider'
import { WikiOps } from './wiki/ops'
import { Logger } from './wiki/log'

export default class VaultKeeperPlugin extends Plugin {
  settings: VaultKeeperSettings
  git: GitSync
  llm: LLMProvider | null
  wiki: WikiOps
  logger: Logger

  async onload() {
    await this.loadSettings()
    this.addSettingTab(new VaultKeeperSettingTab(this.app, this))

    // Git sync via isomorphic-git
    this.git = new GitSync(this.app.vault, this.settings)

    // LLM provider (agnóstico)
    this.llm = createProvider(this.settings.llm)

    // Wiki operations
    this.wiki = new WikiOps(this.app.vault, this.settings)
    this.logger = new Logger(this.app.vault)

    // Register views
    this.registerView(INBOX_VIEW_TYPE, (leaf) => new InboxView(leaf, this))
    this.registerView(CHAT_VIEW_TYPE, (leaf) => new ChatView(leaf, this))
    this.registerView(LINT_VIEW_TYPE, (leaf) => new LintView(leaf, this))

    // Commands
    this.addCommand({
      id: 'open-inbox',
      name: 'Abrir inbox',
      callback: () => this.activateView(INBOX_VIEW_TYPE),
    })
    this.addCommand({
      id: 'open-chat',
      name: 'Vault Chat',
      callback: () => this.activateView(CHAT_VIEW_TYPE),
    })
    this.addCommand({
      id: 'open-lint',
      name: 'Auditoria (lint)',
      callback: () => this.activateView(LINT_VIEW_TYPE),
    })
    this.addCommand({
      id: 'git-sync',
      name: 'Sincronizar (git pull/push)',
      callback: () => this.git.sync(),
    })
    this.addCommand({
      id: 'ingest-current',
      name: 'Ingest: arquivo atual',
      callback: () => this.wiki.ingestFile(this.app.workspace.getActiveFile(), this.llm),
    })

    // Ribbon icons
    this.addRibbonIcon('inbox', 'Vault Keeper: Inbox', () => this.activateView(INBOX_VIEW_TYPE))
    this.addRibbonIcon('message-square', 'Vault Keeper: Chat', () => this.activateView(CHAT_VIEW_TYPE))
  }

  async activateView(type: string) {
    const { workspace } = this.app
    let leaf: WorkspaceLeaf | null = workspace.getLeavesOfType(type)[0]
    if (!leaf) {
      leaf = workspace.getRightLeaf(false)
      if (leaf) await leaf.setViewState({ type, active: true })
    }
    if (leaf) workspace.revealLeaf(leaf)
  }

  async loadSettings() {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData())
  }

  async saveSettings() {
    await this.saveData(this.settings)
  }
}
