import type { PenKind } from '../core/toolState'
import {
  clampEraserRadius,
  clampSize,
  clampTextSize,
  ERASER_RADIUS_RANGE,
  pushRecent,
  SIZE_RANGE,
  TEXT_SIZE_RANGE,
  type Settings,
} from '../core/settings'
import { mountColorWheel } from './colorWheel'

export type PopoverKind = PenKind | 'text' | 'areaEraser'

const TITLES: Record<PopoverKind, string> = {
  ink: 'Ink pen',
  felt: 'Felt pen',
  highlighter: 'Highlighter',
  text: 'Text',
  areaEraser: 'Area eraser',
}

const isPen = (k: PopoverKind): k is PenKind => k === 'ink' || k === 'felt' || k === 'highlighter'

/**
 * Settings popover shared by the pens, the text tool and the area eraser.
 * Pens and text: size slider, colour wheel and recents. Area eraser: radius slider only.
 * Changes are live; `onChange` fires on every edit so the caller can persist / redraw.
 */
export function mountPopover(
  host: HTMLElement,
  toolbarEl: HTMLElement,
  getSettings: () => Settings,
  onChange: () => void,
): { open(kind: PopoverKind, anchor: HTMLElement): void; close(): void; isOpen(): boolean; kind(): PopoverKind | null } {
  const root = document.createElement('div')
  root.className = 'popover'
  root.hidden = true
  root.setAttribute('role', 'dialog')
  host.appendChild(root)
  for (const t of ['pointerdown', 'pointermove', 'pointerup', 'pointercancel', 'contextmenu'] as const) {
    root.addEventListener(t, (e) => e.stopPropagation())
  }

  let current: PopoverKind | null = null
  let currentAnchor: HTMLElement | null = null

  const get = (k: PopoverKind): { value: number; color: string | null; range: [number, number]; unit: string } => {
    const s = getSettings()
    if (isPen(k)) return { value: s.pens[k].size, color: s.pens[k].color, range: SIZE_RANGE[k], unit: 'px' }
    if (k === 'text') return { value: s.textSize, color: s.textColor, range: TEXT_SIZE_RANGE, unit: 'px' }
    return { value: s.eraserRadius, color: null, range: ERASER_RADIUS_RANGE, unit: 'px' }
  }

  function setValue(k: PopoverKind, n: number): number {
    const s = getSettings()
    if (isPen(k)) return (s.pens[k].size = clampSize(k, n))
    if (k === 'text') return (s.textSize = clampTextSize(n))
    return (s.eraserRadius = clampEraserRadius(n))
  }
  function setColor(k: PopoverKind, hex: string): void {
    const s = getSettings()
    if (isPen(k)) s.pens[k].color = hex
    else if (k === 'text') s.textColor = hex
  }

  function build(k: PopoverKind): void {
    root.innerHTML = ''
    const info = get(k)
    const title = document.createElement('div')
    title.className = 'pop-title'
    title.textContent = TITLES[k]
    root.appendChild(title)

    // size / radius row: live dot, slider, number
    const row = document.createElement('div')
    row.className = 'pop-row'
    const dotBox = document.createElement('div')
    dotBox.className = 'pop-dotbox'
    const dot = document.createElement('div')
    dot.className = 'pop-dot'
    if (k === 'areaEraser') dot.classList.add('ring')
    dotBox.appendChild(dot)
    const slider = document.createElement('input')
    slider.type = 'range'
    slider.className = 'pop-slider'
    slider.min = String(info.range[0])
    slider.max = String(info.range[1])
    slider.step = '1'
    slider.value = String(info.value)
    slider.setAttribute('aria-label', k === 'areaEraser' ? 'Radius' : 'Size')
    const num = document.createElement('span')
    num.className = 'pop-num'
    row.append(dotBox, slider, num)
    root.appendChild(row)

    const paintDot = (): void => {
      const cur = get(k)
      // Text size shown at a capped scale so a 96 px dot still fits the preview box.
      const d = k === 'areaEraser' ? cur.value * 2 * 0.6 : k === 'text' ? Math.max(4, cur.value * 0.5) : Math.min(cur.value, 56)
      dot.style.width = dot.style.height = `${d}px`
      if (cur.color) dot.style.background = cur.color
      num.textContent = `${cur.value} ${cur.unit}`
    }
    slider.addEventListener('input', () => {
      setValue(k, Number(slider.value))
      paintDot()
      onChange()
    })

    if (info.color !== null) {
      const wheelHost = document.createElement('div')
      wheelHost.className = 'pop-wheel'
      root.appendChild(wheelHost)
      const recents = document.createElement('div')
      recents.className = 'pop-recents'
      root.appendChild(recents)

      const wheel = mountColorWheel(
        wheelHost,
        info.color,
        (hex) => {
          setColor(k, hex)
          paintDot()
          onChange()
        },
        (hex) => {
          getSettings().recent = pushRecent(getSettings().recent, hex)
          paintRecents()
          onChange()
        },
        window.innerHeight < 500 ? 140 : 200, // compact wheel in phone landscape
      )

      const paintRecents = (): void => {
        recents.innerHTML = ''
        for (const hex of getSettings().recent) {
          const b = document.createElement('button')
          b.type = 'button'
          b.className = 'pop-swatch'
          b.style.background = hex
          b.setAttribute('aria-label', `Colour ${hex}`)
          b.addEventListener('click', () => {
            setColor(k, hex)
            wheel.setColor(hex)
            getSettings().recent = pushRecent(getSettings().recent, hex)
            paintDot()
            paintRecents()
            onChange()
          })
          recents.appendChild(b)
        }
      }
      paintRecents()
    }
    paintDot()
  }

  function close(): void {
    root.hidden = true
    current = null
    currentAnchor = null
  }

  /** Sits above the toolbar, capped to the space left on screen (scrolls inside when short). */
  function place(anchor: HTMLElement): void {
    const tr = toolbarEl.getBoundingClientRect()
    root.style.bottom = `${Math.max(0, window.innerHeight - tr.top + 8)}px`
    root.style.maxHeight = `${Math.max(120, tr.top - 8 - 44)}px` // keep clear of the top bar
    const ar = anchor.getBoundingClientRect()
    const w = root.offsetWidth || 300
    const left = Math.min(Math.max(8, ar.left + ar.width / 2 - w / 2), Math.max(8, window.innerWidth - w - 8))
    root.style.left = `${left}px`
  }

  function open(kind: PopoverKind, anchor: HTMLElement): void {
    if (current === kind && !root.hidden) {
      close()
      return
    }
    current = kind
    build(kind)
    root.hidden = false
    currentAnchor = anchor
    place(anchor)
  }

  const relayout = (): void => {
    if (!root.hidden && current && currentAnchor) {
      build(current) // wheel size depends on the viewport height
      place(currentAnchor)
    }
  }
  window.addEventListener('resize', relayout)
  window.addEventListener('orientationchange', relayout)

  // Tapping outside (but not on the toolbar, which decides for itself) dismisses it.
  document.addEventListener('pointerdown', (e) => {
    const t = e.target as Node
    if (!root.hidden && !root.contains(t) && !toolbarEl.contains(t)) close()
  })

  return { open, close, isOpen: () => !root.hidden, kind: () => (root.hidden ? null : current) }
}
