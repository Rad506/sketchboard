import { describe, it, expect } from 'vitest'
import { dragToObject } from '../../src/tools/shapeTool'
import type { ShapeObj, ArrowObj } from '../../src/core/types'

const style = { pen: 'ink' as const, color: '#000000', size: 3 }

describe('dragToObject', () => {
  it('ellipse is inscribed in the drag box', () => {
    const o = dragToObject('ellipse', [10, 20], [110, 80], style) as ShapeObj
    expect(o.kind).toBe('shape')
    expect(o.shape).toBe('ellipse')
    expect(o.ellipse).toEqual({ cx: 60, cy: 50, rx: 50, ry: 30 })
  })
  it('rect is the drag box, clockwise from top-left', () => {
    const o = dragToObject('rect', [10, 20], [110, 80], style) as ShapeObj
    expect(o.shape).toBe('rect')
    expect(o.vertices).toEqual([[10, 20], [110, 20], [110, 80], [10, 80]])
  })
  it('triangle has apex top-centre, then bottom-right, bottom-left', () => {
    const o = dragToObject('triangle', [10, 20], [110, 80], style) as ShapeObj
    expect(o.shape).toBe('triangle')
    expect(o.vertices).toEqual([[60, 20], [110, 80], [10, 80]])
  })
  it('arrow goes from a to b', () => {
    const o = dragToObject('arrow', [10, 20], [110, 80], style) as ArrowObj
    expect(o.kind).toBe('arrow')
    expect(o.from).toEqual([10, 20])
    expect(o.to).toEqual([110, 80])
  })
  it('reversed drag (b above-left of a) normalises shapes', () => {
    const r = dragToObject('rect', [110, 80], [10, 20], style) as ShapeObj
    expect(r.vertices).toEqual([[10, 20], [110, 20], [110, 80], [10, 80]])
    const e = dragToObject('ellipse', [110, 80], [10, 20], style) as ShapeObj
    expect(e.ellipse).toEqual({ cx: 60, cy: 50, rx: 50, ry: 30 })
    const t = dragToObject('triangle', [110, 80], [10, 20], style) as ShapeObj
    expect(t.vertices).toEqual([[60, 20], [110, 80], [10, 80]])
  })
  it('reversed arrow keeps its direction', () => {
    const a = dragToObject('arrow', [110, 80], [10, 20], style) as ArrowObj
    expect(a.from).toEqual([110, 80])
    expect(a.to).toEqual([10, 20])
  })
  it('tiny drag returns null', () => {
    for (const t of ['ellipse', 'triangle', 'rect', 'arrow'] as const) {
      expect(dragToObject(t, [5, 5], [7, 6], style)).toBeNull()
    }
  })
  it('style uses the last pen', () => {
    const s = { pen: 'felt' as const, color: '#1a2f6b', size: 6 }
    const o = dragToObject('rect', [0, 0], [50, 50], s) as ShapeObj
    expect([o.pen, o.color, o.size]).toEqual(['felt', '#1a2f6b', 6])
    const a = dragToObject('arrow', [0, 0], [50, 50], s) as ArrowObj
    expect([a.pen, a.color, a.size]).toEqual(['felt', '#1a2f6b', 6])
  })
  it('has id and bbox', () => {
    const o = dragToObject('rect', [0, 0], [50, 50], style)!
    expect(o.id).toBeTruthy()
    expect(o.bbox.minX).toBeLessThan(0)
  })
})
