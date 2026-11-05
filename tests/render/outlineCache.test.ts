import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('perfect-freehand', async (orig) => {
  const m = await orig<typeof import('perfect-freehand')>()
  return { ...m, getStroke: vi.fn(m.getStroke) }
})

import { getStroke } from 'perfect-freehand'
import { drawObject } from '../../src/render/pens'
import { seedStressStrokes } from '../../src/core/stress'

function stubCtx() {
  return new Proxy({}, { get: () => () => {}, set: () => true }) as unknown as CanvasRenderingContext2D
}

const calls = (): number => vi.mocked(getStroke).mock.calls.length

beforeEach(() => {
  vi.mocked(getStroke).mockClear()
})

describe('ink outline cache', () => {
  it('computes each ink stroke outline once across repeated renders', () => {
    const inks = seedStressStrokes(30, 5).filter((o) => o.pen === 'ink')
    expect(inks.length).toBeGreaterThan(3)
    const ctx = stubCtx()
    for (const o of inks) drawObject(ctx, o)
    expect(calls()).toBe(inks.length)
    for (const o of inks) drawObject(ctx, o)
    for (const o of inks) drawObject(ctx, o)
    expect(calls()).toBe(inks.length)
  })
})
