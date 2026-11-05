import type { PenKind } from '../core/toolState'

export type StrokeStyle = { pen: PenKind; color: string; size: number }

/** Low-latency overlay canvas for the stroke currently being drawn (screen px). */
export class LiveLayer {
  private ctx: CanvasRenderingContext2D | null
  private last: [number, number] | null = null
  private style: StrokeStyle = { pen: 'ink', color: '#000000', size: 3 }
  private alpha = 1

  constructor(private canvas: HTMLCanvasElement) {
    this.ctx =
      canvas.getContext('2d', { desynchronized: true }) ?? canvas.getContext('2d')
  }

  /** `alpha` is optional so callers can draw translucent previews (area eraser). */
  begin(style: StrokeStyle, alpha = 1): void {
    this.style = style
    this.alpha = alpha
    this.last = null
  }

  add(sx: number, sy: number, _p: number): void {
    const c = this.ctx
    if (!c) return
    c.lineCap = 'round'
    c.lineJoin = 'round'
    c.strokeStyle = this.style.color
    c.lineWidth = this.style.size
    c.globalAlpha = this.alpha
    c.beginPath()
    const [px, py] = this.last ?? [sx, sy]
    c.moveTo(px, py)
    c.lineTo(sx, sy)
    c.stroke()
    this.last = [sx, sy]
  }

  clear(): void {
    this.last = null
    this.ctx?.clearRect(0, 0, this.canvas.width, this.canvas.height)
  }

  /** Call after resizing the canvas so 1 unit = 1 CSS px. */
  setDpr(dpr: number): void {
    this.ctx?.setTransform(dpr, 0, 0, dpr, 0, 0)
  }
}
