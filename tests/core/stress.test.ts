import { describe, it, expect } from 'vitest'
import { seedStressStrokes } from '../../src/core/stress'

describe('seedStressStrokes', () => {
  it('makes the requested count of strokes with 50-300 points, spread over ~10k world units', () => {
    const objs = seedStressStrokes(200, 7)
    expect(objs).toHaveLength(200)
    expect(new Set(objs.map((o) => o.id)).size).toBe(200)
    for (const o of objs) {
      expect(o.kind).toBe('stroke')
      expect(o.points.length).toBeGreaterThanOrEqual(50)
      expect(o.points.length).toBeLessThanOrEqual(300)
      for (const [x, y, p] of o.points) {
        expect(x).toBeGreaterThanOrEqual(0)
        expect(x).toBeLessThanOrEqual(10_000)
        expect(y).toBeGreaterThanOrEqual(0)
        expect(y).toBeLessThanOrEqual(10_000)
        expect(p).toBeGreaterThan(0)
        expect(p).toBeLessThanOrEqual(1)
      }
      expect(o.bbox.maxX).toBeGreaterThanOrEqual(o.bbox.minX)
    }
    expect(new Set(objs.map((o) => o.pen))).toEqual(new Set(['ink', 'felt', 'highlighter']))
    const xs = objs.map((o) => o.bbox.minX)
    expect(Math.max(...xs) - Math.min(...xs)).toBeGreaterThan(5_000)
  })
  it('is deterministic for a seed and differs across seeds', () => {
    const a = seedStressStrokes(20, 3)
    const b = seedStressStrokes(20, 3)
    const c = seedStressStrokes(20, 4)
    expect(JSON.stringify(a)).toBe(JSON.stringify(b))
    expect(JSON.stringify(a)).not.toBe(JSON.stringify(c))
  })
})
