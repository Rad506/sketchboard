import { describe, it, expect, vi } from 'vitest';
import { BoardDoc } from '../../src/core/board';
import type { StrokeObj } from '../../src/core/types';

const stroke = (id: string, x0: number, y0: number, x1: number, y1: number): StrokeObj => ({
  id, createdAt: 0, kind: 'stroke', pen: 'ink', color: '#000', size: 2,
  points: [[x0, y0, 0.5], [x1, y1, 0.5]],
  bbox: { minX: x0, minY: y0, maxX: x1, maxY: y1 },
});

describe('BoardDoc', () => {
  it('query returns only objects whose bbox intersects', () => {
    const d = new BoardDoc();
    d.add(stroke('a', 0, 0, 10, 10));
    d.add(stroke('b', 1000, 1000, 1010, 1010));
    const r = d.query({ minX: -5, minY: -5, maxX: 20, maxY: 20 });
    expect(r.map((o) => o.id)).toEqual(['a']);
  });
  it('returns a multi-cell object once', () => {
    const d = new BoardDoc();
    d.add(stroke('wide', 0, 0, 1000, 10));
    expect(d.query({ minX: 0, minY: 0, maxX: 2000, maxY: 2000 })).toHaveLength(1);
  });
  it('remove drops from query', () => {
    const d = new BoardDoc();
    d.add(stroke('a', 0, 0, 10, 10));
    d.remove('a');
    expect(d.query({ minX: -5, minY: -5, maxX: 20, maxY: 20 })).toEqual([]);
    expect(d.get('a')).toBeUndefined();
    expect(d.all()).toEqual([]);
  });
  it('onChange fires with added and removed', () => {
    const d = new BoardDoc();
    const cb = vi.fn();
    d.onChange(cb);
    const a = stroke('a', 0, 0, 10, 10);
    d.add(a);
    d.remove('a');
    expect(cb).toHaveBeenNthCalledWith(1, [a], []);
    expect(cb).toHaveBeenNthCalledWith(2, [], ['a']);
  });

  it('ignores (and warns about) objects with a non-finite or absurdly large bbox', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const d = new BoardDoc();
    const cb = vi.fn();
    d.onChange(cb);
    d.add(stroke('nan', 0, 0, NaN, 10));
    d.add(stroke('inf', 0, 0, Infinity, 10));
    expect(d.all()).toEqual([]);
    expect(cb).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalledTimes(2);
    warn.mockRestore();
  });

  it('huge objects (drawn while zoomed far out) are kept and found quickly', () => {
    const d = new BoardDoc();
    d.add(stroke('huge', 0, 0, 2e9, 10));
    d.add(stroke('hugeY', -6e8, -6e8, 6e8, 6e8));
    d.add(stroke('small', 5, 5, 20, 20));
    const t0 = performance.now();
    expect(d.query({ minX: 0, minY: 0, maxX: 30, maxY: 30 }).map((o) => o.id).sort()).toEqual(['huge', 'hugeY', 'small']);
    // a query box spanning billions of units (view zoomed far out) must not walk the grid cell by cell
    expect(d.query({ minX: -1e10, minY: -1e10, maxX: 1e10, maxY: 1e10 }).length).toBe(3);
    expect(performance.now() - t0).toBeLessThan(200);
    d.remove('huge');
    expect(d.query({ minX: 0, minY: 0, maxX: 30, maxY: 30 }).map((o) => o.id).sort()).toEqual(['hugeY', 'small']);
  });
});
