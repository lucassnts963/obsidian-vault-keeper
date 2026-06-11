import { describe, it, expect, vi, beforeEach } from 'vitest'
import { AllocationReader } from '../allocation/reader'
import { AllocationWikiGenerator } from '../allocation/wiki-generator'
import { AllocationExcelGenerator } from '../allocation/excel-generator'
import type { AllocationEntry } from '../allocation/types'

// ── Fixtures ──────────────────────────────────────────────────────────────────

const VALID_FRONTMATTER = `---
type: allocation
entries:
  - employee: "João Silva"
    matricula: "E001"
    contract: "Contrato ABC"
    frente: "Backend"
    dedication: 50
  - employee: "Maria Santos"
    matricula: "E002"
    contract: "Contrato ABC"
    frente: "Frontend"
    dedication: 100
  - employee: "Pedro Oliveira"
    matricula: "E003"
    contract: "Contrato DEF"
    frente: "QA"
    dedication: 75
---
`

const ENTRIES: AllocationEntry[] = [
  { employee: 'João Silva',    matricula: 'E001', contract: 'Contrato ABC', frente: 'Backend',  dedication: 50  },
  { employee: 'Maria Santos',  matricula: 'E002', contract: 'Contrato ABC', frente: 'Frontend', dedication: 100 },
  { employee: 'Pedro Oliveira', matricula: 'E003', contract: 'Contrato DEF', frente: 'QA',      dedication: 75  },
]

// ── AllocationReader ──────────────────────────────────────────────────────────

describe('AllocationReader', () => {
  it('T-Reader-01: valid frontmatter → returns AllocationEntry[]', async () => {
    const adapter = {
      exists: vi.fn().mockResolvedValue(true),
      read: vi.fn().mockResolvedValue(VALID_FRONTMATTER),
    }
    const reader = new AllocationReader(adapter as any, 'data/allocations.md')
    const result = await reader.read()
    expect(result).toHaveLength(3)
    expect(result[0]).toMatchObject({ employee: 'João Silva', contract: 'Contrato ABC', dedication: 50 })
    expect(result[2]).toMatchObject({ employee: 'Pedro Oliveira', contract: 'Contrato DEF' })
  })

  it('T-Reader-02: file not found → throws descriptive error', async () => {
    const adapter = {
      exists: vi.fn().mockResolvedValue(false),
      read: vi.fn(),
    }
    const reader = new AllocationReader(adapter as any, 'data/allocations.md')
    await expect(reader.read()).rejects.toThrow('data/allocations.md')
  })

  it('T-Reader-03: frontmatter missing entries field → throws schema error', async () => {
    const adapter = {
      exists: vi.fn().mockResolvedValue(true),
      read: vi.fn().mockResolvedValue('---\ntype: allocation\n---\n'),
    }
    const reader = new AllocationReader(adapter as any, 'data/allocations.md')
    await expect(reader.read()).rejects.toThrow(/entries/)
  })
})

// ── AllocationWikiGenerator ───────────────────────────────────────────────────

describe('AllocationWikiGenerator', () => {
  const gen = new AllocationWikiGenerator()

  it('T-Wiki-01: same contract → one section, two table rows', () => {
    const entries: AllocationEntry[] = [
      { employee: 'Alice', contract: 'ABC', frente: 'Frontend', dedication: 100 },
      { employee: 'Bob',   contract: 'ABC', frente: 'Backend',  dedication: 80  },
    ]
    const md = gen.generate(entries, '2026-06-11')
    const sections = md.match(/^## /gm)
    expect(sections).toHaveLength(1)
    expect(md).toContain('| Alice |')
    expect(md).toContain('| Bob |')
  })

  it('T-Wiki-02: different contracts → two sections in order of appearance', () => {
    const md = gen.generate(ENTRIES, '2026-06-11')
    const abcPos = md.indexOf('## Contrato ABC')
    const defPos = md.indexOf('## Contrato DEF')
    expect(abcPos).toBeGreaterThan(-1)
    expect(defPos).toBeGreaterThan(-1)
    expect(abcPos).toBeLessThan(defPos)
  })

  it('T-Wiki-03: generated frontmatter has category:allocation and date field', () => {
    const md = gen.generate(ENTRIES, '2026-06-11')
    expect(md).toContain('category: allocation')
    expect(md).toContain('date: 2026-06-11')
  })
})

// ── AllocationExcelGenerator ──────────────────────────────────────────────────

describe('AllocationExcelGenerator', () => {
  const gen = new AllocationExcelGenerator()

  it('T-Excel-01: generate() returns ArrayBuffer with size > 0', () => {
    const buf = gen.generate(ENTRIES, '2026-06-11')
    expect(buf).toBeInstanceOf(ArrayBuffer)
    expect(buf.byteLength).toBeGreaterThan(0)
  })

  it('T-Excel-02: workbook contains all entries (check via raw bytes)', () => {
    const buf = gen.generate(ENTRIES, '2026-06-11')
    const bytes = new Uint8Array(buf)
    // XLSX is a ZIP; employee names appear as UTF-8 strings in the shared strings XML
    const text = new TextDecoder('utf-8', { fatal: false }).decode(bytes)
    expect(text).toContain('João Silva')
    expect(text).toContain('Maria Santos')
    expect(text).toContain('Pedro Oliveira')
  })
})
