import { Notice, Plugin, WorkspaceLeaf, addIcon, TAbstractFile } from 'obsidian'
import { VaultKeeperSettings, DEFAULT_SETTINGS, ProjectVault } from './settings'
import { VaultKeeperSettingTab } from './settings-tab'
import { GitHubSync } from './github/sync'
import { TermuxSync } from './termux/sync'
import { InboxView, INBOX_VIEW_TYPE } from './views/inbox-view'
import { ChatView, CHAT_VIEW_TYPE } from './views/chat-view'
import { LintView, LINT_VIEW_TYPE } from './views/lint-view'
import { OnboardingView, ONBOARDING_VIEW_TYPE } from './views/onboarding-view'
import { LLMProvider, createProvider } from './llm/provider'
import { WikiOps } from './wiki/ops'
import { Logger } from './wiki/log'
import { VaultAgent } from './chat/agent'
import { VaultInstaller } from './scaffold/installer'
import { CLIBridge } from './agents/cli-bridge'
import { VaultIntegrityMonitor } from './agents/monitor'
import { IndexPersistence } from './search/index-persistence'
import { DiagnosticsModal } from './diagnostics/modal'
import { CloneRepositoryModal } from './github/clone-modal'

const SYNC_ICON =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21.5 2v6h-6M2.5 22v-6h6M2 11.5a10 10 0 0 1 18.8-4.3M22 12.5a10 10 0 0 1-18.8 4.2"/></svg>'

const PUSH_ICON =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17.5 19H9a7 7 0 1 1 6.71-9h1.79a4.5 4.5 0 1 1 0 9Z"/><path d="M12 13v8"/><path d="m9 17 3-4 3 4"/></svg>'

const PULL_ICON =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17.5 19H9a7 7 0 1 1 6.71-9h1.79a4.5 4.5 0 1 1 0 9Z"/><path d="M12 8v8"/><path d="m9 12 3 4 3-4"/></svg>'

export default class VaultKeeperPlugin extends Plugin {
  declare settings: VaultKeeperSettings
  github!: GitHubSync | null
  projectSyncs: GitHubSync[] = []
  termux!: TermuxSync
  llm!: LLMProvider | null
  wiki!: WikiOps
  logger!: Logger
  agent!: VaultAgent
  cliBridge: CLIBridge | null = null

  private statusBarEl: HTMLElement | null = null
  private autoSyncInterval: ReturnType<typeof setInterval> | null = null
  private syncing = false
  private lastStatusCheck = 0
  private statusCache: { remoteAhead: boolean; branch: string } | null = null
  private saveTimers: Map<string, ReturnType<typeof setTimeout>> = new Map()

