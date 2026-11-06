import type { BBox, BoardObject } from './types';

const CELL = 256;
/** Objects or queries covering more grid cells than this skip the grid (drawn / viewed zoomed far out). */
const MAX_CELLS = 1024;

type Listener = (added: BoardObject[], removedIds: string[]) => void;

export class BoardDoc {
  private objs = new Map<string, BoardObject>();
  private grid = new Map<string, Set<string>>();
  private listeners: Listener[] = [];
  /** Objects too large for the grid; always checked by query(). */
  private big = new Set<string>();

  private cellCount(b: BBox): number {
    const w = Math.floor(b.maxX / CELL) - Math.floor(b.minX / CELL) + 1;
    const h = Math.floor(b.maxY / CELL) - Math.floor(b.minY / CELL) + 1;
    return w * h;
  }

  private cells(b: BBox): string[] {
    const out: string[] = [];
    const x0 = Math.floor(b.minX / CELL), x1 = Math.floor(b.maxX / CELL);
    const y0 = Math.floor(b.minY / CELL), y1 = Math.floor(b.maxY / CELL);
    for (let x = x0; x <= x1; x++) for (let y = y0; y <= y1; y++) out.push(x + ',' + y);
    return out;
  }

  add(o: BoardObject): void {
    const b = o.bbox;
    if (![b.minX, b.minY, b.maxX, b.maxY].every(Number.isFinite)) {
      console.warn('BoardDoc: ignoring object with invalid bbox', o.id);
      return;
    }
    if (this.objs.has(o.id)) this.detach(o.id);
    this.objs.set(o.id, o);
    if (this.cellCount(b) > MAX_CELLS) {
      this.big.add(o.id);
      for (const cb of this.listeners) cb([o], []);
      return;
    }
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
    if (this.big.delete(id)) {
      this.objs.delete(id);
      return true;
    }
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
    const hits = (ob: BBox) => ob.maxX >= b.minX && ob.minX <= b.maxX && ob.maxY >= b.minY && ob.minY <= b.maxY;
    // zoomed far out the view covers more cells than there are objects: just scan them all
    if (this.cellCount(b) > Math.max(MAX_CELLS, this.objs.size)) return this.all().filter((o) => hits(o.bbox));
    const seen = new Set<string>();
    const out: BoardObject[] = [];
    for (const id of this.big) {
      const o = this.objs.get(id)!;
      seen.add(id);
      if (hits(o.bbox)) out.push(o);
    }
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
