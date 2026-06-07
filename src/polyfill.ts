// Polyfill Buffer (Node.js API) para o isomorphic-git no browser/mobile.
// O WebView do Obsidian não tem Buffer global — este módulo supre.
// PRECISA ser um módulo separado: quando main.ts dá require('./polyfill'),
// o import + assignment executam atomicamente ANTES dos próximos requires.
import { Buffer } from 'buffer'

;(globalThis as any).Buffer = Buffer
if (typeof window !== 'undefined') {
  ;(window as any).Buffer = Buffer
}
