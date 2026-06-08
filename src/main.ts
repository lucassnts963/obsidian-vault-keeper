// Polyfill Buffer — módulo separado garante execução antes dos demais imports
import './polyfill'

import { Notice, Plugin, WorkspaceLeaf, addIcon, setIcon } from 'obsidian'
import { VaultKeeperSettings, DEFAULT_SETTINGS } from './settings'
import { VaultKeeperSettingTab } from './settings-tab'
import { GitSync, type StatusResult } from './git/sync'
import { InboxView, INBOX_VIEW_TYPE } from './views/inbox-view'
import { ChatView, CHAT_VIEW_TYPE } from './views/chat-view'
import { LintView, LINT_VIEW_TYPE } from './views/lint-view'
import { LLMProvider, createProvider } from './llm/provider'
import { WikiOps } from './wiki/ops'
import { Logger } from './wiki/log'

/** Ícone SVG customizado para sync */
const SYNC_ICON =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21.5 2v6h-6M2.5 22v-6h6M2 11.5a10 10 0 0 1 18.8-4.3M22 12.5a10 10 0 0 1-18.8 4.2"/></svg>'

export default class VaultKeeperPlugin extends Plugin {
  declare settings: VaultKeeperSettings
  git!: GitSync
  llm!: LLMProvider | null
  wiki!: WikiOps
  logger!: Logger

  private statusBarEl: HTMLElement | null = null
  private autoSyncInterval: ReturnType<typeof setInterval> | null = null

  async onload() {
    await this.loadSettings()

    addIcon('vault-keeper-sync', SYNC_ICON)
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

    // ── Commands ────────────────────────────────────────
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
      callback: () => this.doSync(),
    })
    this.addCommand({
      id: 'git-status',
      name: 'Status do git',
      callback: () => this.showStatus(),
    })
    this.addCommand({
      id: 'ingest-current',
      name: 'Ingest: arquivo atual',
      callback: () => this.wiki.ingestFile(this.app.workspace.getActiveFile(), this.llm),
    })

    // ── Ribbon icons ────────────────────────────────────
    this.addRibbonIcon('inbox', 'Vault Keeper: Inbox', () => this.activateView(INBOX_VIEW_TYPE))
    this.addRibbonIcon('message-square', 'Vault Keeper: Chat', () => this.activateView(CHAT_VIEW_TYPE))

    // Ribbon com sync (só aparece se git habilitado)
    if (this.settings.git.enabled) {
      this.addRibbonIcon('vault-keeper-sync', 'Vault Keeper: Sync', () => this.doSync())
    }

    // ── Status bar ──────────────────────────────────────
    this.statusBarEl = this.addStatusBarItem()
    this.statusBarEl.addClass('vault-keeper-status')
    this.statusBarEl.setText('git: …')
    // Não bloqueia o startup — atualiza assíncrona
    this.refreshStatusBar()

    // ── Auto-sync ───────────────────────────────────────
    this.setupAutoSync()
  }

  /** Ativa uma view (abre se não existir) */
  async activateView(type: string) {
    const { workspace } = this.app
    let leaf: WorkspaceLeaf | null = workspace.getLeavesOfType(type)[0]
    if (!leaf) {
      leaf = workspace.getRightLeaf(false)
      if (leaf) await leaf.setViewState({ type, active: true })
    }
    if (leaf) workspace.revealLeaf(leaf)
  }

  // ═══════════════════════════════════════════════════════
  //  Git Sync
  // ═══════════════════════════════════════════════════════

  /** Executa sync completo e notifica o usuário */
  async doSync(): Promise<void> {
    if (!this.settings.git.enabled) {
      new Notice('⚠️ Git sync desabilitado. Configure nas settings.')
      return
    }

    let notice = new Notice('🔄 Sincronizando...', 0)

    try {
      const result = await this.git.sync((phase) => {
        // Atualiza a Notice com a fase atual
        notice.setMessage(`🔄 ${phase}`)
      })
      notice.hide()

      const lines = [
        `✅ Sync concluído (${result.branch})`,
        ...result.commits.map((c) => `   ${c}`),
      ]
      new Notice(lines.join('\n'), 8000)

      this.refreshStatusBar()
    } catch (err) {
      notice.hide()
      const msg = err instanceof Error ? err.message : String(err)
      new Notice(`❌ Sync falhou: ${msg.slice(0, 120)}`, 8000)
      this.refreshStatusBar()
    }
  }

  /** Mostra status rápido via Notice */
  async showStatus(): Promise<void> {
    if (!this.settings.git.enabled) {
      new Notice('⚠️ Git sync desabilitado')
      return
    }

    const status = await this.git.status()

    if (status.error) {
      new Notice(`⚠️ Git: ${status.error.slice(0, 100)}`, 6000)
      return
    }

    const dirty = status.localChanges.length > 0
    const icon = dirty ? '📝' : '✅'
    const parts = [
      `${icon} branch: ${status.branch}`,
      `   mudanças locais: ${status.localChanges.length}`,
      `   commits não enviados: ${status.unpushedCommits}`,
    ]
    new Notice(parts.join('\n'), 5000)
  }

  /** Atualiza a status bar com branch e estado */
  async refreshStatusBar(): Promise<void> {
    if (!this.statusBarEl) return

    if (!this.settings.git.enabled) {
      this.statusBarEl.setText('')
      return
    }

    try {
      const status = await this.git.status()

      if (status.error) {
        this.statusBarEl.setText(`git: ⚠️`)
        this.statusBarEl.setAttr('aria-label', status.error)
        return
      }

      const dirty = status.localChanges.length > 0
      const icon = dirty ? '📝' : '✅'
      this.statusBarEl.setText(`git: ${icon} ${status.branch}`)
      this.statusBarEl.setAttr(
        'aria-label',
        `${status.branch} — ${status.localChanges.length} mudanças, ${status.unpushedCommits} commits pendentes`,
      )
    } catch {
      this.statusBarEl.setText('git: …')
    }
  }

  /** Timer de auto-sync */
  setupAutoSync(): void {
    // Limpa timer anterior
    if (this.autoSyncInterval) {
      clearInterval(this.autoSyncInterval)
      this.autoSyncInterval = null
    }

    const minutes = this.settings.git.autoSyncMinutes
    if (minutes > 0 && this.settings.git.enabled) {
      this.autoSyncInterval = setInterval(
        () => this.doSync(),
        minutes * 60 * 1000,
      )
      this.registerInterval(this.autoSyncInterval as unknown as number)
    }
  }

  // ═══════════════════════════════════════════════════════
  //  Settings
  // ═══════════════════════════════════════════════════════

  async loadSettings() {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData())
  }

  async saveSettings() {
    await this.saveData(this.settings)
    // Recria auto-sync timer se configuração mudou
    this.setupAutoSync()
    this.refreshStatusBar()
  }

  onunload() {
    if (this.autoSyncInterval) {
      clearInterval(this.autoSyncInterval)
    }
  }
}
