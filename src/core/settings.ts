import type { PenKind } from './toolState'

export interface Settings {
  pens: Record<PenKind, { size: number; color: string }>
  textColor: string
  textSize: number
  eraserRadius: number
  fingerDraw: boolean
  recent: string[]
}

export const SIZE_RANGE: Record<PenKind, [number, number]> = {
  ink: [1, 30],
  felt: [2, 40],
  highlighter: [8, 60],
}
export const TEXT_SIZE_RANGE: [number, number] = [12, 96]
export const ERASER_RADIUS_RANGE: [number, number] = [5, 80]
export const MAX_RECENT = 8

export function defaultSettings(): Settings {
  return {
    pens: {
      ink: { size: 3, color: '#000000' },
      felt: { size: 6, color: '#1a2f6b' },
      highlighter: { size: 24, color: '#ffe14d' },
    },
    textColor: '#000000',
    textSize: 24,
    eraserRadius: 20,
    fingerDraw: false,
    recent: [],
  }
}

function clampInt(range: [number, number], n: number, fallback: number): number {
  if (!Number.isFinite(n)) return fallback
  return Math.min(range[1], Math.max(range[0], Math.round(n)))
}

export function clampSize(pen: PenKind, n: number): number {
  return clampInt(SIZE_RANGE[pen], n, defaultSettings().pens[pen].size)
}
export const clampTextSize = (n: number): number => clampInt(TEXT_SIZE_RANGE, n, 24)
export const clampEraserRadius = (n: number): number => clampInt(ERASER_RADIUS_RANGE, n, 20)

/** Most recent first, no duplicates (case-insensitive), at most 8. */
export function pushRecent(recent: string[], hex: string): string[] {
  const h = hex.toLowerCase()
  return [h, ...recent.filter((c) => c.toLowerCase() !== h)].slice(0, MAX_RECENT)
}

/** Copy persisted settings into `target` in place, tolerating missing/odd fields and clamping sizes. */
export function applyLoadedSettings(target: Settings, loaded: Partial<Settings> | undefined): void {
  if (!loaded) return
  for (const pen of ['ink', 'felt', 'highlighter'] as PenKind[]) {
    const p = loaded.pens?.[pen]
    if (!p) continue
    if (typeof p.color === 'string') target.pens[pen].color = p.color
    target.pens[pen].size = clampSize(pen, p.size)
  }
  if (typeof loaded.textColor === 'string') target.textColor = loaded.textColor
  if (loaded.textSize !== undefined) target.textSize = clampTextSize(loaded.textSize)
  if (loaded.eraserRadius !== undefined) target.eraserRadius = clampEraserRadius(loaded.eraserRadius)
  if (typeof loaded.fingerDraw === 'boolean') target.fingerDraw = loaded.fingerDraw
  if (Array.isArray(loaded.recent)) target.recent = loaded.recent.filter((c) => typeof c === 'string').slice(0, MAX_RECENT)
}
