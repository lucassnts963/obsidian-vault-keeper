import { App, PluginSettingTab, Setting } from 'obsidian'
import type VaultKeeperPlugin from './main'

export class VaultKeeperSettingTab extends PluginSettingTab {
  plugin: VaultKeeperPlugin

  constructor(app: App, plugin: VaultKeeperPlugin) {
    super(app, plugin)
    this.plugin = plugin
  }

  display(): void {
    const { containerEl } = this
    containerEl.empty()

    containerEl.createEl('h2', { text: 'Vault Keeper' })

    // === Paths ===
    containerEl.createEl('h3', { text: 'Paths' })
    new Setting(containerEl)
      .setName('Wiki Path')
      .setDesc('Pasta onde páginas wiki são criadas')
      .addText(t => t
        .setPlaceholder('wiki')
        .setValue(this.plugin.settings.wikiPath)
        .onChange(async v => {
          this.plugin.settings.wikiPath = v
          await this.plugin.saveSettings()
        }))

    new Setting(containerEl)
      .setName('Inbox Path')
      .setDesc('Pasta de entrada de novas notas')
      .addText(t => t
        .setPlaceholder('inbox')
        .setValue(this.plugin.settings.inboxPath)
        .onChange(async v => {
          this.plugin.settings.inboxPath = v
          await this.plugin.saveSettings()
        }))

    new Setting(containerEl)
      .setName('Raw Path')
      .setDesc('Pasta de notas aprovadas aguardando ingest')
      .addText(t => t
        .setPlaceholder('raw')
        .setValue(this.plugin.settings.rawPath)
        .onChange(async v => {
          this.plugin.settings.rawPath = v
          await this.plugin.saveSettings()
        }))

    new Setting(containerEl)
      .setName('Index Path')
      .setDesc('Caminho do arquivo de índice do wiki')
      .addText(t => t
        .setPlaceholder('wiki/index.md')
        .setValue(this.plugin.settings.indexPath)
        .onChange(async v => {
          this.plugin.settings.indexPath = v
          await this.plugin.saveSettings()
        }))

    new Setting(containerEl)
      .setName('Log Path')
      .setDesc('Caminho do arquivo de log de operações')
      .addText(t => t
        .setPlaceholder('wiki/log.md')
        .setValue(this.plugin.settings.logPath)
        .onChange(async v => {
          this.plugin.settings.logPath = v
          await this.plugin.saveSettings()
        }))

    // === LLM ===
    containerEl.createEl('h3', { text: 'LLM' })
    new Setting(containerEl)
      .setName('Provider')
      .setDesc('http (OpenAI-compatible), ollama (local), hermes-gateway')
      .addDropdown(d => d
        .addOption('http', 'HTTP API')
        .addOption('ollama', 'Ollama (local)')
        .addOption('hermes-gateway', 'Hermes Gateway')
        .setValue(this.plugin.settings.llm.provider)
        .onChange(async v => {
          this.plugin.settings.llm.provider = v as 'http' | 'ollama' | 'hermes-gateway'
          await this.plugin.saveSettings()
        }))

    new Setting(containerEl)
      .setName('Endpoint')
      .setDesc('URL base da API (/v1 será adicionado automaticamente)')
      .addText(t => t
        .setPlaceholder('https://api.deepseek.com')
        .setValue(this.plugin.settings.llm.endpoint)
        .onChange(async v => {
          this.plugin.settings.llm.endpoint = v
          await this.plugin.saveSettings()
        }))

    new Setting(containerEl)
      .setName('Modelo')
      .addText(t => t
        .setPlaceholder('deepseek-chat')
        .setValue(this.plugin.settings.llm.model)
        .onChange(async v => {
          this.plugin.settings.llm.model = v
          await this.plugin.saveSettings()
        }))

    new Setting(containerEl)
      .setName('API Key')
      .addText(t => {
        t.inputEl.type = 'password'
        t.setPlaceholder('sk-...')
          .setValue(this.plugin.settings.llm.apiKey || '')
          .onChange(async v => {
            this.plugin.settings.llm.apiKey = v
            await this.plugin.saveSettings()
          })
      })

    new Setting(containerEl)
      .setName('Max Tokens')
      .setDesc('Tokens máximos na resposta do LLM')
      .addText(t => {
        t.inputEl.type = 'number'
        t.setPlaceholder('4096')
          .setValue(String(this.plugin.settings.llm.maxTokens ?? 4096))
          .onChange(async v => {
            this.plugin.settings.llm.maxTokens = parseInt(v, 10) || 4096
            await this.plugin.saveSettings()
          })
      })

    // === Git ===
    containerEl.createEl('h3', { text: 'Git Sync' })
    const gitEnabled = this.plugin.settings.git.enabled

    new Setting(containerEl)
      .setName('Ativar')
      .addToggle(t => t
        .setValue(gitEnabled)
        .onChange(async v => {
          this.plugin.settings.git.enabled = v
          await this.plugin.saveSettings()
          this.display()
        }))

    if (gitEnabled) {
      new Setting(containerEl)
        .setName('Remote')
        .setDesc('URL do repositório (HTTPS)')
        .addText(t => t
          .setPlaceholder('https://github.com/user/vault.git')
          .setValue(this.plugin.settings.git.remote)
          .onChange(async v => {
            this.plugin.settings.git.remote = v
            await this.plugin.saveSettings()
          }))

      new Setting(containerEl)
        .setName('Token GitHub')
        .addText(t => {
          t.inputEl.type = 'password'
          t.setPlaceholder('ghp_...')
            .setValue(this.plugin.settings.git.token)
            .onChange(async v => {
              this.plugin.settings.git.token = v
              await this.plugin.saveSettings()
            })
        })
    }
  }
}
