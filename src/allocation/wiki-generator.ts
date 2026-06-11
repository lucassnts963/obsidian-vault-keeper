import type { AllocationEntry } from './types'

export class AllocationWikiGenerator {
  generate(entries: AllocationEntry[], date: string): string {
    const byContract = new Map<string, AllocationEntry[]>()
    for (const e of entries) {
      if (!byContract.has(e.contract)) byContract.set(e.contract, [])
      byContract.get(e.contract)!.push(e)
    }

    const sections = [...byContract.entries()].map(([contract, rows]) => {
      const tableRows = rows
        .map(r => `| ${r.employee} | ${r.matricula ?? ''} | ${r.frente} | ${r.dedication}% |`)
        .join('\n')
      return `## ${contract}\n\n| Funcionário | Matrícula | Frente | % Dedicação |\n|-------------|-----------|--------|-------------|\n${tableRows}`
    }).join('\n\n')

    return `---
title: "Alocação Diária — ${date}"
category: allocation
tags: [alocacao, diario]
date: ${date}
---

# Alocação Diária — ${date}

${sections}
`
  }
}
