import type { BBox, BoardObject } from './types';

const CELL = 256;

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
