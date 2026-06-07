import type { Vault } from 'obsidian'

/** Registro append-only de operações no log.md */
export class Logger {
  private vault: Vault

  constructor(vault: Vault) {
    this.vault = vault
  }

  async log(operation: string, details: string): Promise<void> {
    const logPath = 'wiki/log.md'
    const date = new Date().toISOString().slice(0, 10)
    const entry = `## [${date}] ${operation} | ${details}`

    const exists = await this.vault.adapter.exists(logPath)
    if (exists) {
      const content = await this.vault.adapter.read(logPath)
      await this.vault.adapter.write(logPath, entry + '\n\n' + content)
    } else {
      await this.vault.adapter.write(logPath, `# Log\n\n${entry}\n`)
    }
  }
}
