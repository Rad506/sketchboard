import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../../src/render/pens', async (orig) => ({
  ...(await orig<typeof import('../../src/render/pens')>()),
  drawObject: vi.fn(),
}))

import { Renderer } from '../../src/render/renderer'
import { drawObject } from '../../src/render/pens'
import { BoardDoc } from '../../src/core/board'
import { bboxOf } from '../../src/core/geometry'
import type { BoardObject } from '../../src/core/types'

function mk(id: string, x: number): BoardObject {
  const base = { id, createdAt: 0, kind: 'stroke' as const, pen: 'ink' as const, color: '#000', size: 3, points: [[x, 10, 0.5], [x + 20, 30, 0.5]] as [number, number, number][] }
  return { ...base, bbox: bboxOf(base) }
}

function fakeCanvas() {
  const ctx = { setTransform: vi.fn(), clearRect: vi.fn() }
  const canvas = document.createElement('canvas')
  canvas.width = 800
  canvas.height = 600
  ;(canvas as any).getContext = () => ctx
  return { canvas, ctx }
}

beforeEach(() => vi.mocked(drawObject).mockClear())

describe('Renderer', () => {
  it('draws only objects inside the view', () => {
    const { canvas } = fakeCanvas()
    const doc = new BoardDoc()
    doc.add(mk('a', 100))
    doc.add(mk('b', 400))
    doc.add(mk('far', 5000))
    const r = new Renderer(canvas, doc)
    r.setViewport({ x: 0, y: 0, zoom: 1 })
    r.draw()
    expect(drawObject).toHaveBeenCalledTimes(2)
  })
  it('applies viewport x dpr transform and culls by zoom', () => {
    const { canvas, ctx } = fakeCanvas()
    const doc = new BoardDoc()
    doc.add(mk('a', 100))
    doc.add(mk('far', 5000))
    const r = new Renderer(canvas, doc)
    r.setViewport({ x: 10, y: 20, zoom: 0.1 }) // view covers 8000 x 6000 world px
    r.draw()
    expect(drawObject).toHaveBeenCalledTimes(2)
    expect(ctx.setTransform).toHaveBeenLastCalledWith(0.1, 0, 0, 0.1, -1, -2)
  })
  it('coalesces requestDraw into one frame', () => {
    const { canvas } = fakeCanvas()
    const doc = new BoardDoc()
    doc.add(mk('a', 100))
    let cb: FrameRequestCallback | null = null
    const raf = vi.fn((f: FrameRequestCallback) => ((cb = f), 1))
    vi.stubGlobal('requestAnimationFrame', raf)
    const r = new Renderer(canvas, doc)
    r.requestDraw()
    r.requestDraw()
    expect(raf).toHaveBeenCalledTimes(1)
    cb!(0)
    expect(drawObject).toHaveBeenCalledTimes(1)
    vi.unstubAllGlobals()
  })
  it('redraws when the doc changes', () => {
    const { canvas } = fakeCanvas()
    const doc = new BoardDoc()
    const raf = vi.fn((f: FrameRequestCallback) => (f(0), 1))
    vi.stubGlobal('requestAnimationFrame', raf)
    new Renderer(canvas, doc)
    doc.add(mk('a', 100))
    expect(drawObject).toHaveBeenCalledTimes(1)
    vi.unstubAllGlobals()
  })
  it('runs requestDraw callbacks right after the next draw', () => {
    const { canvas } = fakeCanvas()
    const doc = new BoardDoc()
    doc.add(mk('a', 100))
    const frames: FrameRequestCallback[] = []
    vi.stubGlobal('requestAnimationFrame', (f: FrameRequestCallback) => (frames.push(f), 1))
    const r = new Renderer(canvas, doc)
    const order: string[] = []
    vi.mocked(drawObject).mockImplementation(() => void order.push('draw'))
    r.requestDraw(() => order.push('after'))
    r.requestDraw(() => order.push('after2'))
    expect(order).toEqual([])
    frames[0](0)
    expect(order).toEqual(['draw', 'after', 'after2'])
    vi.mocked(drawObject).mockReset()
    vi.unstubAllGlobals()
  })
  it('skips felt shadow (fast) while the view moves, then restores it once settled', () => {
    vi.useFakeTimers()
    const { canvas } = fakeCanvas()
    const doc = new BoardDoc()
    doc.add(mk('a', 100))
    const frames: FrameRequestCallback[] = []
    vi.stubGlobal('requestAnimationFrame', (f: FrameRequestCallback) => (frames.push(f), 1))
    const r = new Renderer(canvas, doc)
    r.setViewport({ x: 5, y: 0, zoom: 1 })
    frames.shift()!(0)
    expect(vi.mocked(drawObject).mock.calls.at(-1)![2]).toEqual({ fast: true })
    vi.advanceTimersByTime(200)
    frames.shift()!(0)
    expect(vi.mocked(drawObject).mock.calls.at(-1)![2]).toEqual({ fast: false })
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })
  it('skips hidden ids', () => {
    const { canvas } = fakeCanvas()
    const doc = new BoardDoc()
    doc.add(mk('a', 100))
    doc.add(mk('b', 200))
    doc.add(mk('c', 300))
    vi.stubGlobal('requestAnimationFrame', () => 1)
    const r = new Renderer(canvas, doc)
    r.setViewport({ x: 0, y: 0, zoom: 1 })
    r.setHidden(new Set(['b']))
    vi.mocked(drawObject).mockClear()
    r.draw()
    const ids = vi.mocked(drawObject).mock.calls.map((c) => (c[1] as BoardObject).id).sort()
    expect(ids).toEqual(['a', 'c'])
    vi.unstubAllGlobals()
  })
})
