import { Buffer as BufferImpl } from 'buffer'

const g = globalThis as any
const w = typeof window !== 'undefined' ? (window as any) : null

if (typeof g.Buffer === 'undefined') {
  g.Buffer = BufferImpl
}
if (w && typeof w.Buffer === 'undefined') {
  w.Buffer = BufferImpl
}
