import type { Vault, TFile } from 'obsidian'
import type { VaultKeeperSettings } from '../settings'
import type { LLMProvider } from '../llm/provider'
import { PROMPTS } from '../llm/provider'

/**
 * Operações de wiki: ingest, write page, update index, update log.
 */
export class WikiOps {
  private vault: Vault
  private settings: VaultKeeperSettings

  constructor(vault: Vault, settings: VaultKeeperSettings) {
    this.vault = vault
    this.settings = settings
  }

  /** Lê arquivo fonte → LLM propõe página wiki → cria */
  async ingestFile(file: TFile | null, llm: LLMProvider | null): Promise<void> {
    if (!file) throw new Error('Nenhum arquivo selecionado')
    if (!llm) throw new Error('LLM não configurado')

    const content = await this.vault.read(file)
    const messages = PROMPTS.ingest(content, file.path)
    const response = await llm.chat(messages)

    // Parse JSON da resposta do LLM
    const proposal = JSON.parse(this.extractJSON(response))

    // Cria página wiki
    const wikiPath = `${this.settings.wikiPath}/${this.slugify(proposal.title)}.md`
    const frontmatter = [
      '---',
      `title: "${proposal.title}"`,
      `category: ${proposal.category}`,
      `tags: [${proposal.tags.join(', ')}]`,
      `date: ${new Date().toISOString().slice(0, 10)}`,
      `source: "${file.path}"`,
      '---',
    ].join('\n')

    const pageContent = `${frontmatter}\n\n# ${proposal.title}\n\n${proposal.content}\n\n## Links\n\n${proposal.links.join('\n')}`
    await this.vault.create(wikiPath, pageContent)

    // Atualiza index.md e log.md
    await this.updateIndex(proposal.title, wikiPath, proposal.category, proposal.tags)
    await this.logOperation('ingest', proposal.title, file.path)
  }

  /** Adiciona entrada no index.md */
  private async updateIndex(title: string, path: string, category: string, tags: string[]) {
    const indexPath = this.settings.indexPath
    const entry = `| [[${path.replace('.md', '')}|${title}]] | ${category} | ${tags.join(', ')} |`

    const exists = await this.vault.adapter.exists(indexPath)
    if (exists) {
      const content = await this.vault.adapter.read(indexPath)
      await this.vault.adapter.write(indexPath, content + '\n' + entry)
    } else {
      const header = '| Página | Categoria | Tags |\n|--------|-----------|------|\n'
      await this.vault.adapter.write(indexPath, header + entry)
    }
  }

  /** Registra operação no log.md */
  private async logOperation(op: string, title: string, source?: string) {
    const logPath = this.settings.logPath
    const date = new Date().toISOString().slice(0, 10)
    const entry = `## [${date}] ${op} | ${title}${source ? ` (fonte: ${source})` : ''}`

    const exists = await this.vault.adapter.exists(logPath)
    if (exists) {
      const content = await this.vault.adapter.read(logPath)
      await this.vault.adapter.write(logPath, entry + '\n\n' + content)
    } else {
      await this.vault.adapter.write(logPath, `# Log\n\n${entry}\n`)
    }
  }

  private slugify(text: string): string {
    return text
      .toLowerCase()
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
  }

  private extractJSON(text: string): string {
    const match = text.match(/\{[\s\S]*\}/)
    return match ? match[0] : text
  }
}
