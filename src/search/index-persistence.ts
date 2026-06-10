/**
 * Persists the lightweight BM25 index to `.vault-keeper/bm25-index.json`.
 * Pure-TS: no obsidian import, no I/O beyond the injected adapter.
 * Allows gatherContext() to pre-filter by summary/title/tags without reading
 * every wiki page on each query (fast path: O(1 JSON read + K full reads)).
 */

export interface IndexEntry {
  path: string
  title: string
  summary: string
  tags: string[]
  key_entities: string[]
}

interface IndexFile {
  version: 1
  entries: IndexEntry[]
}

interface VaultAdapter {
  read(path: string): Promise<string>
  write(path: string, content: string): Promise<void>
  exists(path: string): Promise<boolean>
  mkdir(path: string): Promise<void>
}

export class IndexPersistence {
  static readonly indexPath = '.vault-keeper/bm25-index.json'
  static readonly dataDir = '.vault-keeper'

  private writeQueue: Promise<void> = Promise.resolve()

  constructor(private readonly adapter: VaultAdapter) {}

  async load(): Promise<IndexEntry[]> {
    try {
      const raw = await this.adapter.read(IndexPersistence.indexPath)
      const parsed = JSON.parse(raw) as IndexFile
      return Array.isArray(parsed.entries) ? parsed.entries : []
    } catch {
      return []
    }
  }

  async save(entries: IndexEntry[]): Promise<void> {
    const dirExists = await this.adapter.exists(IndexPersistence.dataDir)
    if (!dirExists) await this.adapter.mkdir(IndexPersistence.dataDir)
    const file: IndexFile = { version: 1, entries }
    await this.adapter.write(IndexPersistence.indexPath, JSON.stringify(file, null, 2))
  }

  async upsert(entry: IndexEntry): Promise<void> {
    this.writeQueue = this.writeQueue.then(async () => {
      const entries = await this.load()
      const idx = entries.findIndex(e => e.path === entry.path)
      if (idx === -1) entries.push(entry)
      else entries[idx] = entry
      await this.save(entries)
    })
    return this.writeQueue
  }

  async remove(path: string): Promise<void> {
    this.writeQueue = this.writeQueue.then(async () => {
      const entries = await this.load()
      await this.save(entries.filter(e => e.path !== path))
    })
    return this.writeQueue
  }
}
