import { describe, it, expect } from 'vitest';
import { InputRouter, type RouterEvent } from '../../src/input/router';

let t = 0;
const ev = (
  type: RouterEvent['type'],
  pointerId: number,
  pointerType: string,
  x: number,
  y: number,
  pressure = 0.5,
  buttons = 1,
): RouterEvent => ({ type, pointerId, pointerType, x, y, pressure, buttons, t: ++t });

const mk = (fingerDraw = false) => new InputRouter({ fingerDraw: () => fingerDraw });

describe('InputRouter', () => {
  it('pen contact emits strokeStart/Move/End', () => {
    const r = mk();
    expect(r.handle(ev('pointerdown', 1, 'pen', 10, 10, 0.4))[0]).toMatchObject({ kind: 'strokeStart', x: 10, y: 10, p: 0.4 });
    expect(r.handle(ev('pointermove', 1, 'pen', 20, 20, 0.6))[0]).toMatchObject({ kind: 'strokeMove', x: 20, y: 20, p: 0.6 });
    expect(r.handle(ev('pointerup', 1, 'pen', 20, 20, 0, 0))[0]).toMatchObject({ kind: 'strokeEnd' });
  });

  it('touches are ignored while the pen tip is down', () => {
    const r = mk(true);
    r.handle(ev('pointerdown', 1, 'pen', 10, 10));
    expect(r.handle(ev('pointerdown', 2, 'touch', 50, 50))).toEqual([]);
    expect(r.handle(ev('pointermove', 2, 'touch', 60, 60))).toEqual([]);
    expect(r.handle(ev('pointerup', 2, 'touch', 60, 60, 0, 0))).toEqual([]);
    expect(r.handle(ev('pointermove', 1, 'pen', 12, 12))[0]).toMatchObject({ kind: 'strokeMove' });
  });

  it('two touches emit pan for midpoint movement and zoom for distance ratio', () => {
    const r = mk();
    expect(r.handle(ev('pointerdown', 1, 'touch', 100, 100))).toEqual([]);
    expect(r.handle(ev('pointerdown', 2, 'touch', 200, 100))).toEqual([]);
    // move first finger only: midpoint shifts and distance changes
    const a = r.handle(ev('pointermove', 1, 'touch', 110, 100));
    // after first finger moved: dist 90, mid 155 -> pan 5, zoom 0.9
    expect(a).toContainEqual({ kind: 'pan', dx: 5, dy: 0 });
    expect(a.find((x) => x.kind === 'zoom')).toMatchObject({ factor: 0.9 });
    const b = r.handle(ev('pointermove', 2, 'touch', 210, 100));
    expect(b).toContainEqual({ kind: 'pan', dx: 5, dy: 0 });
    expect(b.find((x) => x.kind === 'zoom')).toMatchObject({ cx: 160, cy: 100 });
    expect((b.find((x) => x.kind === 'zoom') as { factor: number }).factor).toBeCloseTo(100 / 90, 9);
  });

  it('one touch does nothing when fingerDraw is false', () => {
    const r = mk(false);
    expect(r.handle(ev('pointerdown', 1, 'touch', 10, 10))).toEqual([]);
    expect(r.handle(ev('pointermove', 1, 'touch', 30, 30))).toEqual([]);
    expect(r.handle(ev('pointerup', 1, 'touch', 30, 30, 0, 0))).toEqual([]);
  });

  it('fingerDraw: one touch draws; second finger landing emits strokeCancel then pan/zoom', () => {
    const r = mk(true);
    expect(r.handle(ev('pointerdown', 1, 'touch', 10, 10))[0]).toMatchObject({ kind: 'strokeStart', p: 0.5 });
    expect(r.handle(ev('pointermove', 1, 'touch', 20, 20))[0]).toMatchObject({ kind: 'strokeMove' });
    expect(r.handle(ev('pointerdown', 2, 'touch', 100, 20))).toEqual([{ kind: 'strokeCancel' }]);
    const m = r.handle(ev('pointermove', 2, 'touch', 120, 20));
    expect(m.map((a) => a.kind).sort()).toEqual(['pan', 'zoom']);
    // lift one finger: gesture ends, remaining finger does not draw
    r.handle(ev('pointerup', 2, 'touch', 120, 20, 0, 0));
    expect(r.handle(ev('pointermove', 1, 'touch', 40, 40))).toEqual([]);
  });

  it('pointercancel during pen stroke emits strokeEnd (keeps the stroke) and returns to idle', () => {
    const r = mk();
    r.handle(ev('pointerdown', 1, 'pen', 10, 10));
    expect(r.handle(ev('pointercancel', 1, 'pen', 10, 10, 0, 0))).toMatchObject([{ kind: 'strokeEnd' }]);
    expect(r.handle(ev('pointermove', 1, 'pen', 12, 12, 0, 0))).toMatchObject([{ kind: 'hover' }]);
  });

  it('pen hover emits hover action', () => {
    const r = mk();
    expect(r.handle(ev('pointermove', 1, 'pen', 5, 6, 0, 0))).toEqual([{ kind: 'hover', x: 5, y: 6 }]);
  });

  it('finger lifted while pen is down leaves no ghost touch (no phantom gesture)', () => {
    const r = mk();
    r.handle(ev('pointerdown', 2, 'touch', 50, 50));
    r.handle(ev('pointerdown', 1, 'pen', 10, 10));
    r.handle(ev('pointerup', 2, 'touch', 50, 50, 0, 0));
    r.handle(ev('pointerup', 1, 'pen', 10, 10, 0, 0));
    expect(r.handle(ev('pointerdown', 3, 'touch', 100, 100))).toEqual([]);
    expect(r.handle(ev('pointermove', 3, 'touch', 140, 100))).toEqual([]);
  });

  it('after a gesture ends, a new finger stays inert until all fingers lift', () => {
    const r = mk();
    r.handle(ev('pointerdown', 1, 'touch', 100, 100));
    r.handle(ev('pointerdown', 2, 'touch', 200, 100));
    expect(r.handle(ev('pointermove', 2, 'touch', 220, 100)).length).toBeGreaterThan(0);
    r.handle(ev('pointerup', 2, 'touch', 220, 100, 0, 0));
    expect(r.handle(ev('pointerdown', 3, 'touch', 300, 100))).toEqual([]);
    expect(r.handle(ev('pointermove', 3, 'touch', 340, 100))).toEqual([]);
    expect(r.handle(ev('pointermove', 1, 'touch', 120, 100))).toEqual([]);
    r.handle(ev('pointerup', 1, 'touch', 120, 100, 0, 0));
    r.handle(ev('pointerup', 3, 'touch', 340, 100, 0, 0));
    r.handle(ev('pointerdown', 4, 'touch', 100, 100));
    r.handle(ev('pointerdown', 5, 'touch', 200, 100));
    expect(r.handle(ev('pointermove', 5, 'touch', 220, 100)).length).toBeGreaterThan(0);
  });
});
