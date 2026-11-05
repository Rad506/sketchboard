import { describe, it, expect } from 'vitest'
import { defaultSettings, clampSize, pushRecent, applyLoadedSettings } from '../../src/core/settings'

describe('settings', () => {
  it('defaults match spec', () => {
    const s = defaultSettings()
    expect(s.pens.ink).toEqual({ size: 3, color: '#000000' })
    expect(s.pens.felt).toEqual({ size: 6, color: '#1a2f6b' })
    expect(s.pens.highlighter).toEqual({ size: 24, color: '#ffe14d' })
    expect(s.textSize).toBe(24)
    expect(s.textColor).toBe('#000000')
    expect(s.eraserRadius).toBe(20)
    expect(s.fingerDraw).toBe(false)
    expect(s.recent).toEqual([])
  })

  it('returns an independent object each call', () => {
    const a = defaultSettings()
    a.pens.ink.size = 9
    expect(defaultSettings().pens.ink.size).toBe(3)
  })

  it('clampSize per pen range', () => {
    expect(clampSize('ink', 0)).toBe(1)
    expect(clampSize('ink', 99)).toBe(30)
    expect(clampSize('felt', 1)).toBe(2)
    expect(clampSize('felt', 99)).toBe(40)
    expect(clampSize('highlighter', 3)).toBe(8)
    expect(clampSize('highlighter', 99)).toBe(60)
    expect(clampSize('ink', 7.4)).toBe(7)
    expect(clampSize('ink', NaN)).toBe(3)
  })

  it('pushRecent dedupes and caps at 8', () => {
    expect(pushRecent([], '#AABBCC')).toEqual(['#aabbcc'])
    expect(pushRecent(['#111111', '#222222'], '#222222')).toEqual(['#222222', '#111111'])
    let r: string[] = []
    for (let i = 0; i < 12; i++) r = pushRecent(r, `#0000${i.toString(16).padStart(2, '0')}`)
    expect(r).toHaveLength(8)
    expect(r[0]).toBe('#00000b')
  })

  it('applyLoadedSettings merges in place, clamps, ignores junk', () => {
    const t = defaultSettings()
    const ref = t.pens
    applyLoadedSettings(t, {
      pens: { ink: { size: 999, color: '#123456' } },
      fingerDraw: true,
      textSize: 5,
      recent: ['#111111', 7 as unknown as string],
    } as never)
    expect(t.pens).toBe(ref)
    expect(t.pens.ink).toEqual({ size: 30, color: '#123456' })
    expect(t.pens.felt).toEqual(defaultSettings().pens.felt)
    expect(t.fingerDraw).toBe(true)
    expect(t.textSize).toBe(12)
    expect(t.recent).toEqual(['#111111'])
    applyLoadedSettings(t, undefined)
    expect(t.fingerDraw).toBe(true)
  })
})
