// @vitest-environment happy-dom

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { SearchEngine, formatSearchResults } from '../search/index'

function mockVault(files: Record<string, string>) {
  return {
    adapter: {
      read: vi.fn(async (path: string) => {
        if (files[path] !== undefined) return files[path]
        throw new Error('ENOENT')
      }),
      list: vi.fn(async (dir: string) => {
        const prefix = dir.endsWith('/') ? dir : dir + '/'
        const f = Object.keys(files)
          .filter(k => k.startsWith(prefix))
          .map(k => k.slice(prefix.length))
        return { files: f, folders: [] }
      }),
    },
  }
}

describe('SearchEngine', () => {
  it('builds index from wiki pages', async () => {
    const vault = mockVault({
      'wiki/page-a.md': `---
title: "Alpha Page"
category: tech
tags: [python, ai]
---
# Alpha Page

This is the first paragraph with meaningful content about Python and AI. It should be long enough to qualify as a summary.

Extra content here.`,
      'wiki/page-b.md': `---
title: "Beta Notes"
category: research
tags: [brazil, portuguese]
---
# Beta Notes

Research notes about industrial maintenance in Brazil. This paragraph discusses Barcarena operations.

More content here.`,
    })

    const engine = new SearchEngine()
    await engine.build(vault as any, 'wiki')

    expect(engine.isReady()).toBe(true)
    expect(engine.pageCount).toBe(2)
  })

  it('searches by title match', async () => {
    const vault = mockVault({
      'wiki/alpha.md': `---
title: "Machine Learning Guide"
category: tech
tags: [ml, python]
---
# ML Guide

Comprehensive guide to machine learning with Python and scikit-learn. Covers supervised and unsupervised techniques.`,
      'wiki/beta.md': `---
title: "Industrial Maintenance"
category: operations
tags: [maintenance, industry]
---
# Maintenance

Guide to industrial maintenance procedures and best practices for heavy equipment.`,
    })

    const engine = new SearchEngine()
    await engine.build(vault as any, 'wiki')

    const results = engine.search('machine learning', 5)
    expect(results.length).toBeGreaterThan(0)
    expect(results[0].title).toContain('Machine Learning')
  })

  it('searches by tag match', async () => {
    const vault = mockVault({
      'wiki/python.md': `---
title: "Python Tips"
category: tech
tags: [python, programming]
---
# Python Tips

Python programming tips and tricks for developers.`,
      'wiki/js.md': `---
title: "JavaScript Guide"
category: tech
tags: [javascript, programming]
---
# JS Guide

JavaScript guide for web developers.`,
    })

    const engine = new SearchEngine()
    await engine.build(vault as any, 'wiki')

    const results = engine.search('python', 5)
    expect(results.length).toBeGreaterThan(0)
    expect(results[0].tags).toContain('python')
  })

  it('returns empty array for empty vault', async () => {
    const vault = mockVault({})
    const engine = new SearchEngine()
    await engine.build(vault as any, 'wiki')
    expect(engine.search('anything')).toEqual([])
  })

  it('formatSearchResults formats results nicely', () => {
    const results = [{
      path: 'wiki/test.md',
      title: 'Test Page',
      tags: ['tag1', 'tag2'],
      category: 'test',
      summary: 'A test page about something.',
      wordCount: 100,
      score: 0.85,
    }]

    const formatted = formatSearchResults(results)
    expect(formatted).toContain('Test Page')
    expect(formatted).toContain('85%')
    expect(formatted).toContain('tag1')
  })

  it('handles pages without frontmatter', async () => {
    const vault = mockVault({
      'wiki/plain.md': `# Plain Page

This is a plain page without frontmatter. It still has content that should be indexed properly for search.`,
    })

    const engine = new SearchEngine()
    await engine.build(vault as any, 'wiki')

    expect(engine.isReady()).toBe(true)
    const results = engine.search('plain page')
    expect(results.length).toBeGreaterThan(0)
  })

  it('handles pages with empty body gracefully', async () => {
    const vault = mockVault({
      'wiki/empty.md': `---
title: "Empty"
tags: []
---
`,
    })

    const engine = new SearchEngine()
    await engine.build(vault as any, 'wiki')

    expect(engine.isReady()).toBe(true)
    const results = engine.search('empty')
    expect(results.length).toBeGreaterThan(0)
    expect(results[0].summary).toBe('')
  })

  it('title matches get boosted', async () => {
    const vault = mockVault({
      'wiki/exact.md': `---
title: "Hydro Alunorte Operations"
category: operations
tags: [hydro, barcarena]
---
# Hydro Operations

General industrial operations content that doesn't mention Hydro again.`,
      'wiki/vague.md': `---
title: "General Operations"
category: operations
tags: [general]
---
# General Ops

Hydro Alunorte is mentioned here in the body but not in the title.`,
    })

    const engine = new SearchEngine()
    await engine.build(vault as any, 'wiki')

    const results = engine.search('Hydro Alunorte', 5)
    expect(results.length).toBeGreaterThan(0)
    // Title match should rank higher due to boost
    expect(results[0].title).toContain('Hydro Alunorte')
  })
})
