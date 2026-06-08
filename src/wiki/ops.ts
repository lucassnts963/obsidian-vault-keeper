import type { Vault, TFile } from 'obsidian'
import type { VaultKeeperSettings } from '../settings'
import type { LLMProvider } from '../llm/provider'
import { PROMPTS } from '../llm/provider'

export class WikiOps {
  private vault: Vault
  private settings: VaultKeeperSettings

  constructor(vault: Vault, settings: VaultKeeperSettings) {
    this.vault = vault
    this.settings = settings
  }

  /** Move arquivo do inbox para raw e seta status: approved */
  async approve(file: TFile): Promise<void> {
    const content = await this.vault.read(file)
    const updated = this.setFrontmatterStatus(content, 'approved')
    const newPath = file.path.replace(this.settings.inboxPath, this.settings.rawPath)
    await this.vault.create(newPath, updated)
    await this.vault.delete(file)
  }

  /** Seta status: rejected no frontmatter (não move o arquivo) */
  async reject(file: TFile): Promise<void> {
    const content = await this.vault.read(file)
    const updated = this.setFrontmatterStatus(content, 'rejected')
    await this.vault.adapter.write(file.path, updated)
  }

  /** Atualiza ou adiciona campo status no frontmatter YAML */
  private setFrontmatterStatus(content: string, status: string): string {
    if (content.startsWith('---')) {
      const end = content.indexOf('---', 3)
      if (end !== -1) {
        let fm = content.substring(3, end)
        if (/^status:\s*.+/m.test(fm)) {
          fm = fm.replace(/^status:\s*.+/m, `status: ${status}`)
        } else {
          fm = fm.trimEnd() + `\nstatus: ${status}`
        }
        return `---${fm}---${content.substring(end + 3)}`
      }
    }
    return `---\nstatus: ${status}\n---\n\n${content}`
  }

  /** Lê index + páginas relevantes do wiki para contexto do LLM */
  async gatherContext(question: string): Promise<string> {
    const parts: string[] = []

    try {
      const index = await this.vault.adapter.read(this.settings.indexPath)
      parts.push(`## Index\n${index}`)
    } catch {}

    const keywords = question.toLowerCase().split(/\s+/).filter(w => w.length > 3)
    try {
      const list = await this.vault.adapter.list(this.settings.wikiPath)
      const mdFiles = list.files.filter((f: string) => f.endsWith('.md'))

      let matched = 0
      for (const f of mdFiles) {
        const path = `${this.settings.wikiPath}/${f}`
        try {
          const page = await this.vault.adapter.read(path)
          const lower = page.toLowerCase()
          if (keywords.some(kw => lower.includes(kw))) {
            parts.push(`## ${f}\n${page.slice(0, 2000)}`)
            matched++
            if (matched >= 5) break
          }
        } catch {}
      }
    } catch {}

    if (parts.length === 0) return ''
    return parts.join('\n\n---\n\n')
  }

  /** Lê arquivo fonte → LLM propõe página wiki → cria */
  async ingestFile(file: TFile | null, llm: LLMProvider | null): Promise<void> {
    if (!file) throw new Error('Nenhum arquivo selecionado')
    if (!llm) throw new Error('LLM não configurado')

    const content = await this.vault.read(file)
    const messages = PROMPTS.ingest(content, file.path)
    const response = await llm.chat(messages)

    const jsonStr = this.extractJSON(response)
    let proposal: any
    try {
      proposal = JSON.parse(jsonStr)
    } catch {
      throw new Error(`LLM retornou JSON inválido. Resposta: ${response.slice(0, 200)}`)
    }

    if (!proposal.title) throw new Error('LLM não retornou campo "title" obrigatório')
    if (!proposal.content) throw new Error('LLM não retornou campo "content" obrigatório')

    const safeTitle = proposal.title || 'sem-titulo'
    const safeCategory = proposal.category || 'uncategorized'
    const safeTags = Array.isArray(proposal.tags) ? proposal.tags : []
    const safeContent = proposal.content || ''
    const safeLinks = Array.isArray(proposal.links) ? proposal.links : []

    const wikiPath = `${this.settings.wikiPath}/${this.slugify(safeTitle)}.md`

    const exists = await this.vault.adapter.exists(wikiPath)
    if (exists) {
      throw new Error(`Página wiki já existe: ${wikiPath}`)
    }

    const frontmatter = [
      '---',
      `title: "${safeTitle}"`,
      `category: ${safeCategory}`,
      `tags: [${safeTags.join(', ')}]`,
      `date: ${new Date().toISOString().slice(0, 10)}`,
      `source: "${file.path}"`,
      '---',
    ].join('\n')

    const pageContent = `${frontmatter}\n\n# ${safeTitle}\n\n${safeContent}\n\n## Links\n\n${safeLinks.join('\n')}`
    await this.vault.create(wikiPath, pageContent)

    await this.updateIndex(safeTitle, wikiPath, safeCategory, safeTags)
    await this.logOperation('ingest', safeTitle, file.path)
  }

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
