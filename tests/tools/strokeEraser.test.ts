import { describe, it, expect } from 'vitest';
import { BoardDoc } from '../../src/core/board';
import { History } from '../../src/core/history';
import { bboxOf } from '../../src/core/geometry';
import { hitObjects, StrokeEraseSession } from '../../src/tools/strokeEraser';
import { segSegDist } from '../../src/core/geometry';
import type { BoardObject, StrokeObj, ShapeObj, ArrowObj, TextObj } from '../../src/core/types';

const stroke = (id: string, pts: [number, number][], size = 2): StrokeObj => {
  const base = { id, createdAt: 0, kind: 'stroke' as const, pen: 'ink' as const, color: '#000', size, points: pts.map(([x, y]) => [x, y, 0.5] as [number, number, number]) };
  return { ...base, bbox: bboxOf(base) };
};
const ids = (os: BoardObject[]) => os.map((o) => o.id).sort();
const docWith = (...os: BoardObject[]) => { const d = new BoardDoc(); os.forEach((o) => d.add(o)); return d; };

describe('segSegDist', () => {
  it('is 0 for crossing segments and gap for parallel ones', () => {
    expect(segSegDist(0, 0, 10, 10, 0, 10, 10, 0)).toBe(0);
    expect(segSegDist(0, 0, 10, 0, 0, 5, 10, 5)).toBe(5);
  });
});

describe('hitObjects', () => {
  const line = stroke('a', [[0, 0], [100, 0]]);
  it.each([1, 0.5])('hits a stroke within 6/zoom of its line at zoom %s', (z) => {
    const d = docWith(line);
    const tol = 6 / z;
    expect(ids(hitObjects(d, 50, tol - 0.01, tol))).toEqual(['a']);
  });
  it('misses beyond tolerance', () => {
    const d = docWith(line);
    expect(hitObjects(d, 50, 6 + 1 + 0.5, 6)).toEqual([]);
  });
  it('hits a single-point dot stroke', () => {
    const d = docWith(stroke('dot', [[20, 20]], 4));
    expect(ids(hitObjects(d, 22, 21, 6))).toEqual(['dot']);
    expect(hitObjects(d, 40, 40, 6)).toEqual([]);
  });
  it('hits arrow shafts and ellipse outlines but not the empty inside of a circle', () => {
    const arrowBase = { id: 'ar', createdAt: 0, kind: 'arrow' as const, from: [0, 0] as [number, number], to: [100, 0] as [number, number], pen: 'ink' as const, color: '#000', size: 2 };
    const arrow: ArrowObj = { ...arrowBase, bbox: bboxOf(arrowBase) };
    const eBase = { id: 'el', createdAt: 0, kind: 'shape' as const, shape: 'ellipse' as const, pen: 'ink' as const, color: '#000', size: 2, ellipse: { cx: 200, cy: 200, rx: 50, ry: 50 } };
    const ell: ShapeObj = { ...eBase, bbox: bboxOf(eBase) };
    const d = docWith(arrow, ell);
    expect(ids(hitObjects(d, 50, 3, 6))).toEqual(['ar']);
    expect(ids(hitObjects(d, 250, 200, 6))).toEqual(['el']);
    expect(hitObjects(d, 200, 200, 6)).toEqual([]);
  });
  it('hits text inside its box', () => {
    const tBase = { id: 't', createdAt: 0, kind: 'text' as const, x: 100, y: 100, text: 'hello', color: '#000', fontSize: 24 };
    const t: TextObj = { ...tBase, bbox: bboxOf(tBase) };
    const d = docWith(t);
    expect(ids(hitObjects(d, 120, 110, 6))).toEqual(['t']);
    expect(hitObjects(d, 300, 300, 6)).toEqual([]);
  });
  it('sweep hits a thin stroke crossed between two samples', () => {
    const d = docWith(stroke('v', [[50, -50], [50, 50]]));
    const s = new StrokeEraseSession(d, new History(d));
    s.move(0, 0, 6);
    expect(d.all().length).toBe(1);
    s.move(100, 0, 6);
    expect(d.all().length).toBe(0);
  });
});

describe('StrokeEraseSession', () => {
  it('one session = one undo step restoring all erased objects', () => {
    const d = docWith(stroke('a', [[0, 0], [10, 0]]), stroke('b', [[0, 50], [10, 50]]), stroke('keep', [[0, 500], [10, 500]]));
    const h = new History(d);
    const s = new StrokeEraseSession(d, h);
    s.move(5, 0, 6);
    expect(ids(d.all())).toEqual(['b', 'keep']);
    s.move(5, 50, 6);
    s.end();
    expect(ids(d.all())).toEqual(['keep']);
    expect(h.undo()).toBe(true);
    expect(ids(d.all())).toEqual(['a', 'b', 'keep']);
    expect(h.undo()).toBe(false);
  });
  it('a session with no hits records nothing', () => {
    const d = docWith(stroke('a', [[0, 0], [10, 0]]));
    const h = new History(d);
    const s = new StrokeEraseSession(d, h);
    s.move(500, 500, 6);
    s.end();
    expect(h.canUndo()).toBe(false);
  });
});
