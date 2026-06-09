import { defaultVaultTemplate } from './templates'

interface VaultAdapter {
  read(path: string): Promise<string>
  write(path: string, content: string): Promise<void>
  exists(path: string): Promise<boolean>
  mkdir(path: string): Promise<void>
}

export class VaultInstaller {
  private static readonly standardDirs = ['inbox', 'raw', 'wiki', '_slots', '.vault-keeper']

  constructor(private adapter: VaultAdapter) {}

  async isInitialized(): Promise<boolean> {
    const [hasInbox, hasWiki] = await Promise.all([
      this.adapter.exists('inbox'),
      this.adapter.exists('wiki'),
    ])
    return hasInbox && hasWiki
  }

  async ensureStructure(): Promise<{ created: string[]; skipped: string[] }> {
    const template = defaultVaultTemplate()
    const created: string[] = []
    const skipped: string[] = []

    for (const dir of template.dirs) {
      if (!(await this.adapter.exists(dir))) {
        await this.adapter.mkdir(dir)
        created.push(dir + '/')
      } else {
        skipped.push(dir + '/')
      }
    }

    for (const file of template.files) {
      if (!(await this.adapter.exists(file.path))) {
        await this.adapter.write(file.path, file.content)
        created.push(file.path)
      } else {
        skipped.push(file.path)
      }
    }

    return { created, skipped }
  }

  async migrateExistingFiles(allFiles: string[]): Promise<{ migrated: string[] }> {
    const migrated: string[] = []

    for (const filePath of allFiles) {
      if (!filePath.endsWith('.md')) continue
      if (VaultInstaller.isInStandardDir(filePath)) continue

      const slug = filePath.replace(/\//g, '-').replace(/\.md$/, '')
      const inboxPath = `inbox/${slug}.md`

      if (await this.adapter.exists(inboxPath)) continue

      try {
        const content = await this.adapter.read(filePath)
        await this.adapter.write(inboxPath, VaultInstaller.addMigrationFrontmatter(content, filePath))
        migrated.push(filePath)
      } catch {
        // skip unreadable files
      }
    }

    return { migrated }
  }

  static isInStandardDir(filePath: string): boolean {
    return VaultInstaller.standardDirs.some(
      dir => filePath.startsWith(dir + '/') || filePath === dir,
    )
  }

  static addMigrationFrontmatter(content: string, sourcePath: string): string {
    if (content.startsWith('---\n')) {
      return content.replace(/^---\n/, `---\nstatus: inbox\nsource_path: ${sourcePath}\n`)
    }
    return `---\nstatus: inbox\nsource_path: ${sourcePath}\n---\n\n${content}`
  }
}
