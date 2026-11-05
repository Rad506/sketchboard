import type { PenKind } from '../core/toolState'
import type { Pt } from '../core/types'
import { toWorld, type Viewport } from '../core/viewport'
import { drawPenStroke } from './pens'

/** `size` is in world units (same as StrokeObj.size), so preview and commit match. */
export type StrokeStyle = { pen: PenKind; color: string; size: number }

/**
 * Low-latency overlay canvas for the stroke currently being drawn.
 * Inputs are screen px; drawing uses the same viewport x dpr transform as the main renderer.
 */
export class LiveLayer {
  private ctx: CanvasRenderingContext2D | null
  private pts: Pt[] = []
  private style: StrokeStyle = { pen: 'ink', color: '#000000', size: 3 }
  private alpha = 1
  private dpr = 1
  private vp: Viewport = { x: 0, y: 0, zoom: 1 }

  constructor(private canvas: HTMLCanvasElement) {
    this.ctx =
      canvas.getContext('2d', { desynchronized: true }) ?? canvas.getContext('2d')
  }

  /** `alpha` is optional so callers can draw translucent previews (area eraser). */
  begin(style: StrokeStyle, alpha = 1): void {
    this.style = style
    this.alpha = alpha
    this.pts = []
  }

  setViewport(vp: Viewport): void {
    this.vp = vp
  }

  add(sx: number, sy: number, p: number): void {
    const [wx, wy] = toWorld(this.vp, sx, sy)
    this.pts.push([wx, wy, p])
    this.paint()
  }

  private paint(): void {
    const c = this.ctx
    if (!c) return
    const { x, y, zoom } = this.vp
    const k = this.dpr * zoom
    c.setTransform(1, 0, 0, 1, 0, 0)
    c.clearRect(0, 0, this.canvas.width, this.canvas.height)
    c.setTransform(k, 0, 0, k, -x * k, -y * k)
    const { pen, color, size } = this.style
    drawPenStroke(c, pen, color, size, this.pts, this.alpha)
  }

  clear(): void {
    this.pts = []
    this.ctx?.setTransform(1, 0, 0, 1, 0, 0)
    this.ctx?.clearRect(0, 0, this.canvas.width, this.canvas.height)
  }

  /** Call after resizing the canvas. */
  setDpr(dpr: number): void {
    this.dpr = dpr
  }
}
