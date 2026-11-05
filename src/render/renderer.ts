import type { BoardDoc } from '../core/board'
import type { Viewport } from '../core/viewport'
import { drawObject, renderOrder } from './pens'

/** Main (committed-objects) canvas. Draws only what the viewport can see. */
export class Renderer {
  private ctx: CanvasRenderingContext2D | null
  private vp: Viewport = { x: 0, y: 0, zoom: 1 }
  private pending = false

  constructor(private canvas: HTMLCanvasElement, private doc: BoardDoc) {
    this.ctx = canvas.getContext('2d')
    doc.onChange(() => this.requestDraw())
  }

  setViewport(vp: Viewport): void {
    this.vp = vp
    this.requestDraw()
  }

  requestDraw(): void {
    if (this.pending) return
    this.pending = true
    requestAnimationFrame(() => {
      this.pending = false
      this.draw()
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
    for (const o of renderOrder(visible)) drawObject(c, o)
  }
}
