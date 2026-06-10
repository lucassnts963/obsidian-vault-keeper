// @vitest-environment happy-dom

import { describe, it, expect, vi, afterEach } from 'vitest'

describe('createProvider', () => {
  afterEach(() => { vi.restoreAllMocks() })

  it('returns null when endpoint is empty', async () => {
    const { createProvider } = await import('../llm/provider')
    expect(createProvider({ provider: 'http', endpoint: '', model: 'gpt-4', apiKey: '' })).toBeNull()
  })

  it('returns null when model is empty', async () => {
    const { createProvider } = await import('../llm/provider')
    expect(createProvider({ provider: 'http', endpoint: 'https://api.example.com', model: '', apiKey: '' })).toBeNull()
  })

  it('chat() throws descriptive error when API response lacks choices', async () => {
    const { createProvider } = await import('../llm/provider')
    const provider = createProvider({ provider: 'http', endpoint: 'https://api.example.com', model: 'gpt-4', apiKey: 'key' })!

    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => ({ unexpected: 'no choices here' }),
    } as Response)

    await expect(provider.chat([{ role: 'user', content: 'hello' }])).rejects.toThrow()
  })

  it('chat() throws error containing status on HTTP failure', async () => {
    const { createProvider } = await import('../llm/provider')
    const provider = createProvider({ provider: 'http', endpoint: 'https://api.example.com', model: 'gpt-4', apiKey: 'key' })!

    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: false,
      status: 401,
      text: async () => 'Unauthorized',
    } as Response)

    await expect(provider.chat([{ role: 'user', content: 'hello' }])).rejects.toThrow('401')
  })
})