  async onload() {
    await this.loadSettings()

    addIcon('vault-keeper-sync', SYNC_ICON)
    addIcon('vault-keeper-push', PUSH_ICON)
    addIcon('vault-keeper-pull', PULL_ICON)
    this.addSettingTab(new VaultKeeperSettingTab(this.app, this))

    this.initSyncs()

    this.termux = new TermuxSync(this.app.vault)
    this.llm = createProvider(this.settings.llm)

    this.wiki = new WikiOps(this.app.vault, this.settings)
    this.logger = new Logger(this.app.vault, this.settings.logPath)

    this.agent = new VaultAgent(
      this.app.vault, this.llm || {} as any,
      this.settings,
      this.wiki,
      this.settings.agent.maxIterations,
      this.settings.agent.maxFileChars,
    )

    this.registerView(INBOX_VIEW_TYPE, (leaf) => new InboxView(leaf, this))
    this.registerView(CHAT_VIEW_TYPE, (leaf) => new ChatView(leaf, this))
    this.registerView(LINT_VIEW_TYPE, (leaf) => new LintView(leaf, this))
    this.registerView(ONBOARDING_VIEW_TYPE, (leaf) => new OnboardingView(leaf, this))

    this.addCommand({
      id: 'open-inbox',
      name: 'Abrir inbox',
      hotkeys: [{ modifiers: ['Mod', 'Shift'], key: 'B' }],
      callback: () => this.activateView(INBOX_VIEW_TYPE),
    })
    this.addCommand({
      id: 'open-chat',
      name: 'Vault Chat',
      hotkeys: [{ modifiers: ['Mod', 'Shift'], key: 'C' }],
      callback: () => this.activateView(CHAT_VIEW_TYPE),
    })
    this.addCommand({
      id: 'open-lint',
      name: 'Auditoria (lint)',
      hotkeys: [{ modifiers: ['Mod', 'Shift'], key: 'L' }],
      callback: () => this.activateView(LINT_VIEW_TYPE),
    })
    this.addCommand({
      id: 'git-sync',
      name: 'Sincronizar (push + pull)',
      hotkeys: [{ modifiers: ['Mod', 'Shift'], key: 'S' }],
      callback: () => this.doSync(),
    })
    this.addCommand({
      id: 'git-push',
      name: 'Push (enviar alterações)',
      hotkeys: [{ modifiers: ['Mod', 'Shift'], key: 'P' }],
      callback: () => this.doPush(),
    })
    this.addCommand({
      id: 'git-pull',
      name: 'Pull (baixar alterações)',
      hotkeys: [{ modifiers: ['Mod', 'Shift'], key: 'U' }],
      callback: () => this.doPull(),
    })
    this.addCommand({
      id: 'git-push-current',
      name: 'Push: arquivo atual',
      hotkeys: [{ modifiers: ['Mod', 'Shift'], key: 'F' }],
      callback: () => this.doPushCurrent(),
    })
    this.addCommand({
      id: 'git-status',
      name: 'Status do sync',
      hotkeys: [{ modifiers: ['Mod', 'Shift'], key: 'T' }],
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
      hotkeys: [{ modifiers: ['Mod', 'Shift'], key: 'I' }],
      callback: () => this.wiki.ingestFile(this.app.workspace.getActiveFile(), this.llm),
    })
    this.addCommand({
      id: 'approve-current',
      name: 'Aprovar: arquivo atual',
      hotkeys: [{ modifiers: ['Mod', 'Shift'], key: 'A' }],
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
      hotkeys: [{ modifiers: ['Mod', 'Shift'], key: 'X' }],
      callback: async () => {
        const file = this.app.workspace.getActiveFile()
        if (!file) { new Notice('Nenhum arquivo aberto'); return }
        await this.wiki.reject(file)
        new Notice(`Rejeitado: ${file.path}`)
      },
    })
    this.addCommand({
      id: 'write-page',
      name: 'Criar página wiki',
      hotkeys: [{ modifiers: ['Mod', 'Shift'], key: 'N' }],
      callback: async () => {
        const title = 'Nova Página'
        const content = ''
        await this.wiki.writePage(title, content, [], 'uncategorized')
        new Notice(`Página criada: ${title}`)
      },
    })
    this.addCommand({
      id: 'run-diagnostics',
      name: 'Diagnóstico (sync + adapter)',
      callback: () => new DiagnosticsModal(this.app, this.settings, this.app.vault).open(),
    })
    this.addCommand({
      id: 'clone-repository',
      name: 'Clonar repositório remoto',
      callback: () => {
        if (!this.github) { new Notice('Git não configurado. Configure o remote e token em Configurações.'); return }
        new CloneRepositoryModal(this.app, this.github, this.settings.git.remote).open()
      },
    })

    this.addRibbonIcon('inbox', 'Vault Keeper: Inbox', () => this.activateView(INBOX_VIEW_TYPE))
    this.addRibbonIcon('message-square', 'Vault Keeper: Chat', () => this.activateView(CHAT_VIEW_TYPE))
    this.addRibbonIcon('search', 'Vault Keeper: Lint', () => this.activateView(LINT_VIEW_TYPE))
    this.addRibbonIcon('wand', 'Vault Keeper: Configuração', () => this.activateView(ONBOARDING_VIEW_TYPE))

    if (this.github) {
      this.addRibbonIcon('vault-keeper-push', 'Vault Keeper: Push', () => this.doPush())
      this.addRibbonIcon('vault-keeper-pull', 'Vault Keeper: Pull', () => this.doPull())
      this.addRibbonIcon('vault-keeper-sync', 'Vault Keeper: Sync', () => this.doSync())
    }

    this.statusBarEl = this.addStatusBarItem()
    this.statusBarEl.addClass('vault-keeper-status')
    this.refreshStatusBar()

    this.setupAutoSync()

    if (this.github && this.settings.git.syncOnOpen) {
      setTimeout(() => this.autoPullOnStart(), 2000)
    }

    this.initCLIBridge()
    this.initVaultMonitor()

    if (this.github) {
      this.registerEvent(
        this.app.vault.on('modify', (file: TAbstractFile) => {
          if (!file.path.endsWith('.md')) return
          const existing = this.saveTimers.get(file.path)
          if (existing) clearTimeout(existing)
          this.saveTimers.set(file.path, setTimeout(async () => {
            this.saveTimers.delete(file.path)
            if (this.syncing) return
            const sync = this.syncForFile(file.path)
            if (!sync) return
            try {
              await sync.pushFile(file.path)
              this.refreshStatusBar()
            } catch (err: any) {
              console.error('[vault-keeper] auto-push failed:', file.path, err.message)
            }
          }, 10_000))
        })
      )
    }

    setTimeout(() => this.checkFirstRun(), 1500)
  }

