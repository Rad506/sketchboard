import { getStroke } from 'perfect-freehand'
import { outlineOf } from '../core/geometry'
import type { BoardObject, Pt, StrokeObj } from '../core/types'
import type { PenKind } from '../core/toolState'
import { haloWidth, outlineColorFor } from './contrast'

export const PEN_DEFAULTS: Record<PenKind, { size: number; color: string }> = {
  ink: { size: 3, color: '#000000' },
  felt: { size: 6, color: '#1a2f6b' },
  highlighter: { size: 24, color: '#ffe14d' },
}

export const HIGHLIGHTER_ALPHA = 0.35

/** `fast` skips the felt shadow blur (expensive) while the view is panning / zooming. */
export type DrawOpts = { fast?: boolean }

function dotOutline(x: number, y: number, p: number, size: number): [number, number][] {
  const r = Math.max(size * (0.5 - 0.6 * (0.5 - p)), 0.5)
  const out: [number, number][] = []
  for (let i = 0; i < 16; i++) {
    const t = (i / 16) * Math.PI * 2
    out.push([x + r * Math.cos(t), y + r * Math.sin(t)])
  }
  return out
}

export function inkOutline(points: Pt[], size: number): [number, number][] {
  // perfect-freehand collapses a lone tap to a 3-point sliver, so draw a round dot ourselves.
  if (points.length === 0) return []
  const [x0, y0, p0] = points[0]
  if (points.every((p) => p[0] === x0 && p[1] === y0)) {
    return dotOutline(x0, y0, Math.max(...points.map((p) => p[2])) || p0, size)
  }
  return getStroke(points, {
    size,
    thinning: 0.6,
    smoothing: 0.5,
    streamline: 0.4,
    simulatePressure: false,
    start: { taper: true },
    end: { taper: true },
  }) as [number, number][]
}

/** Sets stroke look for felt / highlighter / plain lines. Caller owns save/restore. */
function applyLineLook(
  ctx: CanvasRenderingContext2D, pen: PenKind, color: string, size: number, alphaMul: number, fast = false,
): void {
  ctx.strokeStyle = color
  ctx.lineWidth = size
  if (pen === 'highlighter') {
    ctx.globalAlpha = HIGHLIGHTER_ALPHA * alphaMul
    ctx.lineCap = 'butt'
    ctx.lineJoin = 'bevel'
    return
  }
  ctx.globalAlpha = alphaMul
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  if (pen === 'felt' && !fast) {
    ctx.shadowColor = color
    ctx.shadowBlur = size * 0.15
  }
}

function polyline(ctx: CanvasRenderingContext2D, pts: ArrayLike<number>[]): void {
  if (pts.length === 0) return
  ctx.beginPath()
  ctx.moveTo(pts[0][0], pts[0][1])
  if (pts.length === 1) ctx.lineTo(pts[0][0], pts[0][1])
  for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1])
  ctx.stroke()
}

/** Traces the smoothed outline onto a Path2D or a ctx (both share the path API). */
function traceOutline(p: Path2D | CanvasRenderingContext2D, out: [number, number][]): void {
  p.moveTo(out[0][0], out[0][1])
  for (let i = 1; i < out.length; i++) {
    const [x0, y0] = out[i - 1]
    const [x1, y1] = out[i]
    p.quadraticCurveTo(x0, y0, (x0 + x1) / 2, (y0 + y1) / 2)
  }
  p.closePath()
}

/** Strokes the shape edge in a contrasting colour first, so a light line stays visible on the light board. */
function strokeHalo(ctx: CanvasRenderingContext2D, halo: string | null, size: number, path?: Path2D): void {
  if (!halo) return
  ctx.strokeStyle = halo
  ctx.lineWidth = haloWidth(size) * 2
  ctx.lineJoin = 'round'
  if (path) ctx.stroke(path)
  else ctx.stroke()
}

function fillOutline(ctx: CanvasRenderingContext2D, out: [number, number][], halo: string | null = null, size = 0): void {
  if (out.length === 0) return
  ctx.beginPath()
  traceOutline(ctx, out)
  strokeHalo(ctx, halo, size)
  ctx.fill()
}

/** Committed objects are immutable, so an ink stroke's outline (or its Path2D) is built once. */
const inkCache = new WeakMap<object, Path2D | [number, number][]>()

