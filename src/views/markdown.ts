export function renderMarkdown(text: string): string {
  let html = text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')

  // code blocks
  html = html.replace(/```(\w*)\n([\s\S]*?)```/g, (_, lang, code) => {
    return `<pre><code>${code.trim()}</code></pre>`
  })

  // inline code
  html = html.replace(/`([^`]+)`/g, '<code>$1</code>')

  // bold
  html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')

  // italic
  html = html.replace(/\*(.+?)\*/g, '<em>$1</em>')

  // wikilinks
  html = html.replace(/\[\[([^\]]+)\]\]/g, (_: string, link: string) => {
    const label = link.split('|')[1] || link.split('#')[0] || link
    return `<a class="vk-wikilink" data-path="${link.split('|')[0].split('#')[0].trim()}" style="color:var(--link-color);cursor:pointer;text-decoration:underline">${label.trim()}</a>`
  })

  // headings
  const lines = html.split('\n')
  const result: string[] = []
  let inList: string | null = null

  for (const line of lines) {
    // h3
    if (/^### (.+)/.test(line)) {
      if (inList) { result.push(inList === 'ul' ? '</ul>' : '</ol>'); inList = null }
      result.push(line.replace(/^### (.+)/, '<h3>$1</h3>'))
      continue
    }
    // h2
    if (/^## (.+)/.test(line)) {
      if (inList) { result.push(inList === 'ul' ? '</ul>' : '</ol>'); inList = null }
      result.push(line.replace(/^## (.+)/, '<h2>$1</h2>'))
      continue
    }
    // h1
    if (/^# (.+)/.test(line)) {
      if (inList) { result.push(inList === 'ul' ? '</ul>' : '</ol>'); inList = null }
      result.push(line.replace(/^# (.+)/, '<h1>$1</h1>'))
      continue
    }
    // hr
    if (/^---+/.test(line.trim())) {
      if (inList) { result.push(inList === 'ul' ? '</ul>' : '</ol>'); inList = null }
      result.push('<hr style="border:none;border-top:1px solid var(--background-modifier-border)">')
      continue
    }
    // unordered list
    if (/^- (.+)/.test(line)) {
      if (inList !== 'ul') {
        if (inList) result.push(inList === 'ul' ? '</ul>' : '</ol>')
        result.push('<ul>')
        inList = 'ul'
      }
      result.push(line.replace(/^- (.+)/, '<li>$1</li>'))
      continue
    }
    // ordered list
    if (/^\d+\. (.+)/.test(line)) {
      if (inList !== 'ol') {
        if (inList) result.push(inList === 'ul' ? '</ul>' : '</ol>')
        result.push('<ol>')
        inList = 'ol'
      }
      result.push(line.replace(/^\d+\. (.+)/, '<li>$1</li>'))
      continue
    }
    // empty line closes list
    if (line.trim() === '') {
      if (inList) { result.push(inList === 'ul' ? '</ul>' : '</ol>'); inList = null }
      result.push('<br>')
      continue
    }
    result.push(line)
  }
  if (inList) { result.push(inList === 'ul' ? '</ul>' : '</ol>') }

  return result.join('\n')
}
