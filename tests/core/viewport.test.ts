import { describe, it, expect } from 'vitest';
import { toScreen, toWorld, zoomAt, panBy, fitTo } from '../../src/core/viewport';

describe('viewport', () => {
  it('toWorld(toScreen(p)) round-trips', () => {
    const vp = { x: 120.5, y: -40, zoom: 2.5 };
    const [sx, sy] = toScreen(vp, 33, 77);
    const [wx, wy] = toWorld(vp, sx, sy);
    expect(wx).toBeCloseTo(33, 9);
    expect(wy).toBeCloseTo(77, 9);
  });

  it('zoomAt keeps the pinch point fixed', () => {
    const vp = { x: 10, y: 20, zoom: 1 };
    const before = toWorld(vp, 300, 200);
    const next = zoomAt(vp, 300, 200, 2);
    expect(next.zoom).toBe(2);
    const after = toWorld(next, 300, 200);
    expect(after[0]).toBeCloseTo(before[0], 9);
    expect(after[1]).toBeCloseTo(before[1], 9);
  });

  it('zoomAt clamps in at 8 but lets you zoom out practically forever', () => {
    const vp = { x: 0, y: 0, zoom: 1 };
    expect(zoomAt(vp, 0, 0, 1000).zoom).toBe(8);
    expect(zoomAt(vp, 0, 0, 0.0001).zoom).toBeCloseTo(0.0001, 12);
    let z = vp;
    for (let i = 0; i < 40; i++) z = zoomAt(z, 0, 0, 0.5);
    expect(z.zoom).toBeGreaterThan(0);
    expect(Number.isFinite(z.zoom)).toBe(true);
  });

  it('panBy moves the view by screen delta', () => {
    const vp = panBy({ x: 0, y: 0, zoom: 2 }, 100, 50);
    expect(vp.x).toBe(-50);
    expect(vp.y).toBe(-25);
  });

  it('fitTo centres the bbox with margin', () => {
    const vp = fitTo({ minX: 0, minY: 0, maxX: 100, maxY: 50 }, 400, 400, 50);
    expect(vp.zoom).toBe(3); // (400-100)/100
    const [cx, cy] = toScreen(vp, 50, 25);
    expect(cx).toBeCloseTo(200, 9);
    expect(cy).toBeCloseTo(200, 9);
    const [lx] = toScreen(vp, 0, 0);
    expect(lx).toBeCloseTo(50, 9);
  });

  it('toWorld stays accurate at x=1e6', () => {
    const vp = { x: 1e6, y: 1e6, zoom: 3.7 };
    const wx = 1e6 + 123.456;
    const [sx] = toScreen(vp, wx, 0);
    const [back] = toWorld(vp, sx, 0);
    expect(Math.abs(back - wx) / wx).toBeLessThan(1e-6);
  });
});
