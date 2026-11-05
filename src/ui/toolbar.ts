import type { PenKind, Tool, ToolState } from '../core/toolState'
import { ICONS } from './icons'

export interface ToolbarOptions {
  canUndo?: () => boolean
  canRedo?: () => boolean
  /** The already-active tool was tapped again (pen / area eraser / text popovers). */
  onActiveTap?: (tool: Tool, anchor: HTMLElement) => void
  /** Current colour of a pen, shown as a chip on its button. */
  colorOf?: (pen: PenKind) => string
}

type ShapeTool = 'ellipse' | 'triangle' | 'rect'
const SHAPES: ShapeTool[] = ['ellipse', 'triangle', 'rect']
const SHAPE_LABEL: Record<ShapeTool, string> = { ellipse: 'Circle', triangle: 'Triangle', rect: 'Square' }
const PENS: PenKind[] = ['ink', 'felt', 'highlighter']

const isShape = (t: Tool): t is ShapeTool => (SHAPES as Tool[]).includes(t)

export function mountToolbar(
  el: HTMLElement,
  getState: () => ToolState,
  onSelect: (t: Tool) => void,
  onUndo: () => void,
  onRedo: () => void,
  opts: ToolbarOptions = {},
): { refresh(): void } {
  const canUndo = opts.canUndo ?? (() => true)
  const canRedo = opts.canRedo ?? (() => true)
  let lastShape: ShapeTool = 'ellipse'

  el.classList.add('toolbar')
  el.setAttribute('role', 'toolbar')
  el.setAttribute('aria-label', 'Tools')
  el.innerHTML = ''
  // Keep toolbar pointer events from ever reaching a parent (board) handler.
  for (const t of ['pointerdown', 'pointermove', 'pointerup', 'pointercancel', 'contextmenu'] as const) {
    el.addEventListener(t, (e) => e.stopPropagation())
  }

  const buttons = new Map<string, HTMLButtonElement>()
  function button(id: string, label: string, icon: string, parent: HTMLElement, toggle = true): HTMLButtonElement {
    const b = document.createElement('button')
    b.type = 'button'
    b.className = 'tb-btn'
    b.dataset.tool = id
    b.setAttribute('aria-label', label)
    b.title = label
    if (toggle) b.setAttribute('aria-pressed', 'false')
    b.innerHTML = `<span class="tb-icon">${icon}</span>`
    parent.appendChild(b)
    buttons.set(id, b)
    return b
  }
  const group = (): HTMLElement => {
    const g = document.createElement('div')
    g.className = 'tb-group'
    el.appendChild(g)
    return g
  }

  function pick(tool: Tool, b: HTMLElement): void {
    closeMenu()
    if (getState().tool === tool) opts.onActiveTap?.(tool, b)
    else onSelect(tool)
  }

  const penLabel: Record<PenKind, string> = { ink: 'Ink pen', felt: 'Felt pen', highlighter: 'Highlighter' }
  const g1 = group()
  for (const p of PENS) {
    const b = button(p, penLabel[p], ICONS[p], g1)
    b.insertAdjacentHTML('beforeend', '<span class="tb-chip"></span>')
    b.addEventListener('click', () => pick(p, b))
  }

  const g2 = group()
  const se = button('strokeEraser', 'Stroke eraser', ICONS.strokeEraser, g2)
  se.addEventListener('click', () => pick('strokeEraser', se))
  const ae = button('areaEraser', 'Area eraser', ICONS.areaEraser, g2)
  ae.addEventListener('click', () => pick('areaEraser', ae))

  const g3 = group()
  const sh = button('shapes', 'Shapes', ICONS.ellipse, g3)
  sh.insertAdjacentHTML('beforeend', `<span class="tb-caret">${ICONS.caret}</span>`)
  const shIcon = sh.querySelector('.tb-icon') as HTMLElement
  const ar = button('arrow', 'Arrow', ICONS.arrow, g3)
  ar.addEventListener('click', () => pick('arrow', ar))
  const tx = button('text', 'Text', ICONS.text, g3)
  tx.addEventListener('click', () => pick('text', tx))

  const menu = document.createElement('div')
  menu.className = 'tb-menu'
  menu.hidden = true
  for (const s of SHAPES) {
    const mb = document.createElement('button')
    mb.type = 'button'
    mb.className = 'tb-btn tb-menu-item'
    mb.dataset.shape = s
    mb.setAttribute('aria-label', SHAPE_LABEL[s])
    mb.setAttribute('role', 'menuitemradio')
    mb.innerHTML = `<span class="tb-icon">${ICONS[s]}</span><span class="tb-menu-label">${SHAPE_LABEL[s]}</span>`
    mb.addEventListener('click', () => {
      lastShape = s
      closeMenu()
      onSelect(s)
    })
    menu.appendChild(mb)
  }
  el.appendChild(menu)

  function closeMenu(): void {
    if (menu.hidden) return
    menu.hidden = true
    sh.setAttribute('aria-expanded', 'false')
  }
  function openMenu(): void {
    menu.hidden = false
    for (const mi of menu.children) {
      const on = (mi as HTMLElement).dataset.shape === lastShape
      mi.classList.toggle('active', on)
      mi.setAttribute('aria-checked', String(on))
    }
    sh.setAttribute('aria-expanded', 'true')
    const r = sh.getBoundingClientRect()
    const er = el.getBoundingClientRect()
    menu.style.left = `${Math.max(0, r.left - er.left)}px`
  }
  sh.setAttribute('aria-haspopup', 'menu')
  sh.setAttribute('aria-expanded', 'false')
  sh.addEventListener('click', () => {
    if (menu.hidden) openMenu()
    else closeMenu()
  })
  document.addEventListener('pointerdown', (e) => {
    const t = e.target as Node
    if (!menu.hidden && !menu.contains(t) && !sh.contains(t)) closeMenu()
  })

  const g4 = group()
  const un = button('undo', 'Undo', ICONS.undo, g4, false)
  un.addEventListener('click', () => {
    if (canUndo()) onUndo()
  })
  const re = button('redo', 'Redo', ICONS.redo, g4, false)
  re.addEventListener('click', () => {
    if (canRedo()) onRedo()
  })

  function refresh(): void {
    const { tool } = getState()
    if (isShape(tool)) lastShape = tool
    shIcon.innerHTML = ICONS[lastShape]
    sh.setAttribute('aria-label', `Shapes (${SHAPE_LABEL[lastShape]})`)
    for (const [id, b] of buttons) {
      if (id === 'undo' || id === 'redo') continue
      const active = id === 'shapes' ? isShape(tool) : id === tool
      b.setAttribute('aria-pressed', String(active))
      b.classList.toggle('active', active)
    }
    for (const p of PENS) {
      const chip = buttons.get(p)!.querySelector<HTMLElement>('.tb-chip')!
      chip.style.background = opts.colorOf?.(p) ?? 'transparent'
    }
    un.disabled = !canUndo()
    re.disabled = !canRedo()
    if (!isShape(tool)) closeMenu()
  }
  refresh()
  return { refresh }
}
