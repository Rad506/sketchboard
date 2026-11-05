import { recognize, type Recognized } from './recognize'
import type { History } from '../core/history'
import { bboxOf, newId } from '../core/geometry'
import type { ArrowObj, ShapeObj, StrokeObj } from '../core/types'
import type { StrokeStyle } from '../render/liveLayer'

const HOLD_MS = 500
const STILL_PX = 6 // screen px

/**
 * Watches the pen for a 500 ms pause (within 6 screen px) and asks the recogniser
 * to snap the stroke so far. Driven by sample timestamps plus a timer for a pen
 * that stays perfectly still (no more samples arrive).
 */
export class SnapController {
  private anchor: { x: number; y: number; t: number } | null = null
  private timer: ReturnType<typeof setTimeout> | null = null
  private pts: [number, number][] = []
  private snapped: Recognized | null = null
  private fired = false

  constructor(private onPreview: (r: Recognized | null) => void) {}

  sample(sx: number, sy: number, t: number, worldPts: [number, number][]): void {
    this.pts = worldPts
    const a = this.anchor
    if (!a || Math.hypot(sx - a.x, sy - a.y) > STILL_PX) {
      if (this.snapped) {
        this.snapped = null
        this.onPreview(null)
      }
      this.anchor = { x: sx, y: sy, t }
      this.fired = false
      this.arm()
      return
    }
    if (!this.fired && t - a.t >= HOLD_MS) this.fire()
  }

  current(): Recognized | null {
    return this.snapped
  }

  /** Stroke ended or was cancelled: drop timers and any preview state. */
  cancel(): void {
    this.disarm()
    this.anchor = null
    this.snapped = null
    this.fired = false
    this.pts = []
  }

  private arm(): void {
    this.disarm()
    this.timer = setTimeout(() => this.fire(), HOLD_MS)
  }

  private disarm(): void {
    if (this.timer !== null) clearTimeout(this.timer)
    this.timer = null
  }

  private fire(): void {
    this.disarm()
    if (this.fired) return
    this.fired = true
    const r = recognize(this.pts)
    if (r) {
      this.snapped = r
      this.onPreview(r)
    }
  }
}

export function recognizedToObject(r: Recognized, style: StrokeStyle): ShapeObj | ArrowObj {
  const common = { id: newId(), createdAt: Date.now(), pen: style.pen, color: style.color, size: style.size }
  if (r.shape === 'arrow') {
    const base = { ...common, kind: 'arrow' as const, from: r.from, to: r.to }
    return { ...base, bbox: bboxOf(base) }
  }
  if (r.shape === 'ellipse') {
    const base = {
      ...common,
      kind: 'shape' as const,
      shape: 'ellipse' as const,
      ellipse: { cx: r.cx, cy: r.cy, rx: r.rx, ry: r.ry },
    }
    return { ...base, bbox: bboxOf(base) }
  }
  const base = { ...common, kind: 'shape' as const, shape: r.shape, vertices: r.vertices }
  return { ...base, bbox: bboxOf(base) }
}

/** Snapped: two Changes, so one undo restores the hand-drawn stroke and a second removes it. */
export function commitStroke(history: History, raw: StrokeObj, snapped: ShapeObj | ArrowObj | null): void {
  history.apply({ add: [raw], remove: [] })
  if (snapped) history.apply({ add: [snapped], remove: [raw] })
}
