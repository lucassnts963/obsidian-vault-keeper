// @vitest-environment happy-dom

import { describe, it, expect, vi, beforeEach, beforeAll } from 'vitest'
import { resetSettingStore, settingStore } from '../__mocks__/obsidian'

function findSetting(name: string): any {
  return settingStore.find((s: any) => s._name === name)
}

function plugin(enabled = false) {
  return {
    settings: {
      llm: {
        provider: 'http' as const,
        endpoint: 'https://api.deepseek.com/v1',
        model: 'deepseek-chat',
        apiKey: '',
        maxTokens: 4096,
      },
      git: {
        enabled,
        remote: '',
        username: '',
        token: '',
        authorName: '',
        authorEmail: '',
        autoSyncMinutes: 0,
      },
      inboxPath: 'inbox',
      rawPath: 'raw',
      wikiPath: 'wiki',
      logPath: 'wiki/log.md',
      indexPath: 'wiki/index.md',
      vaults: { knowledge: '', projects: [] as string[] },
    },
    saveSettings: vi.fn().mockResolvedValue(undefined),
  }
}

describe('VaultKeeperSettingTab', () => {
  let VaultKeeperSettingTab: any

  beforeAll(async () => {
    const mod = await import('../settings-tab')
    VaultKeeperSettingTab = mod.VaultKeeperSettingTab
  })

  beforeEach(() => {
    resetSettingStore()
  })

  it('renders all 5 path inputs', () => {
    const tab = new VaultKeeperSettingTab({}, plugin())
    tab.display()

    expect(findSetting('Wiki Path')).toBeDefined()
    expect(findSetting('Inbox Path')).toBeDefined()
    expect(findSetting('Raw Path')).toBeDefined()
    expect(findSetting('Index Path')).toBeDefined()
    expect(findSetting('Log Path')).toBeDefined()
  })

  it('path defaults match DEFAULT_SETTINGS', () => {
    const tab = new VaultKeeperSettingTab({}, plugin())
    tab.display()

    expect(findSetting('Wiki Path')._text._value).toBe('wiki')
    expect(findSetting('Inbox Path')._text._value).toBe('inbox')
    expect(findSetting('Raw Path')._text._value).toBe('raw')
  })

  it('renders maxTokens as numeric input', () => {
    const tab = new VaultKeeperSettingTab({}, plugin())
    tab.display()

    const mt = findSetting('Max Tokens')
    expect(mt).toBeDefined()
    expect(mt._text._value).toBe('4096')
  })

  it('apiKey input is password type', () => {
    const tab = new VaultKeeperSettingTab({}, plugin())
    tab.display()

    const ak = findSetting('API Key')
    expect(ak).toBeDefined()
    expect(ak._text.inputEl.type).toBe('password')
  })

  it('hides git remote and token when git disabled', () => {
    const tab = new VaultKeeperSettingTab({}, plugin(false))
    tab.display()

    expect(findSetting('Remote')).toBeUndefined()
    expect(findSetting('Token GitHub')).toBeUndefined()
  })

  it('shows git remote and token when git enabled', () => {
    const tab = new VaultKeeperSettingTab({}, plugin(true))
    tab.display()

    expect(findSetting('Remote')).toBeDefined()
    expect(findSetting('Token GitHub')).toBeDefined()
  })
})
