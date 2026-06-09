import { describe, it, expect, beforeAll } from 'vitest'

describe('parseFrontmatter', () => {
  let parseFrontmatter: any

  beforeAll(async () => {
    ({ parseFrontmatter } = await import('../search/index-builder'))
  })

  // TEST-07
  it('separates frontmatter data from body', () => {
    const content = [
      '---',
      'title: "Memória de Agentes"',
      'category: conceito',
      'tags: [ai-memory, karpathy, memoria]',
      '---',
      '',
      '# Memória de Agentes',
      '',
      'Corpo da página aqui.',
    ].join('\n')

    const { data, body } = parseFrontmatter(content)
    expect(data.title).toBe('Memória de Agentes')
    expect(data.tags).toEqual(['ai-memory', 'karpathy', 'memoria'])
    expect(body).toContain('Corpo da página aqui.')
    expect(body).not.toContain('title:')
  })

  it('returns empty data and full body when no frontmatter', () => {
    const content = '# Just a heading\n\nNo frontmatter here.'
    const { data, body } = parseFrontmatter(content)
    expect(data).toEqual({})
    expect(body).toBe(content)
  })
})

describe('parseWikiDoc', () => {
  let parseWikiDoc: any

  beforeAll(async () => {
    ({ parseWikiDoc } = await import('../search/index-builder'))
  })

  // TEST-08
  it('uses safe defaults when frontmatter is absent', () => {
    const doc = parseWikiDoc('wiki/some-page.md', '# Heading\n\nBody text.')
    expect(doc.path).toBe('wiki/some-page.md')
    expect(doc.title).toBe('some-page')   // derived from filename
    expect(doc.tags).toEqual([])
    expect(doc.summary).toBe('')
    expect(doc.body).toContain('Body text.')
  })

  it('extracts title, tags and summary from frontmatter', () => {
    const content = [
      '---',
      'title: "Karpathy LLM Wiki"',
      'tags: [karpathy, wiki]',
      'summary: "Compile knowledge at ingest, not retrieval."',
      '---',
      'Conteúdo.',
    ].join('\n')
    const doc = parseWikiDoc('wiki/karpathy.md', content)
    expect(doc.title).toBe('Karpathy LLM Wiki')
    expect(doc.tags).toEqual(['karpathy', 'wiki'])
    expect(doc.summary).toContain('Compile knowledge')
  })
})

describe('WikiSearchIndex', () => {
  let WikiSearchIndex: any
  let parseWikiDoc: any

  beforeAll(async () => {
    const m = await import('../search/index-builder')
    WikiSearchIndex = m.WikiSearchIndex
    parseWikiDoc = m.parseWikiDoc
  })

  // TEST-09
  it('weighs title and tags above body', () => {
    const titled = parseWikiDoc('wiki/titled.md', [
      '---',
      'title: "Memória de Agentes"',
      'tags: [memoria, agentes]',
      '---',
      'Texto genérico sobre processos diversos e coisas.',
    ].join('\n'))

    const bodyOnly = parseWikiDoc('wiki/body.md', [
      '---',
      'title: "Notas Diversas"',
      'tags: [diversos]',
      '---',
      'Um paragrafo longo que cita memoria de agentes uma vez no meio de muitas outras frases sobre assuntos completamente distintos e variados.',
    ].join('\n'))

    const index = new WikiSearchIndex()
    index.setDocs([titled, bodyOnly])
    const results = index.query('memória de agentes', 5)
    expect(results[0].path).toBe('wiki/titled.md')
  })

  it('returns docs alongside scores and excludes irrelevant', () => {
    const a = parseWikiDoc('wiki/a.md', '---\ntitle: "Karpathy Wiki"\ntags: [karpathy]\n---\nMetodologia de wiki mantida por LLM.')
    const b = parseWikiDoc('wiki/b.md', '---\ntitle: "Bolos"\ntags: [receita]\n---\nFarinha, açúcar e ovos no forno.')
    const index = new WikiSearchIndex()
    index.setDocs([a, b])
    const results = index.query('karpathy wiki', 5)
    expect(results[0].path).toBe('wiki/a.md')
    expect(results[0].doc.title).toBe('Karpathy Wiki')
    expect(results.some((r: any) => r.path === 'wiki/b.md')).toBe(false)
  })
})
