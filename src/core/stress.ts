import { bboxOf } from './geometry'
import type { PenKind } from './toolState'
import type { Pt, StrokeObj } from './types'

const WORLD = 10_000
const PENS: { pen: PenKind; color: string; size: number }[] = [
  { pen: 'ink', color: '#000000', size: 3 },
  { pen: 'felt', color: '#1a2f6b', size: 6 },
  { pen: 'highlighter', color: '#ffe14d', size: 24 },
]

/** Small seeded PRNG (mulberry32) so a stress board is reproducible. */
function rng(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** `count` random wobbly strokes of 50-300 points spread over a 10,000 x 10,000 world. For `?stress=` testing. */
export function seedStressStrokes(count: number, seed = 1): StrokeObj[] {
  const r = rng(seed)
  const out: StrokeObj[] = []
  for (let i = 0; i < count; i++) {
    const look = PENS[Math.floor(r() * PENS.length)]
    const n = 50 + Math.floor(r() * 251)
    let x = r() * WORLD
    let y = r() * WORLD
    let heading = r() * Math.PI * 2
    const pts: Pt[] = []
    for (let k = 0; k < n; k++) {
      pts.push([x, y, 0.2 + r() * 0.7])
      heading += (r() - 0.5) * 0.6
      const step = 3 + r() * 5
      x = Math.min(WORLD, Math.max(0, x + Math.cos(heading) * step))
      y = Math.min(WORLD, Math.max(0, y + Math.sin(heading) * step))
    }
    const base = { kind: 'stroke' as const, id: `stress-${seed}-${i}`, createdAt: i, ...look, points: pts }
    out.push({ ...base, bbox: bboxOf(base) })
  }
  return out
}
