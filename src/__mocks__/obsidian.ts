import { vi } from 'vitest'

function makeContainer(): any {
  const el = document.createElement('div') as any
  el.empty = () => { while (el.firstChild) el.removeChild(el.firstChild) }
  el.createEl = (tag: string, attrs?: any) => {
    const child = makeContainer()
    Object.defineProperty(child, 'tagName', { value: tag.toUpperCase(), writable: false })
    if (attrs?.text) child.textContent = attrs.text
    if (attrs?.cls) child.className = attrs.cls
    el.appendChild(child)
    return child
  }
  return el
}

export const requestUrl: any = vi.fn()

export class Notice {
  message: string
  constructor(msg: string, _timeout?: number) { this.message = msg }
  setMessage(_m: string) {}
  hide() {}
}

export class PluginSettingTab {
  app: any; plugin: any; containerEl: any
  constructor(app: any, plugin: any) {
    this.app = app
    this.plugin = plugin
    this.containerEl = makeContainer()
  }
}

export class Setting {
  _name = ''; _desc = ''; _text: any = null; _toggle: any = null
  _dropdown: any = null; _hidden = false

  constructor(containerEl: any) {
    const s: any = { container: containerEl }
    ;(s as any).name = () => s
    settingStore.push(this)
  }

  setName(name: string): this { this._name = name; return this }
  setDesc(desc: string): this { this._desc = desc; return this }
  addDropdown(cb: (d: any) => void): this {
    const d: any = { _value: '', _options: [] as any[], _onChange: null as any }
    d.addOption = (v: string, label: string) => { d._options.push({ value: v, label }); return d }
    d.setValue = (v: string) => { d._value = v; return d }
    d.onChange = (fn: any) => { d._onChange = fn; return d }
    cb(d); this._dropdown = d; return this
  }
  addText(cb: (t: any) => void): this {
    const t: any = { _placeholder: '', _value: '', _onChange: null, inputEl: { type: 'text' } }
    t.setPlaceholder = (p: string) => { t._placeholder = p; return t }
    t.setValue = (v: string) => { t._value = v; return t }
    t.onChange = (fn: any) => { t._onChange = fn; return t }
    cb(t); this._text = t; return this
  }
  addToggle(cb: (t: any) => void): this {
    const t: any = { _value: false, _onChange: null }
    t.setValue = (v: boolean) => { t._value = v; return t }
    t.onChange = (fn: any) => { t._onChange = fn; return t }
    cb(t); this._toggle = t; return this
  }
  addButton(cb: (b: any) => void): this {
    const b: any = { _text: '', _onClick: null }
    b.setButtonText = (t: string) => { b._text = t; return b }
    b.onClick = (fn: any) => { b._onClick = fn; return b }
    cb(b); return this
  }
  setClass(_cls: string): this { return this }
  then(_cb: any): this { return this }
}

export class ItemView {
  leaf: any; contentEl: any
  constructor(leaf: any) { this.leaf = leaf; this.contentEl = makeContainer() }
}

export class App {}
export class TFile {}
export class Vault {}
export class WorkspaceLeaf {}
export const addIcon = () => {}
export const setIcon = () => {}

export const Platform = {
  isDesktopApp: false,
  isMobileApp: false,
  isAndroidApp: false,
  isIosApp: false,
}

export class Modal {
  app: any
  contentEl: any
  constructor(app: any) {
    this.app = app
    this.contentEl = makeContainer()
  }
  open() {}
  close() {}
  onOpen() {}
  onClose() {}
}

export let settingStore: any[] = []
export function resetSettingStore() { settingStore = [] }
