const MAX_CHARS = 3000

import type { SearchEngine } from '../search/index'
import { formatSearchResults } from '../search/index'

export async function readFile(vault: any, path: string, maxChars = MAX_CHARS): Promise<string> {
  try {
    const content = await vault.adapter.read(path)
    if (content.length <= maxChars) return content
    return content.slice(0, maxChars) + `\n\n[... truncated at ${maxChars} chars, total ${content.length}]`
  } catch {
    return `Error: file not found or unreadable — ${path}`
  }
}

export async function listDir(vault: any, dir: string): Promise<string> {
  try {
    const list = await vault.adapter.list(dir)
    const mdFiles = list.files.filter((f: string) => f.endsWith('.md'))
    if (mdFiles.length === 0 && list.folders.length === 0) {
      return `Directory "${dir}" is empty or does not exist.`
    }
    const lines: string[] = [`Directory: ${dir}`]
    if (mdFiles.length > 0) lines.push(`Files: ${mdFiles.join(', ')}`)
    if (list.folders.length > 0) lines.push(`Subdirs: ${list.folders.join(', ')}`)
    return lines.join('\n')
  } catch {
    return `Error: could not list directory — ${dir}`
  }
}

export async function readIndex(vault: any, indexPath: string, maxChars = MAX_CHARS, searchEngine?: SearchEngine): Promise<string> {
  try {
    const content = await vault.adapter.read(indexPath)

    // If search engine is ready, return enhanced structured view
    if (searchEngine && searchEngine.isReady()) {
      const digests = searchEngine.getAll()
      const lines = [
        `## Vault Index (${digests.length} pages indexed)`,
        '',
        '| Page | Category | Tags |',
        '|------|----------|------|',
      ]
      for (const d of digests) {
        const shortPath = d.path.replace('.md', '')
        lines.push(`| [[${shortPath}|${d.title}]] | ${d.category} | ${d.tags.slice(0, 5).join(', ')} |`)
      }
      return lines.join('\n')
    }

    // Fallback: raw index content
    return `## Index\n${content.slice(0, maxChars)}`
  } catch {
    return `Index not found at ${indexPath}`
  }
}

export async function approveFile(vault: any, _args: any, _idx: string, wiki: any): Promise<string> {
  try {
    await wiki.approve({ path: _args.path })
    return `Approved: ${_args.path} → moved to raw/`
  } catch (err: any) { return `Error: ${err.message}` }
}

export async function rejectFile(vault: any, _args: any, _idx: string, wiki: any): Promise<string> {
  try {
    await wiki.reject({ path: _args.path })
    return `Rejected: ${_args.path}`
  } catch (err: any) { return `Error: ${err.message}` }
}

export async function ingestFile(vault: any, _args: any, _idx: string, wiki: any, llm: any): Promise<string> {
  try {
    await wiki.ingestFile({ path: _args.path }, llm)
    return `Ingested: ${_args.path} → wiki page created`
  } catch (err: any) { return `Error: ${err.message}` }
}

export async function runLint(vault: any, _args: any, indexPath: string, _wiki: any): Promise<string> {
  try {
    // Simple lint using vault adapter
    const issues: string[] = []
    const dirs = ['wiki', 'inbox', 'raw']
    for (const dir of dirs) {
      try {
        const list = await vault.adapter.list(dir)
        for (const f of list.files) {
          if (!f.endsWith('.md')) continue
          try {
            const c = await vault.adapter.read(`${dir}/${f}`)
            if (!c.startsWith('---')) issues.push(`${dir}/${f}: missing frontmatter`)
          } catch {}
        }
      } catch {}
    }
    if (issues.length === 0) return 'No issues found.'
    return `Lint issues:\n${issues.join('\n')}`
  } catch (err: any) { return `Lint error: ${err.message}` }
}

export async function writePageTool(vault: any, args: any, _idx: string, wiki: any): Promise<string> {
  try {
    const path = await wiki.writePage(args.title, args.content, args.tags || [], args.category || 'uncategorized')
    return `Page created: ${path}`
  } catch (err: any) { return `Error: ${err.message}` }
}

export async function searchVault(_vault: any, args: any, _idx: string, _wiki: any, _llm: any, searchEngine?: SearchEngine): Promise<string> {
  if (!searchEngine || !searchEngine.isReady()) {
    return 'Search index not built yet. Try a specific read_file or read_index first.'
  }
  const query = args.query || ''
  if (!query.trim()) return 'Please provide a search query.'

  const results = searchEngine.search(query, 5)
  return formatSearchResults(results)
}

export async function executeTool(
  vault: any, tool: string, args: any, indexPath: string, wiki?: any, llm?: any, maxFileChars?: number, searchEngine?: SearchEngine,
): Promise<string> {
  const mc = maxFileChars || MAX_CHARS
  switch (tool) {
    case 'read_file': return readFile(vault, args.path, mc)
    case 'list_dir': return listDir(vault, args.path)
    case 'read_index': return readIndex(vault, indexPath, mc, searchEngine)
    case 'search_vault': return searchVault(vault, args, indexPath, wiki, llm, searchEngine)
    case 'approve_file': return approveFile(vault, args, indexPath, wiki)
    case 'reject_file': return rejectFile(vault, args, indexPath, wiki)
    case 'ingest_file': return ingestFile(vault, args, indexPath, wiki, llm)
    case 'run_lint': return runLint(vault, args, indexPath, wiki)
    case 'write_page': return writePageTool(vault, args, indexPath, wiki)
    default: return Promise.resolve(`Unknown tool: ${tool}`)
  }
}
