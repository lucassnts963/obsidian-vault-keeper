import type { Vault } from 'obsidian'

/** Registro append-only de operações no log.md */
export class Logger {
  private vault: Vault
  private logPath: string

  constructor(vault: Vault, logPath = 'wiki/log.md') {
    this.vault = vault
    this.logPath = logPath
  }

  async log(operation: string, details: string): Promise<void> {
    const date = new Date().toISOString().slice(0, 10)
    const entry = `## [${date}] ${operation} | ${details}`

    const exists = await this.vault.adapter.exists(this.logPath)
    if (exists) {
      const content = await this.vault.adapter.read(this.logPath)
      await this.vault.adapter.write(this.logPath, entry + '\n\n' + content)
    } else {
      await this.vault.adapter.write(this.logPath, `# Log\n\n${entry}\n`)
    }
  }
}
