import type { PenKind } from '../core/toolState'

/** The board is always drawn on white (also the Share PNG background). */
export const BOARD_BG = '#ffffff'

/** Below this WCAG contrast ratio a line is hard to see on the board, so it gets an outline. */
const MIN_CONTRAST = 2

function channel(v: number): number {
  const c = v / 255
  return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
}

function luminance(hex: string): number {
  let h = hex.replace('#', '')
  if (h.length === 3) h = h.split('').map((c) => c + c).join('')
  const n = parseInt(h.slice(0, 6), 16)
  if (Number.isNaN(n)) return 0
  return 0.2126 * channel((n >> 16) & 255) + 0.7152 * channel((n >> 8) & 255) + 0.0722 * channel(n & 255)
}

/** WCAG contrast ratio: 1 (identical) … 21 (black on white). */
export function contrastRatio(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x)
  return (hi + 0.05) / (lo + 0.05)
}

/**
 * Outline colour for a line that would be hard to see on the board: black around light
 * lines on a light board, white around dark lines on a dark board. Highlighters are meant
 * to be faint, so they never get one.
 */
export function outlineColorFor(color: string, pen: PenKind, bg: string = BOARD_BG): string | null {
  if (pen === 'highlighter') return null
  if (contrastRatio(color, bg) >= MIN_CONTRAST) return null
  return luminance(bg) > 0.5 ? '#000000' : '#ffffff'
}

/** Outline thickness on each side, in world units. */
export function haloWidth(size: number): number {
  return Math.max(1, size * 0.15)
}
