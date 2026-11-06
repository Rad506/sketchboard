import type { PenKind } from '../core/toolState'
import type { BoardObject, Pt } from '../core/types'
import { toWorld, type Viewport } from '../core/viewport'
import { drawObject, drawPenStroke } from './pens'

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
  private preview: BoardObject | null = null
  private dpr = 1
  private vp: Viewport = { x: 0, y: 0, zoom: 1 }

  constructor(private canvas: HTMLCanvasElement) {
    // Not `desynchronized`: on Android Chrome that overlay loses alpha blending and
    // its transparent pixels render black over the whole board.
    this.ctx = canvas.getContext('2d')
  }

  /** `alpha` is optional so callers can draw translucent previews (area eraser). */
  begin(style: StrokeStyle, alpha = 1): void {
    this.style = style
    this.alpha = alpha
    this.pts = []
    this.preview = null
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
    if (this.preview) {
      drawObject(c, this.preview)
      return
    }
    const { pen, color, size } = this.style
    drawPenStroke(c, pen, color, size, this.pts, this.alpha)
  }

  /** Show a clean snapped object instead of the raw stroke; null goes back to the raw stroke. */
  setPreview(o: BoardObject | null): void {
    this.preview = o
    this.paint()
  }

  /** Eraser cursor: a circle outline of radius `rPx` (screen px) at screen position (sx, sy). */
  cursor(sx: number, sy: number, rPx: number): void {
    const c = this.ctx
    if (!c) return
    this.pts = []
    c.setTransform(1, 0, 0, 1, 0, 0)
    c.clearRect(0, 0, this.canvas.width, this.canvas.height)
    c.setTransform(this.dpr, 0, 0, this.dpr, 0, 0)
    c.beginPath()
    c.arc(sx, sy, rPx, 0, Math.PI * 2)
    c.lineWidth = 1.5
    c.strokeStyle = '#2060e0'
    c.fillStyle = 'rgba(32,96,224,0.12)'
    c.fill()
    c.stroke()
  }

  clear(): void {
    this.pts = []
    this.preview = null
    this.ctx?.setTransform(1, 0, 0, 1, 0, 0)
    this.ctx?.clearRect(0, 0, this.canvas.width, this.canvas.height)
  }

  /** Call after resizing the canvas. */
  setDpr(dpr: number): void {
    this.dpr = dpr
  }
}
