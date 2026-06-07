import type { Vault } from 'obsidian'
import type { GitSettings } from '../settings'

/**
 * Git sync via isomorphic-git — JS puro, sem dependência de shell.
 * Resolve o problema de "buffer error" do plugin Git oficial no mobile.
 */
export class GitSync {
  private vault: Vault
  private settings: GitSettings

  constructor(vault: Vault, settings: { git: GitSettings }) {
    this.vault = vault
    this.settings = settings.git
  }

  async sync(): Promise<{ pulled: number; pushed: number }> {
    if (!this.settings.enabled) {
      throw new Error('Git sync desabilitado nas configurações')
    }

    // TODO: implementar com isomorphic-git
    // 1. git.statusMatrix() — detecta mudanças locais
    // 2. git.pull() — busca remoto
    // 3. git.add() + git.commit() — commita mudanças locais
    // 4. git.push() — envia
    //
    // Autenticação via token no header HTTP:
    //   http({ headers: { 'Authorization': `Bearer ${token}` } })

    throw new Error('Git sync: implementação pendente (isomorphic-git)')
  }

  async status(): Promise<{ local: string[]; remote: string[] }> {
    // TODO: statusMatrix + listRemotes
    return { local: [], remote: [] }
  }
}
