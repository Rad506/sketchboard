import { describe, it, expect, vi } from 'vitest'
import { LiveLayer } from '../../src/render/liveLayer'

function fakeCtx() {
  return {
    clearRect: vi.fn(), beginPath: vi.fn(), moveTo: vi.fn(), lineTo: vi.fn(), stroke: vi.fn(),
    setTransform: vi.fn(), lineWidth: 0, strokeStyle: '', globalAlpha: 1, lineCap: '', lineJoin: '',
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
  it('draws segments and clears', () => {
    const canvas = document.createElement('canvas')
    const ctx = fakeCtx()
    ;(canvas as any).getContext = () => ctx
    const l = new LiveLayer(canvas)
    l.begin({ pen: 'ink', color: '#000', size: 3 })
    l.add(1, 2, 0.5)
    l.add(5, 6, 0.5)
    expect(ctx.lineTo).toHaveBeenCalledWith(5, 6)
    expect(ctx.stroke).toHaveBeenCalled()
    l.clear()
    expect(ctx.clearRect).toHaveBeenCalled()
  })
})
