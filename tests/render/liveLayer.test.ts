import { describe, it, expect, vi } from 'vitest'
import { LiveLayer } from '../../src/render/liveLayer'

function fakeCtx() {
  return {
    clearRect: vi.fn(), beginPath: vi.fn(), moveTo: vi.fn(), lineTo: vi.fn(), stroke: vi.fn(),
    fill: vi.fn(), closePath: vi.fn(), quadraticCurveTo: vi.fn(), save: vi.fn(), restore: vi.fn(),
    setTransform: vi.fn(), lineWidth: 0, strokeStyle: '', fillStyle: '', globalAlpha: 1, lineCap: '',
    lineJoin: '', shadowColor: '', shadowBlur: 0,
  }
}

describe('LiveLayer', () => {
  it('requests desynchronized first, falls back when null', () => {
    const canvas = document.createElement('canvas')
    const ctx = fakeCtx()
    const spy = vi.fn((_t: string, opts?: unknown) => (opts ? null : ctx))
    ;(canvas as any).getContext = spy
    new LiveLayer(canvas)
    expect(spy).toHaveBeenCalledTimes(2)
    expect(spy.mock.calls[0][1]).toEqual({ desynchronized: true })
    expect(spy.mock.calls[1][1]).toBeUndefined()
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
})
