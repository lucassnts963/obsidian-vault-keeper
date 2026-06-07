import { Buffer } from 'buffer'

// Garante que o Buffer exista no escopo global (Mobile e Desktop)
if (typeof globalThis.Buffer === 'undefined') {
  ;(globalThis as any).Buffer = Buffer
}

// Exporta o Buffer para o esbuild mapear a variável
export { Buffer }
