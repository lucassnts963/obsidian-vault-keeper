import * as XLSX from 'xlsx'
import type { AllocationEntry } from './types'

export class AllocationExcelGenerator {
  generate(entries: AllocationEntry[], _date: string): ArrayBuffer {
    const rows = [
      ['Contrato', 'Funcionário', 'Matrícula', 'Frente', '% Dedicação'],
      ...entries.map(e => [e.contract, e.employee, e.matricula ?? '', e.frente, `${e.dedication}%`]),
    ]
    const ws = XLSX.utils.aoa_to_sheet(rows)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Alocação')
    const arr = XLSX.write(wb, { type: 'array', bookType: 'xlsx' }) as number[]
    return new Uint8Array(arr).buffer as ArrayBuffer
  }
}
