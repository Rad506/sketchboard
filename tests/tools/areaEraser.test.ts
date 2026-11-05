import { describe, it, expect } from 'vitest';
import { BoardDoc } from '../../src/core/board';
import { History } from '../../src/core/history';
import { bboxOf } from '../../src/core/geometry';
import { cutPoints, toStrokes, AreaEraseSession } from '../../src/tools/areaEraser';
import type { Pt, StrokeObj, ShapeObj, TextObj } from '../../src/core/types';

const stroke = (id: string, pts: Pt[], pen: StrokeObj['pen'] = 'ink', createdAt = 7): StrokeObj => {
  const base = { id, createdAt, kind: 'stroke' as const, pen, color: '#123456', size: 2, points: pts };
  return { ...base, bbox: bboxOf(base) };
};
const docWith = (...os: (StrokeObj | ShapeObj | TextObj)[]) => { const d = new BoardDoc(); os.forEach((o) => d.add(o)); return d; };

describe('cutPoints', () => {
  it('cutting the middle of a straight stroke yields two pieces whose new endpoints lie on the circle', () => {
    const pieces = cutPoints([[0, 0, 1], [100, 0, 1]], 50, 0, 10);
    expect(pieces).toHaveLength(2);
    expect(Math.hypot(pieces[0][pieces[0].length - 1][0] - 50, pieces[0][pieces[0].length - 1][1])).toBeCloseTo(10, 2);
    expect(Math.hypot(pieces[1][0][0] - 50, pieces[1][0][1])).toBeCloseTo(10, 2);
  });
  it('pieces keep original pressure values; boundary pressure is interpolated', () => {
    const pieces = cutPoints([[0, 0, 0.2], [100, 0, 0.8]], 50, 0, 10);
    expect(pieces[0][0][2]).toBe(0.2);
    expect(pieces[0][1][2]).toBeCloseTo(0.2 + 0.6 * 0.4, 5);
    expect(pieces[1][0][2]).toBeCloseTo(0.2 + 0.6 * 0.6, 5);
    expect(pieces[1][1][2]).toBe(0.8);
  });
  it('a stroke fully inside the circle yields no pieces', () => {
    expect(cutPoints([[0, 0, 1], [1, 1, 1]], 0, 0, 10)).toEqual([]);
  });
  it('fragments under 2 points are dropped', () => {
    // endpoint (0,0) is outside, but the cut leaves just the boundary point -> dropped? piece [a, boundary] is 2 pts.
    // Here the tail pokes out: only the exit boundary point exists after the circle, so one lone point is impossible
    // unless it is the sole point: a single-point stroke outside stays 1 point and is dropped.
    expect(cutPoints([[50, 50, 1]], 0, 0, 10)).toEqual([]);
    const pieces = cutPoints([[0, 0, 1], [5, 0, 1], [30, 0, 1]], 0, 0, 10);
    for (const p of pieces) expect(p.length).toBeGreaterThanOrEqual(2);
  });
});

describe('toStrokes', () => {
  it('converts a shape to strokes with pressure 0.5 and same style', () => {
    const base = { id: 's', createdAt: 3, kind: 'shape' as const, shape: 'rect' as const, pen: 'felt' as const, color: '#abc', size: 5, vertices: [[0, 0], [10, 0], [10, 10], [0, 10]] as [number, number][] };
    const out = toStrokes({ ...base, bbox: bboxOf(base) });
    expect(out).toHaveLength(1);
    expect(out[0].points).toHaveLength(5);
    expect(out[0].points.every((p) => p[2] === 0.5)).toBe(true);
    expect(out[0].pen).toBe('felt');
    expect(out[0].size).toBe(5);
  });
});

describe('AreaEraseSession', () => {
  it('a circle shape cut once becomes stroke pieces; untouched shapes stay shapes', () => {
    const base = { id: 'c', createdAt: 1, kind: 'shape' as const, shape: 'ellipse' as const, pen: 'ink' as const, color: '#000', size: 2, ellipse: { cx: 0, cy: 0, rx: 50, ry: 50 } };
    const far = { id: 'f', createdAt: 1, kind: 'shape' as const, shape: 'ellipse' as const, pen: 'ink' as const, color: '#000', size: 2, ellipse: { cx: 500, cy: 500, rx: 20, ry: 20 } };
    const doc = docWith({ ...base, bbox: bboxOf(base) }, { ...far, bbox: bboxOf(far) });
    const s = new AreaEraseSession(doc, new History(doc));
    s.move(50, 0, 8);
    s.end();
    expect(doc.get('c')).toBeUndefined();
    expect(doc.get('f')?.kind).toBe('shape');
    const strokes = doc.all().filter((o) => o.kind === 'stroke');
    expect(strokes.length).toBeGreaterThanOrEqual(1);
  });
  it('text objects are untouched', () => {
    const t: TextObj = { id: 't', createdAt: 0, kind: 'text', x: 0, y: 0, text: 'hi', fontSize: 24, color: '#000', bbox: { minX: 0, minY: 0, maxX: 30, maxY: 30 } };
    const doc = docWith(t);
    const h = new History(doc);
    const s = new AreaEraseSession(doc, h);
    s.move(10, 10, 20);
    s.end();
    expect(doc.get('t')).toBeDefined();
    expect(h.canUndo()).toBe(false);
  });
  it('highlighter strokes are cut like others and keep createdAt/pen/color/size', () => {
    const doc = docWith(stroke('h', [[0, 0, 1], [100, 0, 1]], 'highlighter', 42));
    const s = new AreaEraseSession(doc, new History(doc));
    s.move(50, 0, 10);
    s.end();
    const all = doc.all() as StrokeObj[];
    expect(all).toHaveLength(2);
    for (const p of all) {
      expect(p.pen).toBe('highlighter');
      expect(p.createdAt).toBe(42);
      expect(p.color).toBe('#123456');
      expect(p.id).not.toBe('h');
    }
  });
  it('one session is one undo step and nets out intermediate pieces', () => {
    const orig = stroke('a', [[0, 0, 1], [200, 0, 1]]);
    const doc = docWith(orig);
    const h = new History(doc);
    const s = new AreaEraseSession(doc, h);
    s.move(50, 0, 10);
    s.move(100, 0, 10);
    s.move(150, 0, 10);
    s.end();
    expect(doc.all().length).toBe(2);
    expect(h.undo()).toBe(true);
    expect(doc.all().map((o) => o.id)).toEqual(['a']);
    expect(h.canUndo()).toBe(false);
    expect(h.redo()).toBe(true);
    expect(doc.all().length).toBe(2);
  });
  it('a fast swipe across a line still cuts it', () => {
    const doc = docWith(stroke('a', [[0, 0, 1], [200, 0, 1]]));
    const s = new AreaEraseSession(doc, new History(doc));
    s.move(100, -80, 10);
    s.move(100, 80, 10);
    s.end();
    expect(doc.all()).toHaveLength(2);
  });
  it('no empty undo step when nothing was hit', () => {
    const doc = docWith(stroke('a', [[0, 0, 1], [10, 0, 1]]));
    const h = new History(doc);
    const s = new AreaEraseSession(doc, h);
    s.move(500, 500, 10);
    s.end();
    expect(h.canUndo()).toBe(false);
  });
});
