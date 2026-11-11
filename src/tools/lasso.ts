import type { BoardDoc } from '../core/board';
import { outlineOf } from '../core/geometry';
import type { BBox, BoardObject } from '../core/types';

export type Pt2 = [number, number];

/** Fraction of an object's points that must lie inside the loop. */
const INSIDE_FRACTION = 0.6;
/** Loops smaller than this (screen px) in both directions select nothing. */
const MIN_LOOP_PX = 20;

/** Even-odd point-in-polygon; the polygon is implicitly closed. */
export function pointInPolygon(x: number, y: number, poly: Pt2[]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i];
    const [xj, yj] = poly[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

function qualifies(o: BoardObject, loop: Pt2[]): boolean {
  if (o.kind === 'text') {
    return pointInPolygon((o.bbox.minX + o.bbox.maxX) / 2, (o.bbox.minY + o.bbox.maxY) / 2, loop);
  }
  const pts: ArrayLike<number>[] = o.kind === 'stroke' ? o.points : outlineOf(o).flat();
  if (pts.length === 0) return false;
  let inside = 0;
  for (const p of pts) if (pointInPolygon(p[0], p[1], loop)) inside++;
  return inside / pts.length >= INSIDE_FRACTION;
}

/** Ids of objects selected by a lasso loop (world units), in doc.query order. */
export function selectInLasso(doc: BoardDoc, loop: Pt2[], zoom: number): string[] {
  if (loop.length < 3) return [];
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const [x, y] of loop) {
    if (x < minX) minX = x;
    if (y < minY) minY = y;
    if (x > maxX) maxX = x;
    if (y > maxY) maxY = y;
  }
  if ((maxX - minX) * zoom < MIN_LOOP_PX && (maxY - minY) * zoom < MIN_LOOP_PX) return [];
  return doc
    .query({ minX, minY, maxX, maxY })
    .filter((o) => qualifies(o, loop))
    .map((o) => o.id);
}

/** Union of the objects' bboxes, or null when empty. */
export function selectionBounds(objs: BoardObject[]): BBox | null {
  if (objs.length === 0) return null;
  const b = { ...objs[0].bbox };
  for (const o of objs) {
    b.minX = Math.min(b.minX, o.bbox.minX);
    b.minY = Math.min(b.minY, o.bbox.minY);
    b.maxX = Math.max(b.maxX, o.bbox.maxX);
    b.maxY = Math.max(b.maxY, o.bbox.maxY);
  }
  return b;
}
