import { describe, it, expect, vi } from 'vitest'
import { LiveLayer } from '../../src/render/liveLayer'

function fakeCtx() {
  return {
    clearRect: vi.fn(), beginPath: vi.fn(), moveTo: vi.fn(), lineTo: vi.fn(), stroke: vi.fn(),
    fill: vi.fn(), closePath: vi.fn(), quadraticCurveTo: vi.fn(), save: vi.fn(), restore: vi.fn(),
    setTransform: vi.fn(), lineWidth: 0, strokeStyle: '', fillStyle: '', globalAlpha: 1, lineCap: '',
    lineJoin: '', shadowColor: '', shadowBlur: 0,
    fillRect: vi.fn(), strokeRect: vi.fn(), arc: vi.fn(), setLineDash: vi.fn(),
  }
}

describe('LiveLayer', () => {
  // On Android Chrome a desynchronized overlay canvas loses alpha blending and its
  // transparent pixels render black, covering the whole board. Never request it.
  it('requests a plain transparent 2d context (never desynchronized)', () => {
    const canvas = document.createElement('canvas')
    const ctx = fakeCtx()
    const spy = vi.fn((_t: string, _opts?: unknown) => ctx)
    ;(canvas as any).getContext = spy
    new LiveLayer(canvas)
    expect(spy).toHaveBeenCalledTimes(1)
    const opts = spy.mock.calls[0][1] as { desynchronized?: boolean } | undefined
    expect(opts?.desynchronized).not.toBe(true)
  })
  it('previews felt strokes as a polyline in world space and clears', () => {
    const canvas = document.createElement('canvas')
    const ctx = fakeCtx()
    ;(canvas as any).getContext = () => ctx
    const l = new LiveLayer(canvas)
    l.setViewport({ x: 100, y: 5, zoom: 2 })
    l.begin({ pen: 'felt', color: '#123', size: 6 })
    l.add(10, 20, 0.5) // world (105, 15)
    l.add(50, 60, 0.5) // world (125, 35)
    expect(ctx.lineTo).toHaveBeenLastCalledWith(125, 35)
    expect(ctx.setTransform).toHaveBeenCalledWith(2, 0, 0, 2, -200, -10)
    expect(ctx.lineWidth).toBe(6)
    expect(ctx.stroke).toHaveBeenCalled()
    l.clear()
    expect(ctx.clearRect).toHaveBeenCalled()
  })
  it('previews ink as a filled outline', () => {
    const canvas = document.createElement('canvas')
    const ctx = fakeCtx()
    ;(canvas as any).getContext = () => ctx
    const l = new LiveLayer(canvas)
    l.begin({ pen: 'ink', color: '#000', size: 3 })
    l.add(1, 2, 0.5)
    l.add(30, 40, 0.8)
    expect(ctx.fill).toHaveBeenCalled()
  })
  describe('drawSelection', () => {
    const setup = () => {
      const canvas = document.createElement('canvas')
      const ctx = fakeCtx()
      ;(canvas as any).getContext = () => ctx
      return { l: new LiveLayer(canvas), ctx }
    }
    it('draws 8 handle rects and 1 arc for a large box', () => {
      const { l, ctx } = setup()
      l.drawSelection({ loop: null, preview: [], box: { minX: 10, minY: 10, maxX: 210, maxY: 210 } })
      expect(ctx.fillRect).toHaveBeenCalledTimes(8)
      expect(ctx.arc).toHaveBeenCalledTimes(1)
    })
    it('hides side handles for a narrow box', () => {
      const { l, ctx } = setup()
      l.drawSelection({ loop: null, preview: [], box: { minX: 10, minY: 10, maxX: 70, maxY: 210 } })
      expect(ctx.fillRect).toHaveBeenCalledTimes(4)
      expect(ctx.arc).toHaveBeenCalledTimes(1)
    })
    it('draws the loop dashed', () => {
      const { l, ctx } = setup()
      l.drawSelection({ loop: [[0, 0], [50, 0], [50, 50]], preview: [], box: null })
      const dashes = ctx.setLineDash.mock.calls.filter((c) => (c[0] as number[]).length > 0)
      expect(dashes.length).toBeGreaterThan(0)
      expect(ctx.stroke).toHaveBeenCalled()
      expect(ctx.fillRect).not.toHaveBeenCalled()
    })
  })
})
