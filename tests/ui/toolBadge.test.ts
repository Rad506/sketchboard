import { describe, it, expect } from 'vitest'
import { renderToolBadge } from '../../src/ui/toolBadge'
import type { Tool } from '../../src/core/toolState'

describe('renderToolBadge', () => {
  const el = () => document.createElement('div')
  it.each([
    ['ink', 'Pen'],
    ['felt', 'Pen'],
    ['highlighter', 'Pen'],
    ['strokeEraser', 'Stroke eraser'],
    ['areaEraser', 'Area eraser'],
    ['rect', 'rect'],
    ['text', 'text'],
  ] as [Tool, string][])('%s -> %s', (tool, text) => {
    const e = el()
    renderToolBadge(e, tool)
    expect(e.textContent).toBe(text)
  })
  it('colour classes', () => {
    const e = el()
    renderToolBadge(e, 'strokeEraser')
    expect(e.classList.contains('badge-stroke-eraser')).toBe(true)
    renderToolBadge(e, 'areaEraser')
    expect(e.classList.contains('badge-stroke-eraser')).toBe(false)
    expect(e.classList.contains('badge-area-eraser')).toBe(true)
    renderToolBadge(e, 'ink')
    expect(e.classList.contains('badge-area-eraser')).toBe(false)
  })
})
