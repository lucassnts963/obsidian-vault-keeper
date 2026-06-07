import esbuild from 'esbuild'
import process from 'process'

const prod = process.argv[2] === 'production'

await esbuild.build({
  entryPoints: ['src/main.ts'],
  bundle: true,
  external: [
    'obsidian',
    'electron',
    '@codemirror/autocomplete',
    '@codemirror/collab',
    '@codemirror/commands',
    '@codemirror/language',
    '@codemirror/lint',
    '@codemirror/search',
    '@codemirror/state',
    '@codemirror/view',
    '@lezer/common',
    '@lezer/highlight',
    '@lezer/lr',
  ],
  // Injeta o polyfill Buffer no topo absoluto do bundle.
  // Diferente de import (sujeito a hoisting) e banner (não acessa módulos),
  // o inject força o código do polyfill ANTES de qualquer outro require.
  inject: ['./src/polyfill.ts'],
  format: 'cjs',
  target: 'es2022',
  logLevel: 'info',
  sourcemap: prod ? false : 'inline',
  treeShaking: true,
  outfile: 'main.js',
  minify: prod,
})
