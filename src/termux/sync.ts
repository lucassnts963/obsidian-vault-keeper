import { Notice, type Vault } from 'obsidian'

/**
 * Bridge Termux — ultra simples.
 * O plugin gera comandos git, o usuário cola no Termux.
 * Sem integração complexa, sem intent, sem breaking changes.
 */
export class TermuxSync {
  private vault: Vault

  constructor(vault: Vault) {
    this.vault = vault
  }

  /** Copia texto pro clipboard (funciona no WebView mobile) */
  private async copy(text: string): Promise<boolean> {
    try {
      await navigator.clipboard.writeText(text)
      return true
    } catch {
      return false
    }
  }

  /** Mostra comando e tenta copiar */
  private async show(label: string, command: string): Promise<void> {
    const copied = await this.copy(command)
    const prefix = copied ? '📋 Copiado! ' : ''
    new Notice(
      `${prefix}${label} — cole no Termux:\n\n${command}`,
      12000,
    )
  }

  /**
   * Push: add, commit, push.
   * Só marca arquivos .md, ignora .obsidian e binários.
   */
  async push(): Promise<void> {
    const now = new Date().toISOString().replace('T', ' ').slice(0, 19)
    const commands = [
      'cd /storage/emulated/0/Documents/Obsidian/Knowledge',
      'git add *.md inbox/*.md raw/*.md wiki/*.md wiki/**/*.md templates/*.md',
      `git commit -m "vault: sync ${now}" || echo "nada pra commitar"`,
      'git push',
    ].join(' && ')
    await this.show('Push', commands)
  }

  /**
   * Pull: fetch + merge.
   */
  async pull(): Promise<void> {
    const commands = [
      'cd /storage/emulated/0/Documents/Obsidian/Knowledge',
      'git pull --no-rebase',
    ].join(' && ')
    await this.show('Pull', commands)
  }

  /**
   * Sync completo.
   */
  async sync(): Promise<void> {
    const now = new Date().toISOString().replace('T', ' ').slice(0, 19)
    const commands = [
      'cd /storage/emulated/0/Documents/Obsidian/Knowledge',
      'git pull --no-rebase',
      'git add *.md inbox/*.md raw/*.md wiki/*.md wiki/**/*.md templates/*.md',
      `git commit -m "vault: sync ${now}" || echo "nada pra commitar"`,
      'git push',
    ].join(' && ')
    await this.show('Sync completo', commands)
  }

  /**
   * Status rápido — lê arquivos .git/ via vault adapter.
   */
  async status(): Promise<string> {
    try {
      // Tenta ler HEAD pra ver o branch
      const head = await this.vault.adapter.read('.git/HEAD')
      const branch = head.replace('ref: refs/heads/', '').trim()

      // Tenta ler o último commit
      let lastCommit = '?'
      try {
        const refPath = `.git/refs/heads/${branch}`
        const sha = await this.vault.adapter.read(refPath)
        lastCommit = sha.trim().slice(0, 7)
      } catch {}

      return `git: ${branch} (${lastCommit})`
    } catch {
      return 'git: ???'
    }
  }
}
