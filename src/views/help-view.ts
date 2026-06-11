import { ItemView, WorkspaceLeaf, Notice } from 'obsidian'
import type VaultKeeperPlugin from '../main'
import { CLIBridge } from '../agents/cli-bridge'
import { button, card, badge } from './ui'

export const HELP_VIEW_TYPE = 'vault-keeper-help'

type FileStatus = 'atualizado' | 'desatualizado' | 'ausente'
interface InstructionFileStatus { name: string; status: FileStatus }

export class HelpView extends ItemView {
  plugin: VaultKeeperPlugin
  private resultsEl: HTMLElement | null = null

  constructor(leaf: WorkspaceLeaf, plugin: VaultKeeperPlugin) {
    super(leaf)
    this.plugin = plugin
  }

  getViewType(): string { return HELP_VIEW_TYPE }
  getDisplayText(): string { return 'Vault Keeper — Ajuda' }
  getIcon(): string { return 'help-circle' }

  async onOpen() {
    this.contentEl.empty()
    this.contentEl.style.padding = '24px'
    this.contentEl.style.maxWidth = '680px'
    this.contentEl.style.overflow = 'auto'
    this.render()
  }

  private render() {
    this.renderFlow()
    this.renderShortcuts()
    this.renderCurrentConfig()
    this.renderLinkRules()
    this.renderInstructionSection()
  }

  private renderFlow() {
    this.contentEl.createEl('h2', { text: 'Vault Keeper — Como funciona' })

    const s = this.plugin.settings
    const inbox = s.inboxPath ?? 'inbox'
    const raw = s.rawPath ?? 'raw'
    const wiki = s.wikiPath ?? 'wiki'

    const flowEl = this.contentEl.createEl('pre')
    flowEl.style.background = 'var(--background-secondary)'
    flowEl.style.padding = '12px'
    flowEl.style.borderRadius = '6px'
    flowEl.style.fontSize = '0.85em'
    flowEl.style.overflowX = 'auto'
    flowEl.textContent = [
      `${inbox}/*.md ──[aprovar]──▶ ${raw}/*.md ──[ingest LLM]──▶ ${wiki}/*.md`,
      `(status: inbox)           (status: approved)          (status: ingested)`,
      `                                                              │`,
      `                                                   .vault-keeper/`,
      `                                                   bm25-index.json`,
      `                                                              │`,
      `                                              [query] ◀───────┴──▶ [lint]`,
    ].join('\n')
  }

  private renderShortcuts() {
    this.contentEl.createEl('h3', { text: 'Atalhos de teclado' })
    const table = this.contentEl.createEl('table')
    table.style.borderCollapse = 'collapse'
    table.style.width = '100%'
    const head = table.createEl('thead').createEl('tr')
    for (const h of ['Ação', 'Atalho']) {
      const th = head.createEl('th', { text: h })
      th.style.textAlign = 'left'
      th.style.padding = '4px 8px'
      th.style.borderBottom = '1px solid var(--background-modifier-border)'
    }
    const shortcuts: [string, string][] = [
      ['Abrir Inbox', 'Mod+Shift+B'],
      ['Vault Chat', 'Mod+Shift+C'],
      ['Auditoria', 'Mod+Shift+L'],
      ['Ingest: arquivo atual', 'Mod+Shift+I'],
      ['Aprovar: arquivo atual', 'Mod+Shift+A'],
      ['Rejeitar: arquivo atual', 'Mod+Shift+X'],
      ['Push (enviar)', 'Mod+Shift+P'],
      ['Pull (baixar)', 'Mod+Shift+U'],
      ['Sync (push+pull)', 'Mod+Shift+S'],
      ['Foco de projeto', 'Mod+Shift+O'],
    ]
    const tbody = table.createEl('tbody')
    for (const [action, key] of shortcuts) {
      const row = tbody.createEl('tr')
      row.createEl('td', { text: action }).style.padding = '3px 8px'
      const keyEl = row.createEl('td').createEl('kbd', { text: key })
      keyEl.style.padding = '2px 6px'
      keyEl.style.background = 'var(--background-secondary)'
      keyEl.style.borderRadius = '3px'
      keyEl.style.fontSize = '0.85em'
    }
  }

  private renderCurrentConfig() {
    this.contentEl.createEl('h3', { text: 'Configuração atual' })
    const s = this.plugin.settings
    const c = card(this.contentEl)
    c.style.fontSize = '0.9em'

    const paths: [string, string][] = [
      ['Inbox', s.inboxPath ?? 'inbox'],
      ['Raw', s.rawPath ?? 'raw'],
      ['Wiki', s.wikiPath ?? 'wiki'],
      ['Index', s.indexPath ?? 'wiki/index.md'],
      ['LLM', s.llm?.model ? `${s.llm.model} (${s.llm.endpoint})` : 'não configurado'],
    ]
    for (const [label, val] of paths) {
      const row = c.createEl('div')
      row.style.display = 'flex'
      row.style.gap = '8px'
      row.style.marginBottom = '4px'
      row.createEl('strong', { text: label + ':' })
      row.createEl('code', { text: val })
    }

    const projects = s.vaults?.projects ?? []
    if (projects.length > 0) {
      c.createEl('div', { text: '' }).style.marginTop = '8px'
      c.createEl('strong', { text: `Projetos (${projects.length}):` })
      const ul = c.createEl('ul')
      ul.style.marginTop = '4px'
      for (const p of projects) {
        const li = ul.createEl('li')
        li.createEl('code', { text: p.path + '/' })
        li.appendText(` — ${p.name}${p.remote ? '' : ' (sem remote)'}`)
      }
    }
  }

