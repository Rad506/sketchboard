import { describe, it, expect } from 'vitest'
import { hsvToHex, hexToHsv, wheelPick } from '../../src/ui/colorWheel'

describe('colour wheel maths', () => {
  it('hsv↔hex round-trip', () => {
    for (const hex of ['#000000', '#ffffff', '#ff0000', '#00ff00', '#0000ff', '#1a2f6b', '#ffe14d', '#7f3fbf']) {
      const [h, s, v] = hexToHsv(hex)
      expect(hsvToHex(h, s, v)).toBe(hex)
    }
    expect(hsvToHex(0, 1, 1)).toBe('#ff0000')
    expect(hsvToHex(120, 1, 1)).toBe('#00ff00')
    expect(hsvToHex(240, 1, 1)).toBe('#0000ff')
  })

  it('wheelPick ring vs square vs outside', () => {
    const size = 200
    const right = wheelPick(195, 100, size)
    expect(right?.kind).toBe('hue')
    if (right?.kind === 'hue') expect(right.h).toBeCloseTo(0, 0)
    const bottom = wheelPick(100, 195, size)
    if (bottom?.kind === 'hue') expect(bottom.h).toBeCloseTo(90, 0)
    else throw new Error('expected hue')
    const mid = wheelPick(100, 100, size)
    expect(mid?.kind).toBe('sv')
    if (mid?.kind === 'sv') {
      expect(mid.s).toBeCloseTo(0.5, 1)
      expect(mid.v).toBeCloseTo(0.5, 1)
    }
    expect(wheelPick(0, 0, size)).toBeNull() // outside the ring
    expect(wheelPick(160, 100, size)).toBeNull() // gap between square and ring
  })
})
