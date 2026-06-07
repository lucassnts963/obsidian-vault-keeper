import { ItemView, WorkspaceLeaf } from 'obsidian'
import type VaultKeeperPlugin from '../main'

export const LINT_VIEW_TYPE = 'vault-keeper-lint'

export class LintView extends ItemView {
  plugin: VaultKeeperPlugin

  constructor(leaf: WorkspaceLeaf, plugin: VaultKeeperPlugin) {
    super(leaf)
    this.plugin = plugin
  }

  getViewType(): string { return LINT_VIEW_TYPE }
  getDisplayText(): string { return 'Auditoria' }
  getIcon(): string { return 'search' }

  async onOpen() {
    // TODO: rodar lint via LLM + heurísticas
    // - Contradições entre páginas
    // - Órfãos (páginas sem link)
    // - Frontmatter quebrado
    // - Index desatualizado
    this.contentEl.createEl('p', { text: 'Auditoria — em desenvolvimento' })
  }
}
