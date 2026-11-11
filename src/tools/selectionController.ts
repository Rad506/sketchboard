import type { BoardDoc } from '../core/board';
import type { Change } from '../core/history';
import type { BBox, BoardObject } from '../core/types';
import type { Viewport } from '../core/viewport';
import {
  hitHandle,
  screenBox,
  selectInLasso,
  selectionBounds,
  transformFor,
  transformObject,
  type Handle,
  type Pt2,
} from './lasso';

type State = 'idle' | 'lassoing' | 'selected' | 'dragging';

interface Drag {
  handle: Handle;
  startBounds: BBox;
  from: Pt2;
  originals: BoardObject[];
  last: Pt2;
}

/**
 * Lasso selection state machine. It never mutates the doc: a finished drag is
 * reported through onCommit and the caller applies it.
 */
export class SelectionController {
  private state: State = 'idle';
  private selected: string[] = [];
  private _loop: Pt2[] | null = null;
  private drag: Drag | null = null;
  private _preview: BoardObject[] = [];

  constructor(private doc: BoardDoc, private onCommit: (c: Change) => void) {}

  get active(): boolean {
    return (this.state === 'selected' || this.state === 'dragging') && this.ids.length > 0;
  }

  get busy(): boolean {
    return this.state === 'lassoing' || this.state === 'dragging';
  }

  get ids(): string[] {
    return this.selected.filter((id) => this.doc.get(id) !== undefined);
  }

  get hidden(): Set<string> {
    return this.state === 'dragging' && this.drag ? new Set(this.drag.originals.map((o) => o.id)) : new Set();
  }

  get preview(): BoardObject[] {
    return this.state === 'dragging' ? this._preview : [];
  }

  get loop(): Pt2[] | null {
    return this.state === 'lassoing' ? this._loop : null;
  }

  bounds(): BBox | null {
    if (this.state === 'dragging' && this._preview.length > 0) return selectionBounds(this._preview);
    return selectionBounds(this.currentObjects());
  }

  down(wx: number, wy: number, sx: number, sy: number, vp: Viewport): 'drag' | 'lasso' | 'ended' {
    if (this.state === 'selected' || this.state === 'dragging') {
      const b = this.active ? this.bounds() : null;
      const handle = b ? hitHandle(screenBox(b, vp), sx, sy) : null;
      if (b && handle) {
        const originals = this.currentObjects();
        this.state = 'dragging';
        this.drag = { handle, startBounds: b, from: [wx, wy], originals, last: [wx, wy] };
        this._preview = this.drag.originals;
        return 'drag';
      }
      if (b) {
        this.clear();
        return 'ended';
      }
    }
    this.selected = [];
    this.drag = null;
    this._preview = [];
    this._loop = [[wx, wy]];
    this.state = 'lassoing';
    return 'lasso';
  }

  move(wx: number, wy: number): void {
    if (this.state === 'lassoing' && this._loop) {
      this._loop.push([wx, wy]);
    } else if (this.state === 'dragging' && this.drag) {
      this.drag.last = [wx, wy];
      this._preview = this.mapped(this.drag);
    }
  }

  up(vp: Viewport): void {
    if (this.state === 'lassoing' && this._loop) {
      const ids = selectInLasso(this.doc, this._loop, vp.zoom);
      this.selected = ids;
      this._loop = null;
      this.state = ids.length > 0 ? 'selected' : 'idle';
    } else if (this.state === 'dragging' && this.drag) {
      const d = this.drag;
      const t = transformFor(d.handle, d.startBounds, d.from, d.last);
      const identity = t.sx === 1 && t.sy === 1 && t.dx === 0 && t.dy === 0;
      this.endDrag();
      if (!identity) {
        this.onCommit({ remove: d.originals, add: d.originals.map((o) => transformObject(o, t)) });
      }
    }
  }

  cancel(): void {
    if (this.state === 'lassoing') {
      this._loop = null;
      this.state = 'idle';
    } else if (this.state === 'dragging') {
      this.endDrag();
    }
  }

  clear(): void {
    this.state = 'idle';
    this.selected = [];
    this._loop = null;
    this.drag = null;
    this._preview = [];
  }

  hits(sx: number, sy: number, vp: Viewport): boolean {
    if (!this.active) return false;
    const b = this.bounds();
    return b !== null && hitHandle(screenBox(b, vp), sx, sy) !== null;
  }

  private endDrag(): void {
    this.drag = null;
    this._preview = [];
    this.state = 'selected';
  }

  private mapped(d: Drag): BoardObject[] {
    const t = transformFor(d.handle, d.startBounds, d.from, d.last);
    return d.originals.map((o) => transformObject(o, t));
  }

  private currentObjects(): BoardObject[] {
    if (this.state === 'dragging' && this.drag) return this.drag.originals;
    if (this.state !== 'selected') return [];
    return this.ids.map((id) => this.doc.get(id)).filter((o): o is BoardObject => o !== undefined);
  }
}
