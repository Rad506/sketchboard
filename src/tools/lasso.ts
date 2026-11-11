import type { BoardDoc } from '../core/board';
import { bboxOf, outlineOf } from '../core/geometry';
import type { BBox, BoardObject } from '../core/types';
import { toScreen, type Viewport } from '../core/viewport';

export type Pt2 = [number, number];

/** Fraction of an object's points that must lie inside the loop. */
const INSIDE_FRACTION = 0.6;
/** Loops smaller than this (screen px) in both directions select nothing. */
const MIN_LOOP_PX = 20;
/** Loop points closer than this (screen px) to the previous kept point are dropped. */
const THIN_PX = 2;

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
  const n = pts.length;
  // smallest inside-count that meets the fraction (stop counting once decided either way)
  let need = Math.ceil(n * INSIDE_FRACTION);
  while (need > 0 && (need - 1) / n >= INSIDE_FRACTION) need--;
  while (need / n < INSIDE_FRACTION) need++;
  let inside = 0;
  for (let i = 0; i < n; i++) {
    if (pointInPolygon(pts[i][0], pts[i][1], loop)) {
      if (++inside >= need) return true;
    } else if (i + 1 - inside > n - need) return false;
  }
  return inside >= need;
}

/** Drop points closer than minDist to the previously kept one; the last point is always kept. */
function thin(loop: Pt2[], minDist: number): Pt2[] {
  const out: Pt2[] = [loop[0]];
  const m2 = minDist * minDist;
  for (let i = 1; i < loop.length; i++) {
    const [px, py] = out[out.length - 1];
    const dx = loop[i][0] - px;
    const dy = loop[i][1] - py;
    if (dx * dx + dy * dy >= m2) out.push(loop[i]);
  }
  const last = loop[loop.length - 1];
  if (out[out.length - 1] !== last) out.push(last);
  return out;
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
  const thinned = thin(loop, THIN_PX / zoom);
  return doc
    .query({ minX, minY, maxX, maxY })
    .filter((o) => qualifies(o, thinned))
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

export type Handle = 'nw' | 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w' | 'move' | 'inside';

export const BOX_PAD = 8;
export const HANDLE_HIT = 44;
export const SIDES_MIN = 88;
export const MIN_SCALE = 0.05;
const MIN_FONT = 4;
const MAX_FONT = 2000;

/** World bbox converted to screen px, padded by BOX_PAD on every side. */
export function screenBox(b: BBox, vp: Viewport): BBox {
  const [x0, y0] = toScreen(vp, b.minX, b.minY);
  const [x1, y1] = toScreen(vp, b.maxX, b.maxY);
  return { minX: x0 - BOX_PAD, minY: y0 - BOX_PAD, maxX: x1 + BOX_PAD, maxY: y1 + BOX_PAD };
}

/** Screen centre of each handle for a (padded) screen box. */
export function handlePoints(box: BBox): Record<Exclude<Handle, 'inside'>, Pt2> {
  const cx = (box.minX + box.maxX) / 2;
  const cy = (box.minY + box.maxY) / 2;
  return {
    nw: [box.minX, box.minY],
    n: [cx, box.minY],
    ne: [box.maxX, box.minY],
    e: [box.maxX, cy],
    se: [box.maxX, box.maxY],
    s: [cx, box.maxY],
    sw: [box.minX, box.maxY],
    w: [box.minX, cy],
    move: [cx, cy],
  };
}

const CORNERS: Exclude<Handle, 'inside'>[] = ['nw', 'ne', 'se', 'sw'];
const SIDES: Exclude<Handle, 'inside'>[] = ['n', 'e', 's', 'w'];

/** Hit-test screen point; priority corner > side > move > inside. */
export function hitHandle(box: BBox, x: number, y: number): Handle | null {
  const pts = handlePoints(box);
  const half = HANDLE_HIT / 2;
  const hit = (h: Exclude<Handle, 'inside'>) =>
    Math.abs(x - pts[h][0]) <= half && Math.abs(y - pts[h][1]) <= half;
  const inBox = x >= box.minX && x <= box.maxX && y >= box.minY && y <= box.maxY;
  // a tiny box is all handle: inside it, moving wins so the selection stays movable
  if (inBox && (box.maxX - box.minX < 2 * HANDLE_HIT || box.maxY - box.minY < 2 * HANDLE_HIT)) {
    return hit('move') ? 'move' : 'inside';
  }
  for (const h of CORNERS) if (hit(h)) return h;
  if (box.maxX - box.minX >= SIDES_MIN && box.maxY - box.minY >= SIDES_MIN) {
    for (const h of SIDES) if (hit(h)) return h;
  }
  if (hit('move')) return 'move';
  if (inBox) return 'inside';
  return null;
}

export type Transform = { ax: number; ay: number; sx: number; sy: number; dx: number; dy: number; uniform: boolean };

const clampScale = (s: number) => (Number.isFinite(s) ? Math.max(MIN_SCALE, s) : 1);

/** Transform produced by dragging handle h from `from` to `to` (world units). */
export function transformFor(h: Handle, start: BBox, from: Pt2, to: Pt2): Transform {
  if (h === 'move' || h === 'inside') {
    return { ax: 0, ay: 0, sx: 1, sy: 1, dx: to[0] - from[0], dy: to[1] - from[1], uniform: false };
  }
  const west = h.includes('w');
  const north = h.includes('n');
  const isCorner = h.length === 2;
  // dragged edge/corner coordinates of start, and the opposite anchor
  const cx = west ? start.minX : start.maxX;
  const cy = north ? start.minY : start.maxY;
  const ax = west ? start.maxX : start.minX;
  const ay = north ? start.maxY : start.minY;
  // the dragged point moves by the pointer's delta, so grabbing off the exact corner/edge doesn't jump
  const px = cx + (to[0] - from[0]);
  const py = cy + (to[1] - from[1]);
  if (isCorner) {
    const vx = cx - ax;
    const vy = cy - ay;
    const len2 = vx * vx + vy * vy;
    const s = len2 === 0 ? 1 : clampScale(((px - ax) * vx + (py - ay) * vy) / len2);
    return { ax, ay, sx: s, sy: s, dx: 0, dy: 0, uniform: true };
  }
  const horizontal = h === 'e' || h === 'w';
  if (horizontal) {
    const d = cx - ax;
    return { ax, ay: 0, sx: d === 0 ? 1 : clampScale((px - ax) / d), sy: 1, dx: 0, dy: 0, uniform: false };
  }
  const d = cy - ay;
  return { ax: 0, ay, sx: 1, sy: d === 0 ? 1 : clampScale((py - ay) / d), dx: 0, dy: 0, uniform: false };
}

/** Apply p' = a + (p - a) * (sx, sy) + (dx, dy). Pure; recomputes bbox. */
export function transformObject(o: BoardObject, t: Transform): BoardObject {
  const px = (x: number) => t.ax + (x - t.ax) * t.sx + t.dx;
  const py = (y: number) => t.ay + (y - t.ay) * t.sy + t.dy;
  const pt = (p: [number, number]): [number, number] => [px(p[0]), py(p[1])];
  const k = t.uniform ? t.sx : 1;
  const { bbox: _old, ...rest } = o;
  void _old;
  let next: Parameters<typeof bboxOf>[0];
  switch (rest.kind) {
    case 'stroke':
      next = {
        ...rest,
        points: rest.points.map((p) => [px(p[0]), py(p[1]), p[2]]),
        size: rest.size * k,
      };
      break;
    case 'shape':
      next = {
        ...rest,
        size: rest.size * k,
        ...(rest.ellipse && {
          ellipse: {
            cx: px(rest.ellipse.cx),
            cy: py(rest.ellipse.cy),
            rx: rest.ellipse.rx * t.sx,
            ry: rest.ellipse.ry * t.sy,
          },
        }),
        ...(rest.vertices && { vertices: rest.vertices.map(pt) }),
      };
      break;
    case 'arrow':
      next = { ...rest, from: pt(rest.from), to: pt(rest.to), size: rest.size * k };
      break;
    case 'text':
      next = {
        ...rest,
        x: px(rest.x),
        y: py(rest.y),
        fontSize: t.uniform ? Math.min(MAX_FONT, Math.max(MIN_FONT, rest.fontSize * t.sx)) : rest.fontSize,
      };
      break;
  }
  return { ...next, bbox: bboxOf(next) } as BoardObject;
}
