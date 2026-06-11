import { App, Modal, Notice } from 'obsidian'
import type { GitHubSync } from './sync'

export class CloneRepositoryModal extends Modal {
  private sync: GitHubSync
  private remote: string

  constructor(app: App, sync: GitHubSync, remote: string) {
    super(app)
    this.sync = sync
    this.remote = remote
  }

  onOpen() {
    const { contentEl } = this
    contentEl.empty()
    contentEl.createEl('h2', { text: 'Clonar repositório' })
    contentEl.createEl('p', { text: `Remote: ${this.remote}` })
    contentEl.createEl('p', {
      text: 'Todos os arquivos .md do branch main serão baixados. Arquivos locais com o mesmo caminho serão sobrescritos.',
    })

    const btnRow = contentEl.createEl('div')
    btnRow.style.display = 'flex'
    btnRow.style.gap = '8px'
    btnRow.style.marginTop = '12px'

    const confirmBtn = btnRow.createEl('button', { text: 'Clonar' })
    confirmBtn.style.fontWeight = 'bold'
    const cancelBtn = btnRow.createEl('button', { text: 'Cancelar' })

    confirmBtn.addEventListener('click', () => {
      this.close()
      this.startClone()
    })
    cancelBtn.addEventListener('click', () => this.close())
  }

  private async startClone() {
    let lastNotice: Notice | undefined
    try {
      await this.sync.clone((msg) => {
        lastNotice?.hide()
        lastNotice = new Notice(msg, 0)
      })
      lastNotice?.hide()
      new Notice('Clone concluído ✅', 6000)
    } catch (err: any) {
      lastNotice?.hide()
      new Notice(`Erro no clone: ${err.message}`, 8000)
    }
  }

  onClose() {
    this.contentEl.empty()
  }
}
