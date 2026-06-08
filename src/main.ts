import { Notice, Plugin, WorkspaceLeaf, addIcon, setIcon } from 'obsidian'
import { VaultKeeperSettings, DEFAULT_SETTINGS } from './settings'
import { VaultKeeperSettingTab } from './settings-tab'
import { GitHubSync } from './github/sync'
import { TermuxSync } from './termux/sync'
import { InboxView, INBOX_VIEW_TYPE } from './views/inbox-view'
import { ChatView, CHAT_VIEW_TYPE } from './views/chat-view'
import { LintView, LINT_VIEW_TYPE } from './views/lint-view'
import { LLMProvider, createProvider } from './llm/provider'
import { WikiOps } from './wiki/ops'
import { Logger } from './wiki/log'

const SYNC_ICON =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21.5 2v6h-6M2.5 22v-6h6M2 11.5a10 10 0 0 1 18.8-4.3M22 12.5a10 10 0 0 1-18.8 4.2"/></svg>'

export default class VaultKeeperPlugin extends Plugin {
  declare settings: VaultKeeperSettings
  github!: GitHubSync | null
  termux!: TermuxSync
  llm!: LLMProvider | null
  wiki!: WikiOps
  logger!: Logger

  private statusBarEl: HTMLElement | null = null
  private autoSyncInterval: ReturnType<typeof setInterval> | null = null

  async onload() {
    await this.loadSettings()

    addIcon('vault-keeper-sync', SYNC_ICON)
    this.addSettingTab(new VaultKeeperSettingTab(this.app, this))

    // GitHub sync (REST API, sem isomorphic-git)
    if (this.settings.git.enabled && this.settings.git.remote && this.settings.git.token) {
      try {
        this.github = new GitHubSync(
          this.app.vault,
          {
            enabled: this.settings.git.enabled,
            remote: this.settings.git.remote,
            token: this.settings.git.token,
            authorName: this.settings.git.authorName || 'Vault Keeper',
            authorEmail: this.settings.git.authorEmail || 'vault@keeper.local',
            autoSyncMinutes: this.settings.git.autoSyncMinutes,
          },
          (this.app.vault.adapter as any).basePath
            ? `${(this.app.vault.adapter as any).basePath}/.obsidian/vault-keeper`
            : `${(this.app as any).appId}/vault-keeper`,
        )
      } catch (err: any) {
        new Notice(`Vault Keeper: erro ao iniciar sync — ${err.message}`, 8000)
        this.github = null
      }
    } else {
      this.github = null
    }

    // Termux bridge (sempre disponível — gera comandos pra colar)
    this.termux = new TermuxSync(this.app.vault)

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
      name: 'Sincronizar (GitHub API)',
      callback: () => this.doSync(),
    })
    this.addCommand({
      id: 'git-status',
      name: 'Status do sync',
      callback: () => this.showStatus(),
    })
    this.addCommand({
      id: 'termux-sync',
      name: 'Termux: sync (pull+push)',
      callback: () => this.termux.sync(),
    })
    this.addCommand({
      id: 'termux-push',
      name: 'Termux: push',
      callback: () => this.termux.push(),
    })
    this.addCommand({
      id: 'termux-pull',
      name: 'Termux: pull',
      callback: () => this.termux.pull(),
    })
    this.addCommand({
      id: 'ingest-current',
      name: 'Ingest: arquivo atual',
      callback: () => this.wiki.ingestFile(this.app.workspace.getActiveFile(), this.llm),
    })

    // ── Ribbon icons ────────────────────────────────────
    this.addRibbonIcon('inbox', 'Vault Keeper: Inbox', () => this.activateView(INBOX_VIEW_TYPE))
    this.addRibbonIcon('message-square', 'Vault Keeper: Chat', () => this.activateView(CHAT_VIEW_TYPE))

    if (this.github) {
      this.addRibbonIcon('vault-keeper-sync', 'Vault Keeper: Sync', () => this.doSync())
    }

    // ── Status bar ──────────────────────────────────────
    this.statusBarEl = this.addStatusBarItem()
    this.statusBarEl.addClass('vault-keeper-status')
    this.refreshStatusBar()

    // ── Auto-sync ───────────────────────────────────────
    this.setupAutoSync()
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

  // ═══════════════════════════════════════════════════════
  //  Sync (GitHub REST API)
  // ═══════════════════════════════════════════════════════

  async doSync(): Promise<void> {
    if (!this.github) {
      new Notice('⚠️ GitHub sync não configurado. Vá nas settings.')
      return
    }

    const notice = new Notice('🔄 Sincronizando...', 0)

    try {
      // Primeiro pull, depois push
      const pullMsgs = await this.github.pull((phase) => {
        notice.setMessage(`🔄 ${phase}`)
      })
      const pushMsgs = await this.github.push((phase) => {
        notice.setMessage(`🔄 ${phase}`)
      })
      notice.hide()

      const allMsgs = [
        '✅ Sync concluído',
        ...pullMsgs.map((m) => `   ${m}`),
        ...pushMsgs.map((m) => `   ${m}`),
      ]
      new Notice(allMsgs.join('\n'), 8000)
      this.refreshStatusBar()
    } catch (err: any) {
      notice.hide()
      new Notice(`❌ Sync falhou: ${err.message?.slice(0, 200)}`, 8000)
    }
  }

  async showStatus(): Promise<void> {
    // Status rápido via Termux (lê .git/HEAD direto, sem API)
    try {
      const status = await this.termux.status()
      // GitHub status (se configurado)
      if (this.github) {
        try {
          const ghStatus = await this.github.status()
          const parts = [status]
          if (ghStatus.localChanges.length > 0) {
            parts.push(`   📝 ${ghStatus.localChanges.length} alterados`)
            for (const f of ghStatus.localChanges.slice(0, 5)) {
              parts.push(`     - ${f}`)
            }
          } else {
            parts.push('   ✅ Nada alterado')
          }
          new Notice(parts.join('\n'), 6000)
        } catch {
          new Notice(status, 4000)
        }
      } else {
        new Notice(status, 4000)
      }
    } catch {
      new Notice('git: ???', 4000)
    }
  }

  async refreshStatusBar(): Promise<void> {
    if (!this.statusBarEl) return

    try {
      const status = await this.termux.status()
      this.statusBarEl.setText(status)
    } catch {
      this.statusBarEl.setText('')
    }
  }

  setupAutoSync(): void {
    if (this.autoSyncInterval) {
      clearInterval(this.autoSyncInterval)
      this.autoSyncInterval = null
    }

    const minutes = this.settings.git.autoSyncMinutes
    if (minutes > 0 && this.github) {
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
    this.setupAutoSync()
    this.refreshStatusBar()
  }

  onunload() {
    if (this.autoSyncInterval) {
      clearInterval(this.autoSyncInterval)
    }
  }
}
