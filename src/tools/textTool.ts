import type { Change } from '../core/history'
import type { TextObj } from '../core/types'
import { bboxOf, newId } from '../core/geometry'

export interface TextBase { x: number; y: number; color: string; fontSize: number }

/** Pure: what changes when the editor finishes with `text`. */
export function textChange(before: TextObj | null, text: string, base: TextBase): Change | null {
  if (text.trim() === '') return before ? { add: [], remove: [before] } : null
  if (before && before.text === text) return null
  const o = {
    kind: 'text' as const,
    id: before?.id ?? newId(),
    createdAt: before?.createdAt ?? Date.now(),
    x: before?.x ?? base.x,
    y: before?.y ?? base.y,
    text,
    color: before?.color ?? base.color,
    fontSize: before?.fontSize ?? base.fontSize,
  }
  return { add: [{ ...o, bbox: bboxOf(o) }], remove: before ? [before] : [] }
}

export interface EditorStyle { fontSizePx: number; color: string }

/** Absolutely positioned textarea matching the canvas text look; finishes on blur, Escape cancels. */
export function openTextEditor(
  boardEl: HTMLElement,
  screenPos: [number, number],
  initial: TextObj | null,
  style: EditorStyle,
  onDone: (text: string) => void,
  onCancel: () => void = () => {},
): { commit: () => void } {
  const ta = document.createElement('textarea')
  ta.className = 'text-editor'
  ta.value = initial?.text ?? ''
  ta.rows = 1
  ta.wrap = 'off'
  ta.spellcheck = false
  Object.assign(ta.style, {
    position: 'absolute',
    left: `${screenPos[0]}px`,
    top: `${screenPos[1]}px`,
    fontSize: `${style.fontSizePx}px`,
    lineHeight: '1.2',
    fontFamily: 'system-ui',
    color: style.color,
    zIndex: '5',
  })
  const grow = () => {
    ta.style.height = '0px'
    ta.style.height = `${ta.scrollHeight}px`
    ta.style.width = '0px'
    ta.style.width = `${Math.max(ta.scrollWidth, style.fontSizePx)}px`
  }
  let finished = false
  const finish = (commit: boolean) => {
    if (finished) return
    finished = true
    const v = ta.value
    ta.remove()
    if (commit) onDone(v)
    else onCancel()
  }
  ta.addEventListener('input', grow)
  ta.addEventListener('blur', () => finish(true))
  ta.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      e.preventDefault()
      finish(false)
    }
    e.stopPropagation()
  })
  boardEl.appendChild(ta)
  grow()
  ta.focus()
  return { commit: () => finish(true) }
}
