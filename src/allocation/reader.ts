import { parse } from 'yaml'
import type { AllocationEntry } from './types'

type MinAdapter = { exists(p: string): Promise<boolean>; read(p: string): Promise<string> }

export class AllocationReader {
  constructor(private adapter: MinAdapter, private path: string) {}

  async read(): Promise<AllocationEntry[]> {
    const exists = await this.adapter.exists(this.path)
    if (!exists) throw new Error(`Allocation file not found: ${this.path}`)

    const content = await this.adapter.read(this.path)
    const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---/)
    if (!match) throw new Error(`No YAML frontmatter found in ${this.path}`)

    const data = parse(match[1]) as Record<string, unknown>
    if (!Array.isArray(data?.entries)) {
      throw new Error(`Schema error: 'entries' array missing in ${this.path}`)
    }

    return (data.entries as Record<string, unknown>[]).map((e, i) => {
      if (typeof e.employee !== 'string' || typeof e.contract !== 'string') {
        throw new Error(`Entry ${i}: 'employee' and 'contract' are required strings`)
      }
      return {
        employee:   e.employee,
        matricula:  typeof e.matricula === 'string' ? e.matricula : undefined,
        contract:   e.contract,
        frente:     typeof e.frente === 'string' ? e.frente : '',
        dedication: typeof e.dedication === 'number' ? e.dedication : 0,
      } satisfies AllocationEntry
    })
  }
}
