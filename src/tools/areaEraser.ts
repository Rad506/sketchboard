import type { BoardDoc } from '../core/board';
import type { History } from '../core/history';
import type { ArrowObj, BoardObject, Pt, ShapeObj, StrokeObj } from '../core/types';
import { bboxOf, distPointSeg, newId, outlineOf, segCircle } from '../core/geometry';

const EPS = 1 - 1e-9;

/** Splits a polyline at the circle, dropping the parts inside. Pieces under 2 points are dropped. */
export function cutPoints(points: Pt[], cx: number, cy: number, r: number): Pt[][] {
  const rr = r * EPS;
  const inside = (p: Pt) => Math.hypot(p[0] - cx, p[1] - cy) < rr;
  const at = (a: Pt, b: Pt, t: number): Pt => [
    a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t,
  ];
  const out: Pt[][] = [];
  let cur: Pt[] = [];
  const flush = () => {
    if (cur.length >= 2) out.push(cur);
    cur = [];
  };
  if (points.length === 0) return out;
  if (!inside(points[0])) cur.push(points[0]);
  for (let i = 0; i + 1 < points.length; i++) {
    const a = points[i], b = points[i + 1];
    const ai = inside(a), bi = inside(b);
    const ts = segCircle(a[0], a[1], b[0], b[1], cx, cy, r);
    if (!ai && !bi) {
      if (ts.length === 2 && ts[1] - ts[0] > 1e-9) {
        cur.push(at(a, b, ts[0]));
        flush();
        cur.push(at(a, b, ts[1]), b);
      } else cur.push(b);
    } else if (!ai && bi) {
      cur.push(at(a, b, ts.length ? ts[0] : 0));
      flush();
    } else if (ai && !bi) {
      cur = [at(a, b, ts.length ? ts[ts.length - 1] : 1), b];
    }
  }
  flush();
  return out;
}

/** Each outline polyline of a shape/arrow becomes a stroke (pressure 0.5, same pen/colour/size). */
export function toStrokes(o: ShapeObj | ArrowObj): StrokeObj[] {
  const res: StrokeObj[] = [];
  for (const line of outlineOf(o)) {
    if (line.length < 2) continue;
    const base = {
      kind: 'stroke' as const, id: newId(), createdAt: o.createdAt,
      pen: o.pen, color: o.color, size: o.size,
      points: line.map(([x, y]): Pt => [x, y, 0.5]),
    };
    res.push({ ...base, bbox: bboxOf(base) });
  }
  return res;
}

function touches(line: ArrayLike<number>[], cx: number, cy: number, r: number): boolean {
  const rr = r * EPS;
  if (line.length === 1) return Math.hypot(line[0][0] - cx, line[0][1] - cy) < rr;
  for (let i = 0; i + 1 < line.length; i++) {
    if (distPointSeg(cx, cy, line[i][0], line[i][1], line[i + 1][0], line[i + 1][1]) < rr) return true;
  }
  return false;
}

export class AreaEraseSession {
  private originals = new Map<string, BoardObject>();
  private created = new Map<string, BoardObject>();
  private last: [number, number] | null = null;

  constructor(private doc: BoardDoc, private history: History) {}

  /** Sub-samples the movement so consecutive circles are at most r/2 apart (fast swipes can't skip). */
  move(x: number, y: number, rWorld: number): void {
    const [px, py] = this.last ?? [x, y];
    this.last = [x, y];
    const d = Math.hypot(x - px, y - py);
    const n = Math.max(1, Math.ceil(d / (rWorld / 2)));
    for (let i = 1; i <= n; i++) this.cut(px + ((x - px) * i) / n, py + ((y - py) * i) / n, rWorld);
  }

  private cut(cx: number, cy: number, r: number): void {
    const cands = this.doc.query({ minX: cx - r, minY: cy - r, maxX: cx + r, maxY: cy + r });
    for (const o of cands) {
      if (o.kind === 'text') continue;
      if (!outlineOf(o).some((l) => touches(l, cx, cy, r))) continue;
      const strokes = o.kind === 'stroke' ? [o] : toStrokes(o);
      const pieces: StrokeObj[] = [];
      for (const s of strokes) {
        for (const pts of cutPoints(s.points, cx, cy, r)) {
          const base = {
            kind: 'stroke' as const, id: newId(), createdAt: s.createdAt,
            pen: s.pen, color: s.color, size: s.size, points: pts,
          };
          pieces.push({ ...base, bbox: bboxOf(base) });
        }
      }
      this.doc.remove(o.id);
      if (this.created.has(o.id)) this.created.delete(o.id);
      else this.originals.set(o.id, o);
      for (const p of pieces) {
        this.doc.add(p);
        this.created.set(p.id, p);
      }
    }
  }

  end(): void {
    if (this.originals.size || this.created.size) {
      this.history.record({ add: [...this.created.values()], remove: [...this.originals.values()] });
    }
    this.originals.clear();
    this.created.clear();
    this.last = null;
  }
}
