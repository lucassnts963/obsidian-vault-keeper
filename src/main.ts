import { Notice, Plugin, WorkspaceLeaf, addIcon, TFile } from 'obsidian'
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
import { VaultAgent } from './chat/agent'

const SYNC_ICON =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21.5 2v6h-6M2.5 22v-6h6M2 11.5a10 10 0 0 1 18.8-4.3M22 12.5a10 10 0 0 1-18.8 4.2"/></svg>'

const PUSH_ICON =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17.5 19H9a7 7 0 1 1 6.71-9h1.79a4.5 4.5 0 1 1 0 9Z"/><path d="M12 13v8"/><path d="m9 17 3-4 3 4"/></svg>'

const PULL_ICON =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17.5 19H9a7 7 0 1 1 6.71-9h1.79a4.5 4.5 0 1 1 0 9Z"/><path d="M12 8v8"/><path d="m9 12 3 4 3-4"/></svg>'

export default class VaultKeeperPlugin extends Plugin {
  declare settings: VaultKeeperSettings
  github!: GitHubSync | null
  termux!: TermuxSync
  llm!: LLMProvider | null
  wiki!: WikiOps
  logger!: Logger
  agent!: VaultAgent

  private statusBarEl: HTMLElement | null = null
  private autoSyncInterval: ReturnType<typeof setInterval> | null = null
  private syncing = false
  private lastStatusCheck = 0
  private statusCache: { remoteAhead: boolean; branch: string } | null = null

