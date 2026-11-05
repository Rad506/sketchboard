import type { BoardDoc } from '../core/board';
import type { History } from '../core/history';
import type { BoardObject } from '../core/types';
import { outlineOf, segSegDist } from '../core/geometry';

/** Objects touched by the sweep segment (x0,y0)->(x1,y1) with tolerance `tolWorld`. */
export function hitObjectsSweep(
  doc: BoardDoc, x0: number, y0: number, x1: number, y1: number, tolWorld: number,
): BoardObject[] {
  const pad = tolWorld + 64;
  const cands = doc.query({
    minX: Math.min(x0, x1) - pad, minY: Math.min(y0, y1) - pad,
    maxX: Math.max(x0, x1) + pad, maxY: Math.max(y0, y1) + pad,
  });
  return cands.filter((o) => {
    if (o.kind === 'text') {
      const b = o.bbox;
      const inside = (x: number, y: number) =>
        x >= b.minX - tolWorld && x <= b.maxX + tolWorld && y >= b.minY - tolWorld && y <= b.maxY + tolWorld;
      if (inside(x0, y0) || inside(x1, y1)) return true;
    }
    const lim = tolWorld + (o.kind === 'text' ? 0 : o.size / 2);
    for (const line of outlineOf(o)) {
      if (line.length === 1) {
        if (segSegDist(x0, y0, x1, y1, line[0][0], line[0][1], line[0][0], line[0][1]) <= lim) return true;
      }
      for (let i = 0; i + 1 < line.length; i++) {
        const [ax, ay] = line[i], [bx, by] = line[i + 1];
        if (segSegDist(x0, y0, x1, y1, ax, ay, bx, by) <= lim) return true;
      }
    }
    return false;
  });
}

export function hitObjects(doc: BoardDoc, x: number, y: number, tolWorld: number): BoardObject[] {
  return hitObjectsSweep(doc, x, y, x, y, tolWorld);
}

export class StrokeEraseSession {
  private removed: BoardObject[] = [];
  private last: [number, number] | null = null;

  constructor(private doc: BoardDoc, private history: History) {}

  move(x: number, y: number, tolWorld: number): void {
    const [px, py] = this.last ?? [x, y];
    this.last = [x, y];
    for (const o of hitObjectsSweep(this.doc, px, py, x, y, tolWorld)) {
      this.doc.remove(o.id);
      this.removed.push(o);
    }
  }

  end(): void {
    if (this.removed.length) this.history.record({ add: [], remove: this.removed });
    this.removed = [];
    this.last = null;
  }
}
