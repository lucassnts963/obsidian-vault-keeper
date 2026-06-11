import { App, PluginSettingTab, Setting } from 'obsidian'
import type VaultKeeperPlugin from './main'
import type { ProjectVault } from './settings'

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

    // === CLI ===
    containerEl.createEl('h3', { text: 'CLI Agent' })
    new Setting(containerEl)
      .setName('CLI Agent')
      .setDesc('Agente CLI a usar (requer instalação). "none" usa o agente LLM interno.')
      .addDropdown(d => d
        .addOption('none', 'Nenhum (modo interno)')
        .addOption('claude', 'Claude Code (não testado)')
        .addOption('opencode', 'OpenCode ✅')
        .addOption('gemini', 'Gemini CLI (não testado)')
        .addOption('agy', 'Antigravity (não testado)')
        .addOption('custom', 'Customizado (não testado)')
        .setValue(this.plugin.settings.cli?.preferred || 'none')
        .onChange(async v => {
          if (!this.plugin.settings.cli) {
            this.plugin.settings.cli = { preferred: 'none', customBinaryPath: '', autoDetect: true, timeoutMinutes: 5 }
          }
          this.plugin.settings.cli.preferred = v as any
          await this.plugin.saveSettings()
          this.display()
        }))

    new Setting(containerEl)
      .setName('Auto-detectar CLI')
      .setDesc('Detectar automaticamente CLIs instalados (claude, opencode, gemini)')
      .addToggle(t => t
        .setValue(this.plugin.settings.cli?.autoDetect ?? true)
        .onChange(async v => {
          if (!this.plugin.settings.cli) {
            this.plugin.settings.cli = { preferred: 'none', customBinaryPath: '', autoDetect: true, timeoutMinutes: 5 }
          }
          this.plugin.settings.cli.autoDetect = v
          await this.plugin.saveSettings()
        }))

    if (this.plugin.settings.cli?.preferred === 'custom') {
      new Setting(containerEl)
        .setName('Caminho do binário')
        .setDesc('Caminho completo para o executável do agente customizado')
        .addText(t => t
          .setPlaceholder('/usr/local/bin/myagent')
          .setValue(this.plugin.settings.cli?.customBinaryPath || '')
          .onChange(async v => {
            this.plugin.settings.cli.customBinaryPath = v
            await this.plugin.saveSettings()
          }))
    }

    new Setting(containerEl)
      .setName('Timeout do CLI (minutos)')
      .setDesc('Tempo máximo de execução do CLI. 0 = sem limite (recomendado para opencode).')
      .addText(t => {
        t.inputEl.type = 'number'
        t.setPlaceholder('5')
          .setValue(String(this.plugin.settings.cli?.timeoutMinutes ?? 5))
          .onChange(async v => {
            if (!this.plugin.settings.cli) {
              this.plugin.settings.cli = { preferred: 'none', customBinaryPath: '', autoDetect: true, timeoutMinutes: 5 }
            }
            this.plugin.settings.cli.timeoutMinutes = Math.max(0, parseInt(v, 10) || 0)
            await this.plugin.saveSettings()
          })
      })

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

    // === Agent ===
    containerEl.createEl('h3', { text: 'Agent' })
    new Setting(containerEl)
      .setName('Max Iterations')
      .setDesc('Máximo de tool calls por pergunta (1-15)')
      .addText(t => {
        t.inputEl.type = 'number'
        t.setPlaceholder('5')
          .setValue(String(this.plugin.settings.agent.maxIterations))
          .onChange(async v => {
            const n = Math.max(1, Math.min(15, parseInt(v, 10) || 5))
            this.plugin.settings.agent.maxIterations = n
            await this.plugin.saveSettings()
          })
      })

    new Setting(containerEl)
      .setName('Max File Chars')
      .setDesc('Caracteres máximos lidos por arquivo (500-10000)')
      .addText(t => {
        t.inputEl.type = 'number'
        t.setPlaceholder('3000')
          .setValue(String(this.plugin.settings.agent.maxFileChars))
          .onChange(async v => {
            const n = Math.max(500, Math.min(10000, parseInt(v, 10) || 3000))
            this.plugin.settings.agent.maxFileChars = n
            await this.plugin.saveSettings()
          })
      })

    new Setting(containerEl)
      .setName('Reset Context')
      .setDesc('Limpa o contexto do agente a cada pergunta')
      .addToggle(t => t
        .setValue(this.plugin.settings.agent.resetContext)
        .onChange(async v => {
          this.plugin.settings.agent.resetContext = v
          await this.plugin.saveSettings()
        }))

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

      new Setting(containerEl)
        .setName('Author Name')
        .setDesc('Nome nos commits Git')
        .addText(t => t
          .setPlaceholder('Seu Nome')
          .setValue(this.plugin.settings.git.authorName)
          .onChange(async v => {
            this.plugin.settings.git.authorName = v
            await this.plugin.saveSettings()
          }))

      new Setting(containerEl)
        .setName('Author Email')
        .addText(t => t
          .setPlaceholder('email@exemplo.com')
          .setValue(this.plugin.settings.git.authorEmail)
          .onChange(async v => {
            this.plugin.settings.git.authorEmail = v
            await this.plugin.saveSettings()
          }))

      new Setting(containerEl)
        .setName('Auto-sync (minutos)')
        .setDesc('0 = desligado. Sincroniza automaticamente a cada N minutos.')
        .addText(t => {
          t.inputEl.type = 'number'
          t.setPlaceholder('0')
            .setValue(String(this.plugin.settings.git.autoSyncMinutes))
            .onChange(async v => {
              this.plugin.settings.git.autoSyncMinutes = Math.max(0, parseInt(v, 10) || 0)
              await this.plugin.saveSettings()
            })
        })

      new Setting(containerEl)
        .setName('Sincronizar ao Abrir')
        .setDesc('Pull automático ao abrir o vault')
        .addToggle(t => t
          .setValue(this.plugin.settings.git.syncOnOpen)
          .onChange(async v => {
            this.plugin.settings.git.syncOnOpen = v
            await this.plugin.saveSettings()
          }))

      new Setting(containerEl)
        .setName('Sincronizar ao Fechar')
        .setDesc('Push automático ao fechar o vault (best-effort)')
        .addToggle(t => t
          .setValue(this.plugin.settings.git.syncOnClose)
          .onChange(async v => {
            this.plugin.settings.git.syncOnClose = v
            await this.plugin.saveSettings()
          }))

      new Setting(containerEl)
        .setName('Estratégia de Conflito')
        .setDesc('O que fazer quando o arquivo foi modificado local e remotamente')
        .addDropdown(d => d
          .addOption('ask', 'Backup + sobrescrever (padrão)')
          .addOption('keep-local', 'Manter versão local')
          .addOption('keep-remote', 'Usar versão remota')
          .setValue(this.plugin.settings.git.conflictStrategy)
          .onChange(async v => {
            this.plugin.settings.git.conflictStrategy = v as any
            await this.plugin.saveSettings()
          }))

      // === Projetos ===
      containerEl.createEl('h3', { text: 'Projetos' })
      containerEl.createEl('p', {
        text: 'Subpastas do vault sincronizadas com repositórios GitHub próprios. Cada projeto pode ser aberto como vault independente.',
        cls: 'setting-item-description',
      })

      const projects = this.plugin.settings.vaults.projects
      for (let i = 0; i < projects.length; i++) {
        const p = projects[i]
        const row = containerEl.createDiv({ cls: 'vault-keeper-project-row' })
        row.style.cssText = 'display:flex;gap:8px;align-items:center;margin-bottom:6px;flex-wrap:wrap'

        const nameEl = row.createEl('input', { type: 'text', placeholder: 'nome', value: p.name })
        nameEl.style.cssText = 'width:100px;flex-shrink:0'
        const pathEl = row.createEl('input', { type: 'text', placeholder: 'path (ex: projects/alpha)', value: p.path })
        pathEl.style.cssText = 'width:180px;flex-shrink:0'
        const remoteEl = row.createEl('input', { type: 'text', placeholder: 'https://github.com/user/repo', value: p.remote })
        remoteEl.style.cssText = 'flex:1;min-width:180px'
        const tokenEl = row.createEl('input', { type: 'password', placeholder: 'token (opcional)', value: p.token || '' })
        tokenEl.style.cssText = 'width:140px;flex-shrink:0'

        const save = async () => {
          projects[i] = {
            name: nameEl.value.trim(),
            path: pathEl.value.trim(),
            remote: remoteEl.value.trim(),
            token: tokenEl.value.trim() || undefined,
          }
          await this.plugin.saveSettings()
        }
        nameEl.addEventListener('change', save)
        pathEl.addEventListener('change', save)
        remoteEl.addEventListener('change', save)
        tokenEl.addEventListener('change', save)

        const removeBtn = row.createEl('button', { text: '✕' })
        removeBtn.style.cssText = 'flex-shrink:0;cursor:pointer'
        removeBtn.addEventListener('click', async () => {
          this.plugin.settings.vaults.projects.splice(i, 1)
          await this.plugin.saveSettings()
          this.display()
        })
      }

      new Setting(containerEl)
        .addButton(btn => btn
          .setButtonText('+ Adicionar projeto')
          .onClick(async () => {
            this.plugin.settings.vaults.projects.push({ name: '', path: '', remote: '' })
            await this.plugin.saveSettings()
            this.display()
          }))
    }
  }
}
