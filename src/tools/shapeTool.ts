import type { ArrowObj, ShapeObj } from '../core/types'
import { bboxOf, newId } from '../core/geometry'
import type { StrokeStyle } from '../render/liveLayer'

export type ShapeToolKind = 'ellipse' | 'triangle' | 'rect' | 'arrow'

const MIN_DRAG = 4 // world units

/** Turn a drag from world point a to b into a board object in the given style; null if the drag is tiny. */
export function dragToObject(
  tool: ShapeToolKind,
  a: [number, number],
  b: [number, number],
  style: StrokeStyle,
): ShapeObj | ArrowObj | null {
  if (Math.hypot(b[0] - a[0], b[1] - a[1]) < MIN_DRAG) return null
  const common = { id: newId(), createdAt: Date.now(), pen: style.pen, color: style.color, size: style.size }
  if (tool === 'arrow') {
    const base = { ...common, kind: 'arrow' as const, from: [a[0], a[1]] as [number, number], to: [b[0], b[1]] as [number, number] }
    return { ...base, bbox: bboxOf(base) }
  }
  const x0 = Math.min(a[0], b[0])
  const x1 = Math.max(a[0], b[0])
  const y0 = Math.min(a[1], b[1])
  const y1 = Math.max(a[1], b[1])
  const shape = { ...common, kind: 'shape' as const }
  if (tool === 'ellipse') {
    const base = {
      ...shape,
      shape: 'ellipse' as const,
      ellipse: { cx: (x0 + x1) / 2, cy: (y0 + y1) / 2, rx: (x1 - x0) / 2, ry: (y1 - y0) / 2 },
    }
    return { ...base, bbox: bboxOf(base) }
  }
  const vertices: [number, number][] =
    tool === 'rect'
      ? [[x0, y0], [x1, y0], [x1, y1], [x0, y1]]
      : [[(x0 + x1) / 2, y0], [x1, y1], [x0, y1]]
  const base = { ...shape, shape: tool, vertices }
  return { ...base, bbox: bboxOf(base) }
}
