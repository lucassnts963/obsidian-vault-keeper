import { describe, it, expect, beforeEach, beforeAll, vi } from 'vitest'

function mockAdapter(initialFiles: Record<string, string> = {}, initialDirs: string[] = []) {
  const files: Record<string, string> = { ...initialFiles }
  const dirs: string[] = [...initialDirs]
  return {
    files, dirs,
    read:   vi.fn(async (p: string) => { if (files[p] !== undefined) return files[p]; throw new Error('ENOENT: ' + p) }),
    write:  vi.fn(async (p: string, c: string) => { files[p] = c }),
    exists: vi.fn(async (p: string) => files[p] !== undefined || dirs.includes(p)),
    mkdir:  vi.fn(async (p: string) => { if (!dirs.includes(p)) dirs.push(p) }),
  }
}

describe('VaultInstaller', () => {
  let VaultInstaller: any
  let adapter: ReturnType<typeof mockAdapter>

  beforeAll(async () => {
    ({ VaultInstaller } = await import('../scaffold/installer'))
  })

  beforeEach(() => { adapter = mockAdapter() })

  // T-05: isInitialized false on empty vault
  it('isInitialized() returns false on empty vault', async () => {
    const inst = new VaultInstaller(adapter)
    expect(await inst.isInitialized()).toBe(false)
  })

  it('isInitialized() returns true when inbox/ and wiki/ exist', async () => {
    adapter.dirs.push('inbox', 'wiki')
    const inst = new VaultInstaller(adapter)
    expect(await inst.isInitialized()).toBe(true)
  })

  it('isInitialized() returns false when only inbox/ exists', async () => {
    adapter.dirs.push('inbox')
    const inst = new VaultInstaller(adapter)
    expect(await inst.isInitialized()).toBe(false)
  })

  // T-06: ensureStructure creates standard dirs and files
  it('ensureStructure() creates inbox/, raw/, wiki/, _slots/', async () => {
    const inst = new VaultInstaller(adapter)
    const result = await inst.ensureStructure()

    expect(adapter.dirs).toContain('inbox')
    expect(adapter.dirs).toContain('raw')
    expect(adapter.dirs).toContain('wiki')
    expect(adapter.dirs).toContain('_slots')
    expect(result.created).toContain('inbox/')
    expect(result.created).toContain('raw/')
    expect(result.created).toContain('wiki/')
  })

  it('ensureStructure() creates .vault-keeper/ dir', async () => {
    const inst = new VaultInstaller(adapter)
    await inst.ensureStructure()
    expect(adapter.dirs).toContain('.vault-keeper')
  })

  it('ensureStructure() creates wiki/index.md, wiki/log.md', async () => {
    const inst = new VaultInstaller(adapter)
    await inst.ensureStructure()
    expect(adapter.files['wiki/index.md']).toBeDefined()
    expect(adapter.files['wiki/log.md']).toBeDefined()
  })

  it('ensureStructure() creates .vault-keeper/bm25-index.json with correct shape', async () => {
    const inst = new VaultInstaller(adapter)
    await inst.ensureStructure()
    const raw = adapter.files['.vault-keeper/bm25-index.json']
    expect(raw).toBeDefined()
    const parsed = JSON.parse(raw)
    expect(parsed.version).toBe(1)
    expect(parsed.entries).toEqual([])
  })

  // T-07: ensureStructure is idempotent
  it('ensureStructure() does not overwrite existing files on second call', async () => {
    const inst = new VaultInstaller(adapter)
    await inst.ensureStructure()
    // Modify index.md
    adapter.files['wiki/index.md'] = '# Modified'
    await inst.ensureStructure()
    // Should still have the modified content
    expect(adapter.files['wiki/index.md']).toBe('# Modified')
  })

  it('ensureStructure() reports existing items as skipped', async () => {
    adapter.dirs.push('inbox')
    const inst = new VaultInstaller(adapter)
    const result = await inst.ensureStructure()
    expect(result.skipped).toContain('inbox/')
    expect(result.created).not.toContain('inbox/')
  })

  // T-08: migration moves files to inbox/ with path prefix
  it('migrateExistingFiles() moves files to inbox/ with path prefix', async () => {
    adapter.dirs.push('inbox', 'raw', 'wiki', '_slots', '.vault-keeper')
    adapter.files['Notas/Pessoais/diario.md'] = '# Diário\n\nConteúdo.'

    const inst = new VaultInstaller(adapter)
    const result = await inst.migrateExistingFiles(['Notas/Pessoais/diario.md'])

    expect(result.migrated).toContain('Notas/Pessoais/diario.md')
    expect(adapter.files['inbox/Notas-Pessoais-diario.md']).toBeDefined()
  })

  it('migrateExistingFiles() adds status: inbox frontmatter', async () => {
    adapter.dirs.push('inbox')
    adapter.files['minha-nota.md'] = '# Nota\n\nTexto aqui.'

    const inst = new VaultInstaller(adapter)
    await inst.migrateExistingFiles(['minha-nota.md'])

    const inboxContent = adapter.files['inbox/minha-nota.md']
    expect(inboxContent).toContain('status: inbox')
    expect(inboxContent).toContain('source_path: minha-nota.md')
  })

  it('migrateExistingFiles() adds source_path to existing frontmatter', async () => {
    adapter.dirs.push('inbox')
    adapter.files['nota.md'] = '---\ntitle: Minha Nota\n---\n\nConteúdo.'

    const inst = new VaultInstaller(adapter)
    await inst.migrateExistingFiles(['nota.md'])

    const inboxContent = adapter.files['inbox/nota.md']
    expect(inboxContent).toContain('status: inbox')
    expect(inboxContent).toContain('source_path: nota.md')
    expect(inboxContent).toContain('title: Minha Nota')
  })

  // T-09: migration never deletes original files
  it('migrateExistingFiles() never deletes original files', async () => {
    adapter.dirs.push('inbox')
    adapter.files['nota-original.md'] = '# Original'

    const inst = new VaultInstaller(adapter)
    await inst.migrateExistingFiles(['nota-original.md'])

    expect(adapter.files['nota-original.md']).toBe('# Original')
  })

  // T-10: migration skips files already in standard dirs
  it('migrateExistingFiles() skips files already in standard dirs', async () => {
    adapter.dirs.push('inbox', 'wiki')
    adapter.files['wiki/pagina.md'] = '# Página Wiki'
    adapter.files['inbox/rascunho.md'] = '# Rascunho'

    const inst = new VaultInstaller(adapter)
    const result = await inst.migrateExistingFiles(['wiki/pagina.md', 'inbox/rascunho.md'])

    expect(result.migrated).toHaveLength(0)
  })

  it('migrateExistingFiles() skips non-.md files', async () => {
    adapter.dirs.push('inbox')
    adapter.files['imagem.png'] = 'binary'

    const inst = new VaultInstaller(adapter)
    const result = await inst.migrateExistingFiles(['imagem.png'])

    expect(result.migrated).toHaveLength(0)
  })

  it('migrateExistingFiles() is idempotent (skips already migrated)', async () => {
    adapter.dirs.push('inbox')
    adapter.files['nota.md'] = '# Nota'
    adapter.files['inbox/nota.md'] = '---\nstatus: inbox\n---\n\n# Nota'

    const inst = new VaultInstaller(adapter)
    const result = await inst.migrateExistingFiles(['nota.md'])

    expect(result.migrated).toHaveLength(0)
  })

  it('addMigrationFrontmatter adds frontmatter to file without one', () => {
    const result = VaultInstaller.addMigrationFrontmatter('# Título\n\nTexto.', 'pasta/arquivo.md')
    expect(result).toContain('---')
    expect(result).toContain('status: inbox')
    expect(result).toContain('source_path: pasta/arquivo.md')
    expect(result).toContain('# Título')
  })
})
