import { App, Modal, type Vault } from 'obsidian'
import type { VaultKeeperSettings } from '../settings'
import { runDiagnostics, toMarkdown } from './probe'

export class DiagnosticsModal extends Modal {
  private settings: VaultKeeperSettings
  private vault: Vault

  constructor(app: App, settings: VaultKeeperSettings, vault: Vault) {
    super(app)
    this.settings = settings
    this.vault = vault
  }

  async onOpen() {
    const { contentEl } = this
    contentEl.empty()
    contentEl.createEl('h2', { text: 'Diagnóstico — Vault Keeper' })

    const loading = contentEl.createEl('p', { text: '⏳ Executando diagnóstico...' })

    let md = ''
    try {
      const report = await runDiagnostics(this.vault, this.settings)
      md = toMarkdown(report)
      console.log('[vault-keeper] diagnostics:\n', md)
    } catch (e: any) {
      md = `Erro ao executar diagnóstico: ${e.message}`
    }

    loading.remove()

    const textarea = contentEl.createEl('textarea')
    textarea.value = md
    textarea.style.width = '100%'
    textarea.style.height = '400px'
    textarea.style.fontFamily = 'monospace'
    textarea.style.fontSize = '12px'
    textarea.readOnly = true

    const btnRow = contentEl.createEl('div')
    btnRow.style.display = 'flex'
    btnRow.style.gap = '8px'
    btnRow.style.marginTop = '8px'

    const copyBtn = btnRow.createEl('button', { text: 'Copiar' })
    copyBtn.addEventListener('click', async () => {
      try {
        await navigator.clipboard.writeText(md)
        copyBtn.textContent = 'Copiado ✅'
        setTimeout(() => { copyBtn.textContent = 'Copiar' }, 2000)
      } catch {
        textarea.select()
        document.execCommand('copy')
      }
    })

    const saveBtn = btnRow.createEl('button', { text: 'Salvar em _slots/diagnostics.md' })
    saveBtn.addEventListener('click', async () => {
      try {
        await this.vault.adapter.write('_slots/diagnostics.md', md)
        saveBtn.textContent = 'Salvo ✅'
      } catch (e: any) {
        saveBtn.textContent = `Erro: ${e.message?.slice(0, 40)}`
      }
    })
  }

  onClose() {
    this.contentEl.empty()
  }
}
