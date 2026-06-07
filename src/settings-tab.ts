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
      .addText(t => t
        .setPlaceholder('sk-...')
        .setValue(this.plugin.settings.llm.apiKey || '')
        .onChange(async v => {
          this.plugin.settings.llm.apiKey = v
          await this.plugin.saveSettings()
        }))

    // === Git ===
    containerEl.createEl('h3', { text: 'Git Sync' })
    new Setting(containerEl)
      .setName('Ativar')
      .addToggle(t => t
        .setValue(this.plugin.settings.git.enabled)
        .onChange(async v => {
          this.plugin.settings.git.enabled = v
          await this.plugin.saveSettings()
        }))

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
      .addText(t => t
        .setPlaceholder('ghp_...')
        .setValue(this.plugin.settings.git.token)
        .onChange(async v => {
          this.plugin.settings.git.token = v
          await this.plugin.saveSettings()
        }))
  }
}
