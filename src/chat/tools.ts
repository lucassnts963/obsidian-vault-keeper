const MAX_CHARS = 3000

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

export async function readIndex(vault: any, indexPath: string): Promise<string> {
  try {
    const content = await vault.adapter.read(indexPath)
    return `## Index\n${content.slice(0, MAX_CHARS)}`
  } catch {
    return `Index not found at ${indexPath}`
  }
}

export function executeTool(vault: any, tool: string, args: any, indexPath: string): Promise<string> {
  switch (tool) {
    case 'read_file': return readFile(vault, args.path)
    case 'list_dir': return listDir(vault, args.path)
    case 'read_index': return readIndex(vault, indexPath)
    default: return Promise.resolve(`Unknown tool: ${tool}`)
  }
}
