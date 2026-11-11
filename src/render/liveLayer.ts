import type { PenKind } from '../core/toolState'
import type { BBox, BoardObject, Pt } from '../core/types'
import { toWorld, type Viewport } from '../core/viewport'
import { drawObject, drawPenStroke } from './pens'
import { handlePoints, SIDES_MIN, type Pt2 } from '../tools/lasso'

const SEL_BLUE = '#2060e0'
const CORNER_PX = 16
const SIDE_PX = 14
const MOVE_R = 16

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

  /**
   * Lasso overlay. `loop` and `preview` are world units; `box` is the padded SCREEN box
   * (from screenBox()), handles are drawn around it in screen px.
   */
  drawSelection(s: { loop: Pt2[] | null; preview: BoardObject[]; box: BBox | null }): void {
    const c = this.ctx
    this.pts = []
    this.preview = null
    if (!c) return
    const { x, y, zoom } = this.vp
    const k = this.dpr * zoom
    c.setTransform(1, 0, 0, 1, 0, 0)
    c.clearRect(0, 0, this.canvas.width, this.canvas.height)
    c.save()
    c.setTransform(k, 0, 0, k, -x * k, -y * k)
    if (s.loop && s.loop.length > 1) {
      c.beginPath()
      c.moveTo(s.loop[0][0], s.loop[0][1])
      for (let i = 1; i < s.loop.length; i++) c.lineTo(s.loop[i][0], s.loop[i][1])
      if (s.loop.length >= 3) c.closePath()
      c.lineWidth = 1.5 / zoom
      c.strokeStyle = SEL_BLUE
      c.setLineDash([6 / zoom, 4 / zoom])
      c.stroke()
      c.setLineDash([])
    }
    for (const o of s.preview) drawObject(c, o)
    c.restore()
    if (!s.box) return
    c.save()
    c.setTransform(this.dpr, 0, 0, this.dpr, 0, 0)
    const b = s.box
    c.lineWidth = 1
    c.strokeStyle = SEL_BLUE
    c.setLineDash([5, 4])
    c.strokeRect(b.minX, b.minY, b.maxX - b.minX, b.maxY - b.minY)
    c.setLineDash([])
    const pts = handlePoints(b)
    const sides = b.maxX - b.minX >= SIDES_MIN && b.maxY - b.minY >= SIDES_MIN
    c.fillStyle = '#ffffff'
    c.lineWidth = 1.5
    const square = (p: Pt2, size: number) => {
      c.fillRect(p[0] - size / 2, p[1] - size / 2, size, size)
      c.strokeRect(p[0] - size / 2, p[1] - size / 2, size, size)
    }
    for (const h of ['nw', 'ne', 'se', 'sw'] as const) square(pts[h], CORNER_PX)
    if (sides) for (const h of ['n', 'e', 's', 'w'] as const) square(pts[h], SIDE_PX)
    const [mx, my] = pts.move
    c.beginPath()
    c.arc(mx, my, MOVE_R, 0, Math.PI * 2)
    c.fill()
    c.stroke()
    // four-way arrow: two crossed lines with arrowheads
    const r = 9
    const hd = 3.5
    c.beginPath()
    c.moveTo(mx - r, my); c.lineTo(mx + r, my)
    c.moveTo(mx, my - r); c.lineTo(mx, my + r)
    c.moveTo(mx - r + hd, my - hd); c.lineTo(mx - r, my); c.lineTo(mx - r + hd, my + hd)
    c.moveTo(mx + r - hd, my - hd); c.lineTo(mx + r, my); c.lineTo(mx + r - hd, my + hd)
    c.moveTo(mx - hd, my - r + hd); c.lineTo(mx, my - r); c.lineTo(mx + hd, my - r + hd)
    c.moveTo(mx - hd, my + r - hd); c.lineTo(mx, my + r); c.lineTo(mx + hd, my + r - hd)
    c.stroke()
    c.restore()
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