  private initCLIBridge(): void {
    const cli = this.settings.cli
    if (cli?.preferred && cli.preferred !== 'none') {
      this.cliBridge = new CLIBridge(this.settings)
    } else if (cli?.autoDetect !== false) {
      CLIBridge.detect().then(async detected => {
        if (detected) {
          this.settings.cli = { ...this.settings.cli, preferred: detected }
          this.cliBridge = new CLIBridge(this.settings)
          await this.saveSettings()
        }
      }).catch(() => {})
    }
  }

  private initVaultMonitor(): void {
    const adapter = {
      read: (p: string) => this.app.vault.adapter.read(p),
      write: (p: string, c: string) => this.app.vault.adapter.write(p, c),
      exists: async (p: string) => !!(await this.app.vault.adapter.exists(p)),
      mkdir: (p: string) => this.app.vault.adapter.mkdir(p),
    }
    const persistence = new IndexPersistence(adapter)
    const monitor = new VaultIntegrityMonitor(
      this.app.vault as any,
      this.settings.wikiPath,
      persistence,
    )
    monitor.register(this)
  }

  private async checkFirstRun(): Promise<void> {
    const adapter = {
      read: (p: string) => this.app.vault.adapter.read(p),
      write: (p: string, c: string) => this.app.vault.adapter.write(p, c),
      exists: async (p: string) => !!(await this.app.vault.adapter.exists(p)),
      mkdir: (p: string) => this.app.vault.adapter.mkdir(p),
    }
    const installer = new VaultInstaller(adapter)
    const initialized = await installer.isInitialized()
    if (!initialized) {
      this.activateView(ONBOARDING_VIEW_TYPE)
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
      const allSyncs = [this.github!, ...this.projectSyncs]
      const allMsgs: string[] = []
      for (const sync of allSyncs) {
        const msgs = await sync.push((phase) => notice.setMessage(`🔄 ${phase}`))
        allMsgs.push(...msgs)
      }
      notice.hide()

      const conflicts = allMsgs.filter((m: string) => m.includes('conflito')).length
      const pushed = allMsgs.filter((m: string) => m.includes('push: ')).length
      const summary = [`✅ Push: ${pushed} enviados`]
      if (conflicts > 0) summary.push(`⚠️ ${conflicts} conflitos (backup salvo como .conflict)`)
      summary.push(...allMsgs.map((m: string) => `   ${m}`))
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
      const allSyncs = [this.github!, ...this.projectSyncs]
      const allMsgs: string[] = []
      for (const sync of allSyncs) {
        const msgs = await sync.pull((phase) => notice.setMessage(`🔄 ${phase}`))
        allMsgs.push(...msgs)
      }
      notice.hide()

      const downloaded = allMsgs.some((m: string) => m.includes('atualizados'))
      const backups = allMsgs.filter((m: string) => m.includes('backup')).length
      if (downloaded) {
        const summary = ['📥 Pull concluído']
        if (backups > 0) summary.push(`⚠️ ${backups} backups salvos (.backup)`)
        summary.push(...allMsgs.map((m: string) => `   ${m}`))
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

      const allSyncs = [this.github!, ...this.projectSyncs]
      let pushMsgs: string[] = []
      let pushFailed = false
      try {
        for (const sync of allSyncs) {
          const msgs = await sync.push((phase) => notice.setMessage(`🔄 ${phase}`))
          pushMsgs.push(...msgs)
        }
      } catch (err: any) {
        pushFailed = true
        pushMsgs = [`ERRO: ${err.message?.slice(0, 120)}`]
        await this.github!.restoreBackup()
        new Notice(`⚠️ Push falhou: ${err.message?.slice(0, 100)}`, 5000)
      }

      const pullMsgs: string[] = []
      if (!pushFailed) {
        for (const sync of allSyncs) {
          const msgs = await sync.pull((phase) => notice.setMessage(`🔄 ${phase}`))
          pullMsgs.push(...msgs)
        }
      }
      notice.hide()

      const allMsgs = [
        pushFailed ? '⚠️ Sync abortado: push falhou, pull ignorado' : '✅ Sync concluído',
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

    const sync = this.syncForFile(file.path) || this.github
    const notice = new Notice(`🔄 Push: ${file.path}...`, 0)
    try {
      const path = await sync!.pushFile(file.path)
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
    const raw = await this.loadData()
    this.settings = Object.assign({}, DEFAULT_SETTINGS, raw)
    // Migrate legacy projects: string[] → ProjectVault[]
    if (Array.isArray(this.settings.vaults?.projects)) {
      this.settings.vaults.projects = this.settings.vaults.projects.map((p: any) =>
        typeof p === 'string' ? { name: p.split('/').pop() || p, path: p, remote: '' } : p
      )
    }
  }

  async saveSettings() {
    await this.saveData(this.settings)
    this.initSyncs()
    this.setupAutoSync()
    this.refreshStatusBar()
  }

  initSyncs(): void {
    const git = this.settings.git
    if (!git.enabled || !git.remote || !git.token) {
      this.github = null
      this.projectSyncs = []
      return
    }
    const mainSettings = {
      enabled: git.enabled,
      remote: git.remote,
      token: git.token,
      authorName: git.authorName || 'Vault Keeper',
      authorEmail: git.authorEmail || 'vault@keeper.local',
      autoSyncMinutes: git.autoSyncMinutes,
      conflictStrategy: git.conflictStrategy,
    }
    const projectPaths = (this.settings.vaults.projects || []).map((p: ProjectVault) => p.path).filter(Boolean)
    try {
      this.github = new GitHubSync(this.app.vault, mainSettings, '.obsidian/vault-keeper', '', projectPaths)
    } catch (err: any) {
      new Notice(`Vault Keeper: erro ao iniciar sync — ${err.message}`, 8000)
      this.github = null
    }
    this.projectSyncs = (this.settings.vaults.projects || [])
      .filter((p: ProjectVault) => p.remote && p.path)
      .map((p: ProjectVault) => {
        try {
          return new GitHubSync(
            this.app.vault,
            { ...mainSettings, remote: p.remote, token: p.token || mainSettings.token },
            '.obsidian/vault-keeper',
            p.path,
          )
        } catch {
          return null
        }
      })
      .filter((s): s is GitHubSync => s !== null)
  }

  /** Find the sync instance responsible for a vault-relative file path. */
  private syncForFile(vaultRelPath: string): GitHubSync | null {
    for (const s of this.projectSyncs) {
      if (s.ownsFile(vaultRelPath)) return s
    }
    return this.github?.ownsFile(vaultRelPath) ? this.github : null
  }

  onunload() {
    if (this.autoSyncInterval) {
      clearInterval(this.autoSyncInterval)
    }
    if (this.github && this.settings.git.syncOnClose) {
      this.doPush().catch(() => {})
    }
  }
}
