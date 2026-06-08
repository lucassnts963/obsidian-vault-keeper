const CSS = {
  card: 'padding:12px;margin:6px 0;border:1px solid var(--background-modifier-border);border-radius:6px;background:var(--background-primary)',
  badge: (color: string) => `display:inline-block;padding:2px 8px;border-radius:12px;font-size:0.75em;font-weight:600;background:${color}20;color:${color};margin-right:8px`,
  button: 'padding:4px 10px;margin:2px;border:none;border-radius:4px;cursor:pointer;font-size:0.8em;background:var(--interactive-normal);color:var(--text-normal)',
  buttonPrimary: 'padding:4px 10px;margin:2px;border:none;border-radius:4px;cursor:pointer;font-size:0.8em;background:var(--interactive-accent);color:var(--text-on-accent)',
  center: 'text-align:center;padding:24px;color:var(--text-muted)',
}

function el(tag: string, attrs: Record<string, string> = {}, parent?: HTMLElement): HTMLElement {
  const e = document.createElement(tag) as any
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'text') e.textContent = v
    else if (k === 'html') e.innerHTML = v
    else if (k === 'onclick') e.addEventListener('click', v)
    else if (k === 'style') e.setAttribute('style', v)
    else (e as any)[k] = v
  }
  // Adiciona métodos compatíveis com Obsidian HTMLElement
  e.createEl = (t: string, a?: Record<string, string>) => el(t, a, e)
  e.empty = () => { while (e.firstChild) e.removeChild(e.firstChild) }
  if (parent) parent.appendChild(e)
  return e
}

export function card(parent: HTMLElement): HTMLElement {
  return el('div', { style: CSS.card }, parent)
}

export function badge(text: string, color: string, parent?: HTMLElement): HTMLElement {
  return el('span', { text, style: CSS.badge(color) }, parent)
}

export function center(text: string, parent?: HTMLElement): HTMLElement {
  return el('div', { text, style: CSS.center }, parent)
}

export function button(text: string, primary: boolean, onClick: () => void, parent?: HTMLElement): HTMLElement {
  return el('button', { text, style: primary ? CSS.buttonPrimary : CSS.button, onclick: onClick as any }, parent)
}

export function normalizePath(dir: string, file: string): string {
  const name = file.replace(/\\/g, '/').split('/').pop() || file
  return `${dir}/${name}`
}

export function parseStatus(content: string): string {
  if (!content.startsWith('---')) return 'inbox'
  const end = content.indexOf('---', 3)
  if (end === -1) return 'inbox'
  return content.substring(3, end).match(/^status:\s*(.+)/m)?.[1]?.trim() || 'inbox'
}

export function ensureDir(adapter: any, dir: string): Promise<void> {
  return adapter.exists(dir).then((e: boolean) => e ? undefined : adapter.mkdir(dir))
}
