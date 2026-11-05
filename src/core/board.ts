import type { BBox, BoardObject } from './types';

const CELL = 256;
/** Objects wider/taller than this can't be indexed sanely (a 1e7 span is ~1.5e9 grid cells). */
const MAX_SPAN = 1e7;

type Listener = (added: BoardObject[], removedIds: string[]) => void;

export class BoardDoc {
  private objs = new Map<string, BoardObject>();
  private grid = new Map<string, Set<string>>();
  private listeners: Listener[] = [];

  private cells(b: BBox): string[] {
    const out: string[] = [];
    const x0 = Math.floor(b.minX / CELL), x1 = Math.floor(b.maxX / CELL);
    const y0 = Math.floor(b.minY / CELL), y1 = Math.floor(b.maxY / CELL);
    for (let x = x0; x <= x1; x++) for (let y = y0; y <= y1; y++) out.push(x + ',' + y);
    return out;
  }

  add(o: BoardObject): void {
    const b = o.bbox;
    const span = Math.max(b.maxX - b.minX, b.maxY - b.minY);
    if (![b.minX, b.minY, b.maxX, b.maxY].every(Number.isFinite) || !(span <= MAX_SPAN)) {
      console.warn('BoardDoc: ignoring object with invalid bbox', o.id);
      return; // cells() would loop (near-)forever
    }
    if (this.objs.has(o.id)) this.detach(o.id);
    this.objs.set(o.id, o);
    for (const k of this.cells(o.bbox)) {
      let s = this.grid.get(k);
      if (!s) this.grid.set(k, (s = new Set()));
      s.add(o.id);
    }
    for (const cb of this.listeners) cb([o], []);
  }

  private detach(id: string): boolean {
    const o = this.objs.get(id);
    if (!o) return false;
    for (const k of this.cells(o.bbox)) {
      const s = this.grid.get(k);
      if (s) {
        s.delete(id);
        if (s.size === 0) this.grid.delete(k);
      }
    }
    this.objs.delete(id);
    return true;
  }

  remove(id: string): void {
    if (!this.detach(id)) return;
    for (const cb of this.listeners) cb([], [id]);
  }

  get(id: string): BoardObject | undefined {
    return this.objs.get(id);
  }

  all(): BoardObject[] {
    return [...this.objs.values()];
  }

  query(b: BBox): BoardObject[] {
    const seen = new Set<string>();
    const out: BoardObject[] = [];
    for (const k of this.cells(b)) {
      const s = this.grid.get(k);
      if (!s) continue;
      for (const id of s) {
        if (seen.has(id)) continue;
        seen.add(id);
        const o = this.objs.get(id)!;
        const ob = o.bbox;
        if (ob.maxX >= b.minX && ob.minX <= b.maxX && ob.maxY >= b.minY && ob.minY <= b.maxY) out.push(o);
      }
    }
    return out;
  }

  onChange(cb: Listener): void {
    this.listeners.push(cb);
  }
}
