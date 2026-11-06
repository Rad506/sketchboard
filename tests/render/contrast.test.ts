import { describe, it, expect } from 'vitest'
import { contrastRatio, outlineColorFor, haloWidth, BOARD_BG } from '../../src/render/contrast'

describe('contrast', () => {
  it('board background is white', () => {
    expect(BOARD_BG).toBe('#ffffff')
  })

  it('contrastRatio follows WCAG: black/white = 21, same colour = 1', () => {
    expect(contrastRatio('#000000', '#ffffff')).toBeCloseTo(21, 1)
    expect(contrastRatio('#ffffff', '#ffffff')).toBeCloseTo(1, 5)
    expect(contrastRatio('#ffffff', '#000000')).toBeCloseTo(21, 1)
  })

  it('accepts 3-digit hex', () => {
    expect(contrastRatio('#fff', '#000')).toBeCloseTo(21, 1)
  })

  it('light ink on a white board gets a black outline', () => {
    expect(outlineColorFor('#ffffff', 'ink', '#ffffff')).toBe('#000000')
    expect(outlineColorFor('#f2f2f2', 'felt', '#ffffff')).toBe('#000000')
    expect(outlineColorFor('#ffe14d', 'ink', '#ffffff')).toBe('#000000') // yellow pen on white
  })

  it('dark ink on a black board gets a white outline', () => {
    expect(outlineColorFor('#000000', 'ink', '#000000')).toBe('#ffffff')
    expect(outlineColorFor('#1a2f6b', 'felt', '#000000')).toBe('#ffffff')
  })

  it('readable colours get no outline', () => {
    expect(outlineColorFor('#000000', 'ink', '#ffffff')).toBeNull()
    expect(outlineColorFor('#1a2f6b', 'felt', '#ffffff')).toBeNull()
    expect(outlineColorFor('#e02020', 'ink', '#ffffff')).toBeNull()
    expect(outlineColorFor('#ffffff', 'ink', '#000000')).toBeNull()
  })

  it('highlighters never get an outline (they are meant to be faint)', () => {
    expect(outlineColorFor('#ffffff', 'highlighter', '#ffffff')).toBeNull()
    expect(outlineColorFor('#ffe14d', 'highlighter', '#ffffff')).toBeNull()
  })

  it('defaults to the board background', () => {
    expect(outlineColorFor('#ffffff', 'ink')).toBe('#000000')
  })

  it('haloWidth is thin but never below 1 unit', () => {
    expect(haloWidth(3)).toBe(1)
    expect(haloWidth(40)).toBeCloseTo(6, 5)
  })
})
