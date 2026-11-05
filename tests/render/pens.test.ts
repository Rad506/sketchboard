import { describe, it, expect } from 'vitest'
import { inkOutline, renderOrder } from '../../src/render/pens'
import type { BoardObject, Pt } from '../../src/core/types'

const box = { minX: 0, minY: 0, maxX: 1, maxY: 1 }
const stroke = (id: string, pen: 'ink' | 'felt' | 'highlighter', createdAt: number): BoardObject => ({
  id, createdAt, bbox: box, kind: 'stroke', pen, color: '#000', size: 3, points: [[0, 0, 0.5]],
})
const shape = (id: string, pen: 'ink' | 'felt' | 'highlighter', createdAt: number): BoardObject => ({
  id, createdAt, bbox: box, kind: 'shape', shape: 'line', pen, color: '#000', size: 3, vertices: [[0, 0], [1, 1]],
})

function heightAtMiddle(p: number): number {
  const pts: Pt[] = []
  for (let i = 0; i <= 40; i++) pts.push([i * 5, 0, p])
  const out = inkOutline(pts, 10)
  const mid = out.filter(([x]) => Math.abs(x - 100) < 15)
  const ys = mid.map(([, y]) => y)
  return Math.max(...ys) - Math.min(...ys)
}

describe('inkOutline', () => {
  it('single point returns a closed dot polygon with >= 8 points', () => {
    const out = inkOutline([[10, 10, 0.5]], 8)
    expect(out.length).toBeGreaterThanOrEqual(8)
    const xs = out.map((p) => p[0])
    expect(Math.max(...xs) - Math.min(...xs)).toBeGreaterThan(1)
  })
  it('width grows with pressure', () => {
    expect(heightAtMiddle(0.9)).toBeGreaterThan(heightAtMiddle(0.2) * 1.5)
  })
})

describe('renderOrder', () => {
  it('puts highlighter strokes and highlighter shapes before ink, keeping createdAt order', () => {
    const objs = [
      stroke('a', 'ink', 1), stroke('h2', 'highlighter', 4), shape('s', 'felt', 2),
      shape('h1', 'highlighter', 3), stroke('b', 'felt', 5),
    ]
    expect(renderOrder(objs).map((o) => o.id)).toEqual(['h1', 'h2', 'a', 's', 'b'])
  })
})
