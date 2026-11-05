import type { PenSample } from './sideButton';

export type RouterEvent = PenSample & { x: number; y: number };

export type RouterAction =
  | { kind: 'strokeStart' | 'strokeMove' | 'strokeEnd'; x: number; y: number; p: number; t: number }
  | { kind: 'strokeCancel' }
  | { kind: 'hover'; x: number; y: number }
  | { kind: 'pan'; dx: number; dy: number }
  | { kind: 'zoom'; cx: number; cy: number; factor: number };

type Pt = { x: number; y: number };
type Mode = 'idle' | 'pending' | 'touchDraw' | 'gesture' | 'dead';

/**
 * Turns raw pointer samples (screen px) into drawing / navigation actions.
 * Pen (and mouse, for desktop testing) draw; touch pans/zooms with two fingers,
 * or draws with one finger when fingerDraw is on. Conversion to world coords is the caller's job.
 */
export class InputRouter {
  private penId: number | null = null;
  private touches = new Map<number, Pt>();
  private mode: Mode = 'idle';
  private touchDrawId: number | null = null;
  /** Last pen sample of the active stroke, so it can be ended where it was if the pen never reports up. */
  private lastPen: { x: number; y: number; p: number; t: number } | null = null;

  constructor(private opts: { fingerDraw: () => boolean }) {}

  handle(e: RouterEvent): RouterAction[] {
    if (e.pointerType === 'touch') return this.touch(e);
    if (e.pointerType === 'pen' || e.pointerType === 'mouse') return this.pen(e);
    return [];
  }

  private pressureOf(e: RouterEvent): number {
    return e.pointerType === 'mouse' ? 0.5 : e.pressure;
  }

  private contact(e: RouterEvent): boolean {
    return e.pointerType === 'mouse' ? (e.buttons & 1) === 1 : e.pressure > 0;
  }

  private act(kind: 'strokeStart' | 'strokeMove' | 'strokeEnd', e: RouterEvent): RouterAction {
    return { kind, x: e.x, y: e.y, p: this.pressureOf(e), t: e.t };
  }

  /** Close whatever is open (app hidden without a pointercancel): end the pen stroke / cancel a finger stroke, forget all pointers. */
  reset(): RouterAction[] {
    const out: RouterAction[] = [];
    if (this.penId !== null && this.lastPen) out.push({ kind: 'strokeEnd', ...this.lastPen });
    else if (this.mode === 'touchDraw') out.push({ kind: 'strokeCancel' });
    this.penId = null;
    this.lastPen = null;
    this.touches.clear();
    this.touchDrawId = null;
    this.mode = 'idle';
    return out;
  }

  private pen(e: RouterEvent): RouterAction[] {
    const out: RouterAction[] = [];
    const active = this.penId !== null;
    const mine = this.penId === e.pointerId;

    if (e.type === 'pointerup' || e.type === 'pointercancel') {
      if (mine) {
        this.penId = null;
        this.lastPen = null;
        out.push({ kind: 'strokeEnd', x: e.x, y: e.y, p: this.pressureOf(e) || 0, t: e.t });
      }
      return out;
    }
    if (e.type === 'pointerleave') return out;

    if (mine) {
      if (e.type === 'pointermove' && this.contact(e)) {
        out.push(this.act('strokeMove', e));
        this.lastPen = { x: e.x, y: e.y, p: this.pressureOf(e), t: e.t };
        this.lastPen = { x: e.x, y: e.y, p: this.pressureOf(e), t: e.t };
      }
      return out;
    }
    if (active) {
      // a different pen pointer touching down means the old stroke lost its pointerup: close it, then start the new one
      if (!(e.type === 'pointerdown' && this.contact(e)) || !this.lastPen) return out;
      out.push({ kind: 'strokeEnd', ...this.lastPen });
      this.penId = null;
      this.lastPen = null;
    }

    if (this.contact(e)) {
      if (e.type === 'pointerdown' || e.type === 'pointermove') {
        if (this.mode === 'touchDraw') out.push({ kind: 'strokeCancel' });
        this.mode = this.touches.size ? 'dead' : 'idle';
        this.touchDrawId = null;
        this.penId = e.pointerId;
        out.push(this.act('strokeStart', e));
        this.lastPen = { x: e.x, y: e.y, p: this.pressureOf(e), t: e.t };
      }
    } else {
      out.push({ kind: 'hover', x: e.x, y: e.y });
    }
    return out;
  }

  private touch(e: RouterEvent): RouterAction[] {
    const out: RouterAction[] = [];
    const id = e.pointerId;
    if (this.penId !== null) {
      // pen is down: ignore touches, but keep bookkeeping so no ghost fingers remain
      if (e.type === 'pointerup' || e.type === 'pointercancel') this.touches.delete(id);
      return out;
    }

    if (e.type === 'pointerdown') {
      this.touches.set(id, { x: e.x, y: e.y });
      if (this.touches.size === 1) {
        if (this.opts.fingerDraw()) {
          this.mode = 'touchDraw';
          this.touchDrawId = id;
          out.push({ kind: 'strokeStart', x: e.x, y: e.y, p: 0.5, t: e.t });
        } else {
          this.mode = 'pending';
        }
      } else if (this.touches.size === 2 && (this.mode === 'pending' || this.mode === 'touchDraw')) {
        if (this.mode === 'touchDraw') out.push({ kind: 'strokeCancel' });
        this.touchDrawId = null;
        this.mode = 'gesture';
      } else {
        this.mode = 'dead'; // 3+ fingers or post-gesture: inert until all lift
      }
      return out;
    }

    if (e.type === 'pointermove') {
      const prev = this.touches.get(id);
      if (!prev) return out;
      if (this.mode === 'touchDraw' && id === this.touchDrawId) {
        this.touches.set(id, { x: e.x, y: e.y });
        out.push({ kind: 'strokeMove', x: e.x, y: e.y, p: 0.5, t: e.t });
      } else if (this.mode === 'gesture' && this.touches.size === 2) {
        const before = this.geometry();
        this.touches.set(id, { x: e.x, y: e.y });
        const after = this.geometry();
        const dx = after.mx - before.mx;
        const dy = after.my - before.my;
        if (dx !== 0 || dy !== 0) out.push({ kind: 'pan', dx, dy });
        const factor = before.dist > 0 ? after.dist / before.dist : 1;
        if (factor !== 1 && Number.isFinite(factor)) {
          out.push({ kind: 'zoom', cx: after.mx, cy: after.my, factor });
        }
      } else {
        this.touches.set(id, { x: e.x, y: e.y });
      }
      return out;
    }

    if (e.type === 'pointerup' || e.type === 'pointercancel') {
      if (!this.touches.has(id)) return out;
      this.touches.delete(id);
      if (this.mode === 'touchDraw' && id === this.touchDrawId) {
        this.touchDrawId = null;
        out.push(
          e.type === 'pointerup'
            ? { kind: 'strokeEnd', x: e.x, y: e.y, p: 0.5, t: e.t }
            : { kind: 'strokeCancel' },
        );
        this.mode = 'idle';
      } else if (this.mode === 'gesture') {
        this.mode = 'dead'; // remaining finger does nothing until all lift
      }
      if (this.touches.size === 0) this.mode = 'idle';
    }
    return out;
  }

  private geometry(): { mx: number; my: number; dist: number } {
    const [a, b] = [...this.touches.values()];
    return { mx: (a.x + b.x) / 2, my: (a.y + b.y) / 2, dist: Math.hypot(a.x - b.x, a.y - b.y) };
  }
}
