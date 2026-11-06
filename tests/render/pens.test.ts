import { describe, it, expect } from 'vitest'
import { drawObject, drawPenStroke, inkOutline, renderOrder } from '../../src/render/pens'
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

describe('highlighter single tap', () => {
  const recCtx = () => {
    const calls: string[] = []
    const ctx = new Proxy({} as Record<string, unknown>, {
      get: (o, k: string) => (k in o ? o[k] : (...a: unknown[]) => void calls.push(k + ':' + a.join(','))),
      set: (o, k: string, v) => ((o[k] = v), true),
    }) as unknown as CanvasRenderingContext2D
    return { ctx, calls }
  }
  it('draws a visible filled square of the pen size for a one-point stroke', () => {
    const { ctx, calls } = recCtx()
    drawPenStroke(ctx, 'highlighter', '#ffe14d', 24, [[100, 50, 0.5]])
    expect(calls).toContain('fillRect:88,38,24,24')
  })
  it('also for a stroke whose points are all identical', () => {
    const { ctx, calls } = recCtx()
    drawPenStroke(ctx, 'highlighter', '#ffe14d', 10, [[5, 5, 0.5], [5, 5, 0.6]])
    expect(calls).toContain('fillRect:0,0,10,10')
  })
  it('a moving highlighter stroke still uses the line path, not a dot', () => {
    const { ctx, calls } = recCtx()
    drawPenStroke(ctx, 'highlighter', '#ffe14d', 10, [[0, 0, 0.5], [20, 0, 0.5]])
    expect(calls.some((c) => c.startsWith('fillRect'))).toBe(false)
    expect(calls).toContain('stroke:')
  })
})

describe('low-contrast outline', () => {
  // records what each stroke()/fill() call was drawn with
  function recCtx() {
    const calls: { op: string; style: string; width: number }[] = []
    const ctx: any = {
      strokeStyle: '', fillStyle: '', lineWidth: 1, globalAlpha: 1, lineCap: '', lineJoin: '', shadowColor: '', shadowBlur: 0,
      font: '', textBaseline: '',
      save() {}, restore() {}, beginPath() {}, moveTo() {}, lineTo() {}, quadraticCurveTo() {}, closePath() {}, fillRect() {},
      stroke() { calls.push({ op: 'stroke', style: ctx.strokeStyle, width: ctx.lineWidth }) },
      fill() { calls.push({ op: 'fill', style: ctx.fillStyle, width: 0 }) },
      strokeText() { calls.push({ op: 'strokeText', style: ctx.strokeStyle, width: ctx.lineWidth }) },
      fillText() { calls.push({ op: 'fillText', style: ctx.fillStyle, width: 0 }) },
    }
    return { ctx, calls }
  }
  const line: Pt[] = [[0, 0, 0.5], [50, 0, 0.5], [100, 10, 0.5]]

  it('white ink on the white board is outlined in black before it is filled', () => {
    const { ctx, calls } = recCtx()
    drawPenStroke(ctx, 'ink', '#ffffff', 6, line)
    expect(calls.map((c) => c.op)).toEqual(['stroke', 'fill'])
    expect(calls[0].style).toBe('#000000')
    expect(calls[1].style).toBe('#ffffff')
  })

  it('black ink is drawn without an outline', () => {
    const { ctx, calls } = recCtx()
    drawPenStroke(ctx, 'ink', '#000000', 6, line)
    expect(calls.map((c) => c.op)).toEqual(['fill'])
  })

  it('a light felt line gets a wider black pass underneath', () => {
    const { ctx, calls } = recCtx()
    drawPenStroke(ctx, 'felt', '#fafafa', 10, line)
    expect(calls.map((c) => c.op)).toEqual(['stroke', 'stroke'])
    expect(calls[0]).toMatchObject({ style: '#000000' })
    expect(calls[0].width).toBeGreaterThan(calls[1].width)
    expect(calls[1].style).toBe('#fafafa')
  })

  it('highlighters are never outlined', () => {
    const { ctx, calls } = recCtx()
    drawPenStroke(ctx, 'highlighter', '#ffffff', 24, line)
    expect(calls.map((c) => c.op)).toEqual(['stroke'])
  })

  it('light shapes and text get a black outline too', () => {
    const { ctx, calls } = recCtx()
    drawObject(ctx, { id: 's', createdAt: 1, bbox: box, kind: 'shape', shape: 'line', pen: 'felt', color: '#ffffff', size: 4, vertices: [[0, 0], [10, 10]] })
    expect(calls.map((c) => c.op)).toEqual(['stroke', 'stroke'])
    expect(calls[0].style).toBe('#000000')
    const t = recCtx()
    drawObject(t.ctx, { id: 't', createdAt: 1, bbox: box, kind: 'text', x: 0, y: 0, text: 'hi', color: '#ffffff', fontSize: 24 })
    expect(t.calls.map((c) => c.op)).toEqual(['strokeText', 'fillText'])
    expect(t.calls[0].style).toBe('#000000')
  })
})

describe('felt soft edge', () => {
  function blurCtx(a: number) {
    const ctx: any = {
      strokeStyle: '', lineWidth: 1, globalAlpha: 1, lineCap: '', lineJoin: '', shadowColor: '', shadowBlur: 0,
      save() {}, restore() {}, beginPath() {}, moveTo() {}, lineTo() {},
      stroke() { ctx.seen = ctx.shadowBlur },
      getTransform: () => ({ a }),
    }
    return ctx
  }
  const line: Pt[] = [[0, 0, 0.5], [10, 0, 0.5]]
  it('matches the on-screen line width at any zoom', () => {
    const near = blurCtx(1)
    drawPenStroke(near, 'felt', '#1a2f6b', 6, line)
    expect(near.seen).toBeCloseTo(0.9, 5)
    // a line drawn at zoom 0.001 is 6000 world units wide but only 6 px on screen
    const far = blurCtx(0.001)
    drawPenStroke(far, 'felt', '#1a2f6b', 6000, line)
    expect(far.seen).toBeCloseTo(0.9, 5)
  })
  it('never exceeds 12 device px', () => {
    const ctx = blurCtx(100)
    drawPenStroke(ctx, 'felt', '#1a2f6b', 40, line)
    expect(ctx.seen).toBe(12)
  })
})