function fillInkObject(ctx: CanvasRenderingContext2D, o: StrokeObj): void {
  let hit = inkCache.get(o)
  if (!hit) {
    const out = inkOutline(o.points, o.size)
    if (out.length > 0 && typeof Path2D !== 'undefined') {
      hit = new Path2D()
      traceOutline(hit, out)
    } else {
      hit = out
    }
    inkCache.set(o, hit)
  }
  const halo = outlineColorFor(o.color, o.pen)
  if (Array.isArray(hit)) fillOutline(ctx, hit, halo, o.size)
  else {
    strokeHalo(ctx, halo, o.size, hit)
    ctx.fill(hit)
  }
}

/** Draws one pen stroke in whatever coordinate space the caller has set up. */
export function drawPenStroke(
  ctx: CanvasRenderingContext2D, pen: PenKind, color: string, size: number, pts: Pt[], alphaMul = 1, opts: DrawOpts = {},
): void {
  ctx.save()
  if (pen === 'ink') {
    ctx.fillStyle = color
    ctx.globalAlpha = alphaMul
    fillOutline(ctx, inkOutline(pts, size), outlineColorFor(color, pen), size)
  } else if (pen === 'highlighter' && pts.length > 0 && pts.every((p) => p[0] === pts[0][0] && p[1] === pts[0][1])) {
    // a butt-capped zero-length line draws nothing, so a tap gets a filled square of the pen size
    ctx.fillStyle = color
    ctx.globalAlpha = HIGHLIGHTER_ALPHA * alphaMul
    ctx.fillRect(pts[0][0] - size / 2, pts[0][1] - size / 2, size, size)
  } else {
    strokeLines(ctx, pen, color, size, [pts], alphaMul, opts.fast)
  }
  ctx.restore()
}

/** Polylines in the pen look, with a wider contrasting pass underneath when the colour is hard to see. */
function strokeLines(
  ctx: CanvasRenderingContext2D, pen: PenKind, color: string, size: number,
  lines: ArrayLike<number>[][], alphaMul: number, fast?: boolean,
): void {
  const halo = outlineColorFor(color, pen)
  if (halo) {
    applyLineLook(ctx, pen, halo, size + haloWidth(size) * 2, alphaMul, true)
    for (const l of lines) polyline(ctx, l)
  }
  applyLineLook(ctx, pen, color, size, alphaMul, fast)
  for (const l of lines) polyline(ctx, l)
}

/** World-coordinate drawing; the caller sets the transform. */
export function drawObject(ctx: CanvasRenderingContext2D, o: BoardObject, opts: DrawOpts = {}): void {
  switch (o.kind) {
    case 'stroke':
      if (o.pen === 'ink') {
        ctx.save()
        ctx.fillStyle = o.color
        fillInkObject(ctx, o)
        ctx.restore()
      } else {
        drawPenStroke(ctx, o.pen, o.color, o.size, o.points, 1, opts)
      }
      return
    case 'shape':
    case 'arrow':
      ctx.save()
      strokeLines(ctx, o.pen, o.color, o.size, outlineOf(o), 1, opts.fast)
      ctx.restore()
      return
    case 'text': {
      ctx.save()
      ctx.fillStyle = o.color
      ctx.font = `${o.fontSize}px system-ui`
      ctx.textBaseline = 'top'
      const halo = outlineColorFor(o.color, 'ink')
      if (halo) {
        ctx.strokeStyle = halo
        ctx.lineWidth = Math.max(1, o.fontSize * 0.08) * 2
        ctx.lineJoin = 'round'
      }
      o.text.split('\n').forEach((line, i) => {
        const y = o.y + i * o.fontSize * 1.2
        if (halo) ctx.strokeText(line, o.x, y)
        ctx.fillText(line, o.x, y)
      })
      ctx.restore()
      return
    }
  }
}

const isHighlighter = (o: BoardObject): boolean =>
  (o.kind === 'stroke' || o.kind === 'shape' || o.kind === 'arrow') && o.pen === 'highlighter'

/** Highlighter objects first, then the rest; each group keeps createdAt order. */
export function renderOrder(objs: BoardObject[]): BoardObject[] {
  const byTime = [...objs].sort((a, b) => a.createdAt - b.createdAt)
  return [...byTime.filter(isHighlighter), ...byTime.filter((o) => !isHighlighter(o))]
}
