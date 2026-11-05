import { describe, it, expect, vi } from 'vitest'
import { mountToolbar } from '../../src/ui/toolbar'
import type { ToolState } from '../../src/core/toolState'

function setup(state: ToolState, opts: { canUndo?: boolean; canRedo?: boolean } = {}) {
  const el = document.createElement('div')
  document.body.appendChild(el)
  let st = state
  const onSelect = vi.fn()
  const onUndo = vi.fn()
  const onRedo = vi.fn()
  const flags = { canUndo: opts.canUndo ?? true, canRedo: opts.canRedo ?? true }
  const tb = mountToolbar(el, () => st, onSelect, onUndo, onRedo, {
    canUndo: () => flags.canUndo,
    canRedo: () => flags.canRedo,
  })
  const btn = (id: string) => el.querySelector<HTMLButtonElement>(`[data-tool="${id}"]`)!
  return { el, tb, btn, onSelect, onUndo, onRedo, flags, set: (s: ToolState) => (st = s) }
}

describe('toolbar', () => {
  it('marks the active tool and disables Undo when !canUndo', () => {
    const t = setup({ tool: 'felt', lastPen: 'felt' }, { canUndo: false, canRedo: true })
    expect(t.btn('felt').getAttribute('aria-pressed')).toBe('true')
    expect(t.btn('ink').getAttribute('aria-pressed')).toBe('false')
    expect(t.btn('undo').disabled).toBe(true)
    expect(t.btn('redo').disabled).toBe(false)
    t.btn('undo').click()
    expect(t.onUndo).not.toHaveBeenCalled()

    t.set({ tool: 'strokeEraser', lastPen: 'felt' })
    t.flags.canUndo = true
    t.tb.refresh()
    expect(t.btn('strokeEraser').getAttribute('aria-pressed')).toBe('true')
    expect(t.btn('felt').getAttribute('aria-pressed')).toBe('false')
    expect(t.btn('undo').disabled).toBe(false)
    t.btn('undo').click()
    expect(t.onUndo).toHaveBeenCalledTimes(1)
  })

  it('selects tools; shapes button remembers the last shape', () => {
    const t = setup({ tool: 'ink', lastPen: 'ink' })
    t.btn('ink').click()
    expect(t.onSelect).not.toHaveBeenCalled() // active tap goes to onActiveTap, not select
    t.btn('felt').click()
    expect(t.onSelect).toHaveBeenLastCalledWith('felt')
    t.btn('shapes').click() // first tap opens the menu, last shape preselected
    const menu = t.el.querySelector<HTMLElement>('.tb-menu')!
    expect(menu.hidden).toBe(false)
    expect(menu.querySelector('[data-shape="ellipse"]')!.classList.contains('active')).toBe(true)
    menu.querySelector<HTMLButtonElement>('[data-shape="rect"]')!.click()
    expect(t.onSelect).toHaveBeenLastCalledWith('rect')
    expect(menu.hidden).toBe(true)
    t.set({ tool: 'rect', lastPen: 'ink' })
    t.tb.refresh()
    t.btn('shapes').click() // active: toggles
    expect(menu.hidden).toBe(false)
    expect(menu.querySelector('[data-shape="rect"]')!.classList.contains('active')).toBe(true)
    t.btn('shapes').click()
    expect(menu.hidden).toBe(true)
  })
})
