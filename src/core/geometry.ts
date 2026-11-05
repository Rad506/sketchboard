import type { BBox, BoardObject } from './types';

export function distPointSeg(
  px: number, py: number, ax: number, ay: number, bx: number, by: number,
): number {
  const dx = bx - ax;
  const dy = by - ay;
  const len2 = dx * dx + dy * dy;
  let t = len2 === 0 ? 0 : ((px - ax) * dx + (py - ay) * dy) / len2;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}

/** t values in [0,1] where segment a->b crosses the circle, sorted. */
export function segCircle(
  ax: number, ay: number, bx: number, by: number, cx: number, cy: number, r: number,
): number[] {
  const dx = bx - ax;
  const dy = by - ay;
  const fx = ax - cx;
  const fy = ay - cy;
  const a = dx * dx + dy * dy;
  if (a === 0) return [];
  const b = 2 * (fx * dx + fy * dy);
  const c = fx * fx + fy * fy - r * r;
  const disc = b * b - 4 * a * c;
  if (disc < 0) return [];
  const sq = Math.sqrt(disc);
  const out: number[] = [];
  for (const t of [(-b - sq) / (2 * a), (-b + sq) / (2 * a)]) {
    if (t >= 0 && t <= 1) out.push(t);
  }
  out.sort((p, q) => p - q);
  return out.length === 2 && out[0] === out[1] ? [out[0]] : out;
}

type NoBbox = BoardObject extends infer U ? (U extends BoardObject ? Omit<U, 'bbox'> : never) : never;

function arrowBarbs(
  from: [number, number], to: [number, number], size: number,
): [[number, number], [number, number]][] {
  const len = Math.max(12, 4 * size);
  const ang = Math.atan2(from[1] - to[1], from[0] - to[0]);
  const off = Math.PI / 6;
  return [off, -off].map((o): [[number, number], [number, number]] => [
    [to[0], to[1]],
    [to[0] + len * Math.cos(ang + o), to[1] + len * Math.sin(ang + o)],
  ]);
}

function textMetrics(o: { text: string; fontSize: number }): { w: number; h: number } {
  const lines = o.text.split('\n');
  const longest = Math.max(...lines.map((l) => l.length));
  return { w: 0.6 * o.fontSize * longest, h: o.fontSize * 1.2 * lines.length };
}

function ptsBox(pts: ArrayLike<number>[], pad: number): BBox {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const p of pts) {
    if (p[0] < minX) minX = p[0];
    if (p[0] > maxX) maxX = p[0];
    if (p[1] < minY) minY = p[1];
    if (p[1] > maxY) maxY = p[1];
  }
  return { minX: minX - pad, minY: minY - pad, maxX: maxX + pad, maxY: maxY + pad };
}

export function bboxOf(o: NoBbox): BBox {
  switch (o.kind) {
    case 'stroke':
      return ptsBox(o.points, o.size / 2);
    case 'shape': {
      if (o.ellipse) {
        const { cx, cy, rx, ry } = o.ellipse;
        const h = o.size / 2;
        return { minX: cx - rx - h, minY: cy - ry - h, maxX: cx + rx + h, maxY: cy + ry + h };
      }
      return ptsBox(o.vertices ?? [], o.size / 2);
    }
    case 'arrow': {
      const pts: [number, number][] = [o.from, o.to];
      for (const b of arrowBarbs(o.from, o.to, o.size)) pts.push(b[1]);
      return ptsBox(pts, o.size / 2);
    }
    case 'text': {
      const { w, h } = textMetrics(o);
      return { minX: o.x, minY: o.y, maxX: o.x + w, maxY: o.y + h };
    }
  }
}

export function outlineOf(o: BoardObject): [number, number][][] {
  switch (o.kind) {
    case 'stroke':
      return [o.points.map((p): [number, number] => [p[0], p[1]])];
    case 'shape': {
      if (o.ellipse) {
        const { cx, cy, rx, ry } = o.ellipse;
        const line: [number, number][] = [];
        for (let i = 0; i < 64; i++) {
          const t = (i / 64) * Math.PI * 2;
          line.push([cx + rx * Math.cos(t), cy + ry * Math.sin(t)]);
        }
        line.push([line[0][0], line[0][1]]);
        return [line];
      }
      const v = (o.vertices ?? []).map((p): [number, number] => [p[0], p[1]]);
      if ((o.shape === 'rect' || o.shape === 'triangle') && v.length > 0) v.push([v[0][0], v[0][1]]);
      return [v];
    }
    case 'arrow':
      return [[o.from, o.to], ...arrowBarbs(o.from, o.to, o.size)];
    case 'text': {
      const { minX, minY, maxX, maxY } = o.bbox;
      return [[[minX, minY], [maxX, minY], [maxX, maxY], [minX, maxY], [minX, minY]]];
    }
  }
}

export function newId(): string {
  return crypto.randomUUID();
}
