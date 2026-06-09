/**
 * Manages _slots/ state files — mutable session context the agent reads and
 * the curator writes. Follows the Karpathy LLM Wiki pattern for live state
 * that persists across sessions without polluting the compiled wiki.
 * Pure-TS: no obsidian import, adapter injected via constructor.
 */

interface VaultAdapter {
  read(path: string): Promise<string>
  write(path: string, content: string): Promise<void>
  exists(path: string): Promise<boolean>
  mkdir(path: string): Promise<void>
}

export class SlotsManager {
  static readonly slotsDir = '_slots'

  constructor(private readonly adapter: VaultAdapter) {}

  async readSlot(name: string): Promise<string | null> {
    try {
      return await this.adapter.read(`${SlotsManager.slotsDir}/${name}.md`)
    } catch {
      return null
    }
  }

  async writeSlot(name: string, content: string): Promise<void> {
    const dirExists = await this.adapter.exists(SlotsManager.slotsDir)
    if (!dirExists) await this.adapter.mkdir(SlotsManager.slotsDir)
    await this.adapter.write(`${SlotsManager.slotsDir}/${name}.md`, content)
  }
}
