/**
 * Turns wiki markdown pages into BM25-searchable documents. Pure-TS, no I/O:
 * callers pass already-read file contents. Title and tags are weighted above the
 * body so a match in the title outranks an equivalent match deep in the prose.
 */

import { BM25Index } from './bm25'

export interface WikiDoc {
  path: string
  title: string
  summary: string
  tags: string[]
  body: string
}

type FrontmatterValue = string | string[]

export interface ParsedFrontmatter {
  data: Record<string, FrontmatterValue>
  body: string
}

/** Split a `---`-delimited YAML frontmatter block from the markdown body. */
export function parseFrontmatter(content: string): ParsedFrontmatter {
  if (!content.startsWith('---')) return { data: {}, body: content }

  const end = content.indexOf('\n---', 3)
  if (end === -1) return { data: {}, body: content }

  const block = content.slice(3, end)
  const body = content.slice(end + 4).replace(/^\r?\n/, '')

  const data: Record<string, FrontmatterValue> = {}
  for (const rawLine of block.split('\n')) {
    const line = rawLine.trim()
    if (!line || line.startsWith('#')) continue
    const sep = line.indexOf(':')
    if (sep === -1) continue
    const key = line.slice(0, sep).trim()
    const value = line.slice(sep + 1).trim()
    if (!key) continue
    data[key] = parseValue(value)
  }

  return { data, body }
}

function parseValue(value: string): FrontmatterValue {
  if (value.startsWith('[') && value.endsWith(']')) {
    return value
      .slice(1, -1)
      .split(',')
      .map(v => stripQuotes(v.trim()))
      .filter(v => v.length > 0)
  }
  return stripQuotes(value)
}

function stripQuotes(value: string): string {
  if (value.length >= 2 && (value[0] === '"' || value[0] === "'") && value[value.length - 1] === value[0]) {
    return value.slice(1, -1)
  }
  return value
}

/** Parse a wiki page into a WikiDoc, falling back to safe defaults. */
export function parseWikiDoc(path: string, content: string): WikiDoc {
  const { data, body } = parseFrontmatter(content)

  const title = typeof data.title === 'string' && data.title ? data.title : basename(path)
  const tags = Array.isArray(data.tags) ? data.tags : []
  const summary = typeof data.summary === 'string' ? data.summary : ''

  return { path, title, summary, tags, body }
}

function basename(path: string): string {
  const file = path.slice(path.lastIndexOf('/') + 1)
  return file.replace(/\.md$/, '')
}

/** Build the indexed text: title (x3) and tags (x2) repeated to outweigh the body. */
export function buildSearchText(doc: WikiDoc): string {
  const tagText = doc.tags.join(' ')
  return [
    doc.title, doc.title, doc.title,
    tagText, tagText,
    doc.summary,
    doc.body,
  ].join('\n')
}

export interface WikiQueryHit {
  path: string
  score: number
  doc: WikiDoc
}

/** BM25 search over wiki pages, returning the matching docs with their scores. */
export class WikiSearchIndex {
  private bm25 = new BM25Index()
  private docs = new Map<string, WikiDoc>()

  setDocs(docs: WikiDoc[]): void {
    this.docs = new Map(docs.map(d => [d.path, d]))
    this.bm25.index(docs.map(d => ({ id: d.path, text: buildSearchText(d) })))
  }

  query(question: string, topK = 5): WikiQueryHit[] {
    return this.bm25.search(question, topK).map(r => ({
      path: r.id,
      score: r.score,
      doc: this.docs.get(r.id)!,
    }))
  }

  get size(): number {
    return this.docs.size
  }
}
