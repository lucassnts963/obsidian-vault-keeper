import { App, Modal } from 'obsidian'

export type ConflictDecision = 'keep-local' | 'keep-remote' | 'keep-both'

export interface ConflictInfo {
  path: string
  localSHA: string
  remoteSHA: string
}

/**
 * Presents conflicting files to the user and collects a per-file resolution.
 * Resolves with a Map<path, decision> when the user confirms.
 */
export class ConflictResolutionModal extends Modal {
  private conflicts: ConflictInfo[]
  private decisions: Map<string, ConflictDecision>
  private resolve!: (decisions: Map<string, ConflictDecision>) => void

  constructor(app: App, conflicts: ConflictInfo[]) {
    super(app)
    this.conflicts = conflicts
    this.decisions = new Map(conflicts.map(c => [c.path, 'keep-both']))
  }

  open(): this {
    super.open()
    return this
  }

  /** Returns a promise that resolves when the user confirms. */
  waitForDecision(): Promise<Map<string, ConflictDecision>> {
    return new Promise(res => { this.resolve = res })
  }

  onOpen(): void {
    const { contentEl } = this
    contentEl.empty()

    contentEl.createEl('h2', { text: '⚠️ Conflitos de Sincronização' })
    contentEl.createEl('p', {
      text: 'Os arquivos abaixo foram modificados localmente e no repositório remoto. Escolha como resolver cada um:',
      cls: 'setting-item-description',
    })

    // Quick-apply row
    const globalRow = contentEl.createDiv({ cls: 'vault-keeper-conflict-global' })
    globalRow.style.cssText = 'display:flex;gap:8px;margin-bottom:12px;flex-wrap:wrap'
    globalRow.createEl('span', { text: 'Aplicar a todos:' }).style.cssText = 'align-self:center;font-size:12px;color:var(--text-muted)'
    const mkGlobal = (label: string, decision: ConflictDecision) => {
      const btn = globalRow.createEl('button', { text: label })
      btn.style.fontSize = '11px'
      btn.addEventListener('click', () => {
        this.conflicts.forEach(c => {
          this.decisions.set(c.path, decision)
        })
        this.renderRows(list)
      })
    }
    mkGlobal('Minha versão', 'keep-local')
    mkGlobal('Versão remota', 'keep-remote')
    mkGlobal('Manter ambos', 'keep-both')

    const list = contentEl.createDiv()
    this.renderRows(list)

    // Footer
    const footer = contentEl.createDiv()
    footer.style.cssText = 'margin-top:16px;display:flex;justify-content:flex-end;gap:8px'

    const cancelBtn = footer.createEl('button', { text: 'Cancelar push' })
    cancelBtn.addEventListener('click', () => {
      // cancel = keep-remote for all (nothing pushed)
      this.conflicts.forEach(c => this.decisions.set(c.path, 'keep-remote'))
      this.close()
    })

    const confirmBtn = footer.createEl('button', { text: 'Confirmar', cls: 'mod-cta' })
    confirmBtn.addEventListener('click', () => this.close())
  }

  private renderRows(container: HTMLElement): void {
    container.empty()
    for (const c of this.conflicts) {
      const row = container.createDiv()
      row.style.cssText = 'border:1px solid var(--background-modifier-border);border-radius:6px;padding:8px;margin-bottom:8px'

      const title = row.createEl('div', { text: c.path })
      title.style.cssText = 'font-family:var(--font-monospace);font-size:12px;margin-bottom:6px;color:var(--text-normal)'

      const btns = row.createDiv()
      btns.style.cssText = 'display:flex;gap:6px;flex-wrap:wrap'

      const current = this.decisions.get(c.path) ?? 'keep-both'

      const options: Array<{ key: ConflictDecision; label: string; desc: string }> = [
        { key: 'keep-local',  label: 'Minha versão',   desc: 'Envia o arquivo local para o repositório' },
        { key: 'keep-remote', label: 'Versão remota',  desc: 'Descarta alterações locais, mantém o remoto' },
        { key: 'keep-both',   label: 'Manter ambos',   desc: 'Salva cópia local como .conflict.md; remoto entra no próximo pull' },
      ]

      for (const opt of options) {
        const btn = btns.createEl('button', { text: opt.label })
        btn.title = opt.desc
        btn.style.fontSize = '11px'
        if (current === opt.key) {
          btn.style.background = 'var(--interactive-accent)'
          btn.style.color = 'var(--text-on-accent)'
          btn.style.border = '1px solid var(--interactive-accent)'
        }
        btn.addEventListener('click', () => {
          this.decisions.set(c.path, opt.key)
          this.renderRows(container)
        })
      }
    }
  }

  onClose(): void {
    this.resolve?.(this.decisions)
    this.contentEl.empty()
  }
}
