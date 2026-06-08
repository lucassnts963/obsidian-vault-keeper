export let settingStore: any[] = []

export function resetSettingStore() {
  settingStore = []
}

function makeContainer(): any {
  const el = document.createElement('div') as any
  el.empty = () => { while (el.firstChild) el.removeChild(el.firstChild) }
  el.createEl = (tag: string, attrs?: any) => {
    const child = document.createElement(tag)
    if (attrs?.text) child.textContent = attrs.text
    if (attrs?.cls) child.className = attrs.cls
    el.appendChild(child)
    return child
  }
  return el
}

export class PluginSettingTab {
  app: any
  plugin: any
  containerEl: any
  constructor(app: any, plugin: any) {
    this.app = app
    this.plugin = plugin
    this.containerEl = makeContainer()
  }
}

export class Setting {
  _name = ''
  _desc = ''
  _text: any = null
  _toggle: any = null
  _dropdown: any = null
  _component: any = null
  _hidden = false

  constructor(containerEl: any) {
    this._component = { container: containerEl }
  }

  setName(name: string): this { this._name = name; return this }
  setDesc(desc: string): this { this._desc = desc; return this }

  addDropdown(cb: (d: any) => void): this {
    const d: any = { _value: '', _options: [] as any[], _onChange: null as any }
    d.addOption = (v: string, label: string) => { d._options.push({ value: v, label }); return d }
    d.setValue = (v: string) => { d._value = v; return d }
    d.onChange = (fn: any) => { d._onChange = fn; return d }
    cb(d)
    this._dropdown = d
    settingStore.push(this)
    return this
  }

  addText(cb: (t: any) => void): this {
    const t: any = { _placeholder: '', _value: '', _onChange: null, inputEl: { type: 'text' } }
    t.setPlaceholder = (p: string) => { t._placeholder = p; return t }
    t.setValue = (v: string) => { t._value = v; return t }
    t.onChange = (fn: any) => { t._onChange = fn; return t }
    cb(t)
    this._text = t
    settingStore.push(this)
    return this
  }

  addToggle(cb: (t: any) => void): this {
    const t: any = { _value: false, _onChange: null }
    t.setValue = (v: boolean) => { t._value = v; return t }
    t.onChange = (fn: any) => { t._onChange = fn; return t }
    cb(t)
    this._toggle = t
    settingStore.push(this)
    return this
  }

  setClass(_cls: string): this { return this }
  then(_cb: any): this { return this }
}

export class App {}
export class Notice {}
export class TFile {}
export class Vault {}