  async onload() {
    await this.loadSettings()

    addIcon('vault-keeper-sync', SYNC_ICON)
    addIcon('vault-keeper-push', PUSH_ICON)
    addIcon('vault-keeper-pull', PULL_ICON)
    this.addSettingTab(new VaultKeeperSettingTab(this.app, this))

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
          '.obsidian/vault-keeper',
        )
      } catch (err: any) {
        new Notice(`Vault Keeper: erro ao iniciar sync — ${err.message}`, 8000)
        this.github = null
      }
    } else {
      this.github = null
    }

    this.termux = new TermuxSync(this.app.vault)
    this.llm = createProvider(this.settings.llm)

    this.wiki = new WikiOps(this.app.vault, this.settings)
    this.logger = new Logger(this.app.vault)

    this.agent = new VaultAgent(this.app.vault, this.llm || {} as any, this.settings)

    this.registerView(INBOX_VIEW_TYPE, (leaf) => new InboxView(leaf, this))
    this.registerView(CHAT_VIEW_TYPE, (leaf) => new ChatView(leaf, this))
    this.registerView(LINT_VIEW_TYPE, (leaf) => new LintView(leaf, this))

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
      name: 'Sincronizar (push + pull)',
      callback: () => this.doSync(),
    })
    this.addCommand({
      id: 'git-push',
      name: 'Push (enviar alterações)',
      callback: () => this.doPush(),
    })
    this.addCommand({
      id: 'git-pull',
      name: 'Pull (baixar alterações)',
      callback: () => this.doPull(),
    })
    this.addCommand({
      id: 'git-push-current',
      name: 'Push: arquivo atual',
      callback: () => this.doPushCurrent(),
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
    this.addCommand({
      id: 'approve-current',
      name: 'Approvar: arquivo atual',
      callback: async () => {
        const file = this.app.workspace.getActiveFile()
        if (!file) { new Notice('Nenhum arquivo aberto'); return }
        await this.wiki.approve(file)
        new Notice(`Aprovado: ${file.path}`)
      },
    })
    this.addCommand({
      id: 'reject-current',
      name: 'Rejeitar: arquivo atual',
      callback: async () => {
        const file = this.app.workspace.getActiveFile()
        if (!file) { new Notice('Nenhum arquivo aberto'); return }
        await this.wiki.reject(file)
        new Notice(`Rejeitado: ${file.path}`)
      },
    })

    this.addRibbonIcon('inbox', 'Vault Keeper: Inbox', () => this.activateView(INBOX_VIEW_TYPE))
    this.addRibbonIcon('message-square', 'Vault Keeper: Chat', () => this.activateView(CHAT_VIEW_TYPE))

    if (this.github) {
      this.addRibbonIcon('vault-keeper-push', 'Vault Keeper: Push', () => this.doPush())
      this.addRibbonIcon('vault-keeper-pull', 'Vault Keeper: Pull', () => this.doPull())
      this.addRibbonIcon('vault-keeper-sync', 'Vault Keeper: Sync', () => this.doSync())
    }

    this.statusBarEl = this.addStatusBarItem()
    this.statusBarEl.addClass('vault-keeper-status')
    this.refreshStatusBar()

    this.setupAutoSync()

    if (this.github) {
      setTimeout(() => this.autoPullOnStart(), 2000)
    }
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

  async doPush(): Promise<void> {
    if (!this.checkSyncReady()) return
    if (!this.acquireLock()) return

    const notice = new Notice('🔄 Push...', 0)
    try {
      await this.github!.backupState()
      const msgs = await this.github!.push((phase) => {
        notice.setMessage(`🔄 ${phase}`)
      })
      notice.hide()

      const conflicts = msgs.filter((m: string) => m.includes('conflito')).length
      const pushed = msgs.filter((m: string) => m.includes('push: ')).length
      const summary = [`✅ Push: ${pushed} enviados`]
      if (conflicts > 0) summary.push(`⚠️ ${conflicts} conflitos (backup salvo como .conflict)`)
      summary.push(...msgs.map((m: string) => `   ${m}`))
      new Notice(summary.join('\n'), 8000)
      this.refreshStatusBar()
    } catch (err: any) {
      notice.hide()
      await this.github!.restoreBackup()
      new Notice(`❌ Push falhou: ${err.message?.slice(0, 200)}`, 8000)
    } finally {
      this.syncing = false
    }
  }

  async doPull(): Promise<void> {
    if (!this.checkSyncReady()) return
    if (!this.acquireLock()) return

    const notice = new Notice('🔄 Pull...', 0)
    try {
      const msgs = await this.github!.pull((phase) => {
        notice.setMessage(`🔄 ${phase}`)
      })
      notice.hide()

      const downloaded = msgs.filter((m: string) => m.includes('atualizados')).length > 0
      const backups = msgs.filter((m: string) => m.includes('backup')).length
      if (downloaded) {
        const summary = ['📥 Pull concluído']
        if (backups > 0) summary.push(`⚠️ ${backups} backups salvos (.backup)`)
        summary.push(...msgs.map((m: string) => `   ${m}`))
        new Notice(summary.join('\n'), 8000)
      } else {
        new Notice('📥 Pull: já atualizado', 3000)
      }
      this.refreshStatusBar()
    } catch (err: any) {
      notice.hide()
      new Notice(`❌ Pull falhou: ${err.message?.slice(0, 200)}`, 8000)
    } finally {
      this.syncing = false
    }
  }

  async doSync(): Promise<void> {
    if (!this.checkSyncReady()) return
    if (!this.acquireLock()) return

    const notice = new Notice('🔄 Sincronizando...', 0)
    try {
      await this.github!.backupState()

      let pushMsgs: string[] = []
      let pushFailed = false
      try {
        pushMsgs = await this.github!.push((phase) => {
          notice.setMessage(`🔄 ${phase}`)
        })
      } catch (err: any) {
        pushFailed = true
        pushMsgs = [`ERRO: ${err.message?.slice(0, 120)}`]
        await this.github!.restoreBackup()
        new Notice(`⚠️ Push falhou: ${err.message?.slice(0, 100)}`, 5000)
      }

      const pullMsgs = await this.github!.pull((phase) => {
        notice.setMessage(`🔄 ${phase}`)
      })
      notice.hide()

      const allMsgs = [
        pushFailed ? '⚠️ Sync (push falhou)' : '✅ Sync concluído',
        ...pushMsgs.map((m: string) => `   ${m}`),
        ...pullMsgs.map((m: string) => `   ${m}`),
      ]
      new Notice(allMsgs.join('\n'), 8000)
      this.refreshStatusBar()
    } catch (err: any) {
      notice.hide()
      new Notice(`❌ Sync falhou: ${err.message?.slice(0, 200)}`, 8000)
    } finally {
      this.syncing = false
    }
  }

  async doPushCurrent(): Promise<void> {
    if (!this.checkSyncReady()) return

    const file = this.app.workspace.getActiveFile()
    if (!file) {
      new Notice('⚠️ Nenhum arquivo aberto')
      return
    }

    if (!file.path.endsWith('.md')) {
      new Notice('⚠️ Apenas arquivos .md podem ser sincronizados')
      return
    }

    const notice = new Notice(`🔄 Push: ${file.path}...`, 0)
    try {
      const path = await this.github!.pushFile(file.path)
      notice.hide()
      new Notice(`✅ Push: ${path}`, 3000)
      this.refreshStatusBar()
    } catch (err: any) {
      notice.hide()
      new Notice(`❌ Push falhou: ${err.message?.slice(0, 200)}`, 8000)
    }
  }

  async autoPullOnStart(): Promise<void> {
    if (!this.github) return
    try {
      const qs = await this.github.quickStatus()
      if (!qs.remoteAhead) return
      const msgs = await this.github.pull()
      const downloaded = msgs.filter((m: string) => !m.startsWith('pull:') && !m.startsWith('ERRO'))
      if (downloaded.length > 0) {
        new Notice(`📥 Pull inicial: ${downloaded.length} arquivos`, 5000)
      }
      this.refreshStatusBar()
    } catch {
      // silencioso
    }
  }

  async showStatus(): Promise<void> {
    try {
      const status = await this.termux.status()
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

  private checkSyncReady(): boolean {
    if (!this.github) {
      new Notice('⚠️ GitHub sync não configurado. Vá nas settings.')
      return false
    }
    return true
  }

  private acquireLock(): boolean {
    if (this.syncing) {
      new Notice('⏳ Sync já em andamento...')
      return false
    }
    this.syncing = true
    return true
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
