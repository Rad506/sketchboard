import type { BoardDoc } from '../core/board'
import type { Viewport } from '../core/viewport'
import { drawObject, renderOrder } from './pens'

/** Main (committed-objects) canvas. Draws only what the viewport can see. */
export class Renderer {
  private ctx: CanvasRenderingContext2D | null
  private vp: Viewport = { x: 0, y: 0, zoom: 1 }
  private pending = false
  /** True while the view is moving: felt shadow blur is skipped, then restored when it settles. */
  private moving = false
  private settle: ReturnType<typeof setTimeout> | null = null
  private afterDraw: (() => void)[] = []
  private hidden: Set<string> = new Set()

  constructor(private canvas: HTMLCanvasElement, private doc: BoardDoc) {
    this.ctx = canvas.getContext('2d')
    doc.onChange(() => this.requestDraw())
  }

  /** Point at another board's doc (board switch). The old doc's listener is a harmless extra redraw. */
  setDoc(doc: BoardDoc): void {
    this.doc = doc
    doc.onChange(() => {
      if (this.doc === doc) this.requestDraw()
    })
    this.requestDraw()
  }

  setViewport(vp: Viewport): void {
    this.vp = vp
    this.moving = true
    if (this.settle) clearTimeout(this.settle)
    this.settle = setTimeout(() => {
      this.settle = null
      this.moving = false
      this.requestDraw()
    }, 150)
    this.requestDraw()
  }

  /** Ids not to draw (objects being moved/resized are shown on the live layer instead). */
  setHidden(ids: Set<string>): void {
    if (ids.size === this.hidden.size && [...ids].every((id) => this.hidden.has(id))) return
    this.hidden = new Set(ids)
    this.requestDraw()
  }

  /** `after` runs right after the next frame's draw (e.g. clear the live layer once the committed stroke is visible). */
  requestDraw(after?: () => void): void {
    if (after) this.afterDraw.push(after)
    if (this.pending) return
    this.pending = true
    requestAnimationFrame(() => {
      this.pending = false
      this.draw()
      const cbs = this.afterDraw
      this.afterDraw = []
      for (const cb of cbs) cb()
    })
  }

  draw(): void {
    const c = this.ctx
    if (!c) return
    const dpr = window.devicePixelRatio || 1
    const { x, y, zoom } = this.vp
    c.setTransform(1, 0, 0, 1, 0, 0)
    c.clearRect(0, 0, this.canvas.width, this.canvas.height)
    c.setTransform(dpr * zoom, 0, 0, dpr * zoom, -x * zoom * dpr, -y * zoom * dpr)
    const w = this.canvas.width / dpr / zoom
    const h = this.canvas.height / dpr / zoom
    const visible = this.doc.query({ minX: x, minY: y, maxX: x + w, maxY: y + h })
    for (const o of renderOrder(visible.filter((o) => !this.hidden.has(o.id)))) drawObject(c, o, { fast: this.moving })
  }
}