  private renderLinkRules() {
    this.contentEl.createEl('h3', { text: 'Regras de link (B-007)' })

    const c = card(this.contentEl)
    c.style.fontSize = '0.9em'

    const rules: [string, string][] = [
      ['✔ CORRETO', '[[wiki/nome-da-pagina]] — project-relative, funciona standalone e no vault raiz'],
      ['✘ ERRADO', '[[projects/X/wiki/nome]] — quebra no vault standalone'],
    ]
    for (const [label, desc] of rules) {
      const row = c.createEl('div')
      row.style.display = 'flex'
      row.style.gap = '8px'
      row.style.marginBottom = '6px'
      row.style.alignItems = 'flex-start'
      const badge = row.createEl('code', { text: label })
      badge.style.color = label.startsWith('✔') ? 'var(--color-green)' : 'var(--color-red)'
      badge.style.minWidth = '80px'
      row.createEl('span', { text: desc })
    }

    const note = c.createEl('p')
    note.style.marginTop = '8px'
    note.style.marginBottom = '0'
    note.style.fontSize = '0.85em'
    note.style.color = 'var(--text-muted)'
    note.textContent =
      'O Obsidian resolve [[wiki/slug]] para projects/X/wiki/slug.md via shortest-path no vault raiz. ' +
      'Notas pessoais da raiz sobre um projeto recebem prefixo: montisol-slug.md.'
  }

  private renderInstructionSection() {
    this.contentEl.createEl('h3', { text: 'Instruções para IA' })

    const desc = this.contentEl.createEl('p')
    desc.style.fontSize = '0.9em'
    desc.style.color = 'var(--text-muted)'
    desc.textContent =
      'Os arquivos CLAUDE.md, GEMINI.md e AGENTS.md na raiz do vault instruem o CLI sobre os fluxos do plugin. ' +
      'Este botão verifica se estão sincronizados com a configuração atual e corrige divergências.'

    const row = this.contentEl.createEl('div')
    row.style.display = 'flex'
    row.style.gap = '8px'
    row.style.alignItems = 'center'
    row.style.flexWrap = 'wrap'

    button('Atualizar instruções para IA', true, async () => {
      await this.fixInstructions()
    }, row)

    button('Verificar status', false, async () => {
      await this.checkStatus()
    }, row)

    this.resultsEl = this.contentEl.createEl('div')
    this.resultsEl.style.marginTop = '12px'
  }

  private async checkStatus() {
    const { vault } = this.plugin.app
    const generated = CLIBridge.buildInstructions(this.plugin.settings)
    const statuses: InstructionFileStatus[] = []

    for (const name of Object.keys(generated) as (keyof typeof generated)[]) {
      const exists = await vault.adapter.exists(name)
      if (!exists) {
        statuses.push({ name, status: 'ausente' })
        continue
      }
      const current = await vault.adapter.read(name)
      statuses.push({ name, status: current === generated[name] ? 'atualizado' : 'desatualizado' })
    }

    this.renderStatusResults(statuses, false)
  }

  private async fixInstructions() {
    const { vault } = this.plugin.app
    const generated = CLIBridge.buildInstructions(this.plugin.settings)
    const statuses: InstructionFileStatus[] = []

    for (const [name, content] of Object.entries(generated)) {
      const exists = await vault.adapter.exists(name)
      if (!exists) {
        await vault.adapter.write(name, content)
        statuses.push({ name, status: 'ausente' })
      } else {
        const current = await vault.adapter.read(name)
        if (current !== content) {
          await vault.adapter.write(name, content)
          statuses.push({ name, status: 'desatualizado' })
        } else {
          statuses.push({ name, status: 'atualizado' })
        }
      }
    }

    this.renderStatusResults(statuses, true)

    const updated = statuses.filter(s => s.status !== 'atualizado').length
    new Notice(updated > 0 ? `${updated} arquivo(s) corrigido(s)` : 'Instruções já estavam corretas')
  }

  private renderStatusResults(statuses: InstructionFileStatus[], didFix: boolean) {
    if (!this.resultsEl) return
    this.resultsEl.empty()

    const title = this.resultsEl.createEl('strong', {
      text: didFix ? 'Resultado da atualização:' : 'Status atual:',
    })
    title.style.display = 'block'
    title.style.marginBottom = '6px'

    for (const { name, status } of statuses) {
      const row = this.resultsEl.createEl('div')
      row.style.display = 'flex'
      row.style.alignItems = 'center'
      row.style.gap = '8px'
      row.style.marginBottom = '4px'

      const color = status === 'atualizado'
        ? 'var(--color-green)'
        : status === 'desatualizado'
          ? 'var(--color-orange)'
          : 'var(--color-red)'

      const label = status === 'atualizado'
        ? (didFix ? '✔ sem mudanças' : '✔ atualizado')
        : status === 'desatualizado'
          ? (didFix ? '↺ corrigido' : '⚠ desatualizado')
          : (didFix ? '✚ criado' : '✘ ausente')

      const b = row.createEl('span', { text: label })
      b.style.color = color
      b.style.minWidth = '110px'
      b.style.fontSize = '0.85em'
      row.createEl('code', { text: name })
    }
  }
}
