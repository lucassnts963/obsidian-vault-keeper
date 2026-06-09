import { ItemView, WorkspaceLeaf, Notice } from 'obsidian'
import type VaultKeeperPlugin from '../main'
import { VaultInstaller } from '../scaffold/installer'
import { CLIBridge } from '../agents/cli-bridge'
import { button, center } from './ui'

export const ONBOARDING_VIEW_TYPE = 'vault-keeper-onboarding'

type Step = 'welcome' | 'fresh' | 'migrate' | 'done'

export class OnboardingView extends ItemView {
  plugin: VaultKeeperPlugin
  private step: Step = 'welcome'
  private migrateResult: { migrated: string[] } | null = null

  constructor(leaf: WorkspaceLeaf, plugin: VaultKeeperPlugin) {
    super(leaf)
    this.plugin = plugin
  }

  getViewType(): string { return ONBOARDING_VIEW_TYPE }
  getDisplayText(): string { return 'Vault Keeper — Configuração' }
  getIcon(): string { return 'wand' }

  async onOpen() { this.render() }

  render() {
    this.contentEl.empty()
    this.contentEl.style.padding = '24px'
    this.contentEl.style.maxWidth = '640px'

    switch (this.step) {
      case 'welcome': return this.renderWelcome()
      case 'fresh':   return this.renderFreshSetup()
      case 'migrate': return this.renderMigrate()
      case 'done':    return this.renderDone()
    }
  }

  private renderWelcome() {
    this.contentEl.createEl('h2', { text: 'Bem-vindo ao Vault Keeper' })
    this.contentEl.createEl('p', {
      text: 'Este plugin organiza seu vault usando a metodologia LLM Wiki:',
    })

    const ul = this.contentEl.createEl('ul')
    for (const item of [
      'inbox/ — notas brutas que chegam',
      'raw/ — notas aprovadas aguardando compilação',
      'wiki/ — páginas compiladas e indexadas',
      '_slots/ — estado da sessão atual',
    ]) {
      ul.createEl('li').createEl('code', { text: item })
    }

    this.contentEl.createEl('p', {
      text: 'Todo o "pensamento" fica no seu CLI favorito (Claude Code, Gemini CLI, OpenCode). ' +
        'O plugin cuida da estrutura, sincronização e navegação.',
    })

    const row = this.contentEl.createEl('div')
    row.style.display = 'flex'
    row.style.gap = '12px'
    row.style.marginTop = '20px'

    button('Começar do zero', true, () => { this.step = 'fresh'; this.render() }, row)
    button('Migrar vault existente', false, () => { this.step = 'migrate'; this.render() }, row)
  }

  private async renderFreshSetup() {
    center('Criando estrutura...', this.contentEl)

    const adapter = {
      read: (p: string) => this.plugin.app.vault.adapter.read(p),
      write: (p: string, c: string) => this.plugin.app.vault.adapter.write(p, c),
      exists: async (p: string) => !!(await this.plugin.app.vault.adapter.exists(p)),
      mkdir: (p: string) => this.plugin.app.vault.adapter.mkdir(p),
    }

    const installer = new VaultInstaller(adapter)
    const result = await installer.ensureStructure()
    await this.writeInstructionFiles()

    this.contentEl.empty()
    this.contentEl.createEl('h2', { text: 'Estrutura criada!' })

    if (result.created.length > 0) {
      this.contentEl.createEl('p', { text: `${result.created.length} itens criados:` })
      const ul = this.contentEl.createEl('ul')
      for (const p of result.created) ul.createEl('li').createEl('code', { text: p })
    } else {
      this.contentEl.createEl('p', { text: 'Estrutura já existia — nada foi alterado.' })
    }

    this.contentEl.createEl('p', { text: 'Arquivos de instrução gerados: CLAUDE.md, GEMINI.md, AGENTS.md' })

    button('Abrir Inbox', true, () => {
      this.plugin.activateView('vault-keeper-inbox')
    }, this.contentEl)
  }

  private async renderMigrate() {
    center('Escaneando vault...', this.contentEl)

    const vault = this.plugin.app.vault
    const adapter = {
      read: (p: string) => vault.adapter.read(p),
      write: (p: string, c: string) => vault.adapter.write(p, c),
      exists: async (p: string) => !!(await vault.adapter.exists(p)),
      mkdir: (p: string) => vault.adapter.mkdir(p),
    }

    const installer = new VaultInstaller(adapter)
    await installer.ensureStructure()

    const allFiles = vault.getMarkdownFiles().map(f => f.path)
    this.migrateResult = await installer.migrateExistingFiles(allFiles)
    await this.writeInstructionFiles()

    this.contentEl.empty()
    this.contentEl.createEl('h2', { text: 'Migração concluída' })

    if (this.migrateResult.migrated.length > 0) {
      this.contentEl.createEl('p', {
        text: `${this.migrateResult.migrated.length} arquivo(s) copiados para inbox/ com prefixo de caminho original.`,
      })
      this.contentEl.createEl('p', {
        text: 'Os arquivos originais não foram modificados. Você pode revisá-los no Inbox.',
      })
    } else {
      this.contentEl.createEl('p', {
        text: 'Nenhum arquivo fora da estrutura padrão encontrado — seu vault já está organizado.',
      })
    }

    this.contentEl.createEl('p', { text: 'Arquivos de instrução gerados: CLAUDE.md, GEMINI.md, AGENTS.md' })

    const row = this.contentEl.createEl('div')
    row.style.display = 'flex'
    row.style.gap = '12px'
    row.style.marginTop = '16px'

    if (this.migrateResult.migrated.length > 0) {
      button('Aprovar tudo', false, () => this.approveAll(), row)
    }
    button('Revisar no Inbox', true, () => {
      this.plugin.activateView('vault-keeper-inbox')
    }, row)
  }

  private async approveAll() {
    if (!this.migrateResult) return
    let count = 0
    for (const original of this.migrateResult.migrated) {
      const slug = original.replace(/\//g, '-').replace(/\.md$/, '')
      const inboxPath = `inbox/${slug}.md`
      try {
        const raw = await this.plugin.app.vault.adapter.read(inboxPath)
        const updated = raw.replace(/^status: inbox$/m, 'status: approved')
        await this.plugin.app.vault.adapter.write(inboxPath, updated)
        count++
      } catch {}
    }
    new Notice(`${count} arquivo(s) aprovados`)
    this.plugin.activateView('vault-keeper-inbox')
  }

  private async writeInstructionFiles() {
    const files = CLIBridge.buildInstructions()
    for (const [name, content] of Object.entries(files)) {
      try {
        await this.plugin.app.vault.adapter.write(name, content)
      } catch {}
    }
  }

  private renderDone() {
    center('Configuração concluída!', this.contentEl)
  }
}
