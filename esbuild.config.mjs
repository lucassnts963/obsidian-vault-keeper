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
  format: 'cjs',
  target: 'es2022',
  logLevel: 'info',
  sourcemap: prod ? false : 'inline',
  treeShaking: true,
  outfile: 'main.js',
  minify: prod,
  // Polyfill Buffer (Node.js API) para o isomorphic-git no browser/mobile
  banner: {
    js: `var Buffer = require('buffer').Buffer; if (typeof globalThis !== 'undefined') globalThis.Buffer = Buffer; if (typeof window !== 'undefined') window.Buffer = Buffer;`,
  },
})
