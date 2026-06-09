import { parseFrontmatter } from '../search/index-builder'
import { IndexPersistence, type IndexEntry } from '../search/index-persistence'

interface VaultFile {
  path: string
}

interface MonitorVault {
  on(event: 'create' | 'modify', handler: (file: VaultFile) => void): any
  adapter: {
    read(path: string): Promise<string>
  }
}

interface MonitorPlugin {
  registerEvent(event: any): void
}

export class VaultIntegrityMonitor {
  private debounceTimers = new Map<string, ReturnType<typeof setTimeout>>()

  constructor(
    private vault: MonitorVault,
    private wikiPath: string,
    private indexPersistence: IndexPersistence,
    private debounceMs = 2000,
  ) {}

  register(plugin: MonitorPlugin): void {
    plugin.registerEvent(this.vault.on('create', (file) => this.onFileChange(file)))
    plugin.registerEvent(this.vault.on('modify', (file) => this.onFileChange(file)))
  }

  private onFileChange(file: VaultFile): void {
    if (!file.path.startsWith(this.wikiPath + '/')) return
    if (!file.path.endsWith('.md')) return

    const existing = this.debounceTimers.get(file.path)
    if (existing) clearTimeout(existing)

    const timer = setTimeout(() => {
      this.debounceTimers.delete(file.path)
      this.reindexFile(file).catch(() => {})
    }, this.debounceMs)

    this.debounceTimers.set(file.path, timer)
  }

  async reindexFile(file: VaultFile): Promise<void> {
    const content = await this.vault.adapter.read(file.path)
    const { data } = parseFrontmatter(content)

    const entry: IndexEntry = {
      path: file.path,
      title: typeof data.title === 'string' && data.title ? data.title : basename(file.path),
      summary: typeof data.summary === 'string' ? data.summary : '',
      tags: Array.isArray(data.tags) ? data.tags : [],
      key_entities: Array.isArray(data.key_entities) ? data.key_entities : [],
    }

    await this.indexPersistence.upsert(entry)
  }
}

function basename(path: string): string {
  return path.slice(path.lastIndexOf('/') + 1).replace(/\.md$/, '')
}
