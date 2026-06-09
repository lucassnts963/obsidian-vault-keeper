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

export function bubble(role: 'user' | 'agent', parent: HTMLElement): { container: HTMLElement; body: HTMLElement; label: HTMLElement; time: HTMLElement } {
  const container = el('div', { style: `display:flex;padding:4px 8px;justify-content:${role === 'user' ? 'flex-end' : 'flex-start'}` }, parent)
  const wrapper = el('div', { style: 'max-width:80%' }, container)

  const header = el('div', { style: `display:flex;align-items:center;gap:6px;margin-bottom:2px;justify-content:${role === 'user' ? 'flex-end' : 'flex-start'}` }, wrapper)
  const label = el('span', { text: role === 'user' ? 'Você' : 'Agente', style: 'font-size:0.7em;font-weight:600;color:var(--text-muted)' }, header)
  el('span', { text: '·', style: 'color:var(--text-muted);font-size:0.7em' }, header)
  const now = new Date()
  const timeStr = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`
  const time = el('span', { text: timeStr, style: 'font-size:0.65em;color:var(--text-faint)' }, header)

  const bubbleColor = role === 'user' ? 'var(--interactive-accent)' : 'var(--background-secondary)'
  const textColor = role === 'user' ? 'var(--text-on-accent)' : 'var(--text-normal)'
  const body = el('div', {
    style: `display:inline-block;padding:8px 12px;border-radius:${role === 'user' ? '12px 12px 0 12px' : '12px 12px 12px 0'};background:${bubbleColor};color:${textColor};line-height:1.4`,
  }, wrapper)

  return { container, body, label, time }
}

export function collapsible(title: string, bodyText: string, parent?: HTMLElement): HTMLElement {
  const wrapper = el('div', { style: 'margin:2px 8px;font-size:0.8em' }, parent)
  const header = el('div', { style: 'display:flex;align-items:center;gap:4px;cursor:pointer;color:var(--text-muted);padding:2px 0' }, wrapper)
  el('span', { text: '🔍', style: 'font-size:0.9em' }, header)
  const titleEl = el('span', { text: title }, header)
  const arrow = el('span', { text: '▶', style: 'font-size:0.7em;transition:transform 0.2s' }, header)

  const body = el('div', {
    style: 'display:none;background:var(--background-secondary);border-left:3px solid var(--text-muted);padding:6px 10px;margin:4px 0 4px 12px;border-radius:4px;font-family:monospace;font-size:0.85em;white-space:pre-wrap;max-height:300px;overflow-y:auto;color:var(--text-muted)',
  }, wrapper)
  body.textContent = bodyText

  let open = false
  header.addEventListener('click', () => {
    open = !open
    body.style.display = open ? 'block' : 'none'
    arrow.textContent = open ? '▼' : '▶'
  })

  return wrapper
}

export function loadingDots(parent: HTMLElement): HTMLElement {
  return el('div', { text: 'Agente está pensando...', style: 'text-align:center;padding:8px;color:var(--text-muted);font-size:0.8em;animation:pulse 1.5s infinite' }, parent)
}
