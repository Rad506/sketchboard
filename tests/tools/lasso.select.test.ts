import { describe, it, expect } from 'vitest';
import { BoardDoc } from '../../src/core/board';
import { bboxOf } from '../../src/core/geometry';
import { pointInPolygon, selectInLasso, selectionBounds, type Pt2 } from '../../src/tools/lasso';
import type { Pt, StrokeObj, ShapeObj, ArrowObj, TextObj } from '../../src/core/types';

const stroke = (id: string, pts: Pt[]): StrokeObj => {
  const base = { id, createdAt: 1, kind: 'stroke' as const, pen: 'ink' as const, color: '#000', size: 2, points: pts };
  return { ...base, bbox: bboxOf(base) };
};
const text = (id: string, x: number, y: number): TextObj => {
  const base = { id, createdAt: 1, kind: 'text' as const, x, y, text: 'Hello world', color: '#000', fontSize: 20 };
  return { ...base, bbox: bboxOf(base) };
};
const ellipse = (id: string, cx: number, cy: number, rx: number, ry: number): ShapeObj => {
  const base = { id, createdAt: 1, kind: 'shape' as const, shape: 'ellipse' as const, pen: 'ink' as const, color: '#000', size: 2, ellipse: { cx, cy, rx, ry } };
  return { ...base, bbox: bboxOf(base) };
};
const arrow = (id: string, from: Pt2, to: Pt2): ArrowObj => {
  const base = { id, createdAt: 1, kind: 'arrow' as const, from, to, pen: 'ink' as const, color: '#000', size: 2 };
  return { ...base, bbox: bboxOf(base) };
};
const rect = (x0: number, y0: number, x1: number, y1: number): Pt2[] => [[x0, y0], [x1, y0], [x1, y1], [x0, y1]];
const docWith = (...os: (StrokeObj | ShapeObj | ArrowObj | TextObj)[]) => { const d = new BoardDoc(); os.forEach((o) => d.add(o)); return d; };
const row = (n: number, inside: number): Pt[] => Array.from({ length: n }, (_, i) => [i < inside ? 10 + i : 500 + i, 50, 0.5] as Pt);

describe('pointInPolygon', () => {
  it('square: centre true, outside false', () => {
    const sq = rect(0, 0, 100, 100);
    expect(pointInPolygon(50, 50, sq)).toBe(true);
    expect(pointInPolygon(150, 50, sq)).toBe(false);
  });
  it('concave U: notch false, arm true', () => {
    const u: Pt2[] = [[0, 0], [30, 0], [30, 70], [70, 70], [70, 0], [100, 0], [100, 100], [0, 100]];
    expect(pointInPolygon(50, 30, u)).toBe(false);
    expect(pointInPolygon(15, 30, u)).toBe(true);
  });
  it('figure-8: both lobe centres true', () => {
    // self-crossing at (50,50); lobes left and right
    const bow: Pt2[] = [[0, 0], [100, 100], [100, 0], [0, 100]];
    expect(pointInPolygon(10, 50, bow)).toBe(true);
    expect(pointInPolygon(90, 50, bow)).toBe(true);
    expect(pointInPolygon(50, 10, bow)).toBe(false);
  });
});

describe('selectInLasso', () => {
  const loop = rect(0, 0, 200, 100);
  it('stroke with 7/10 inside selected, 5/10 not', () => {
    const d = docWith(stroke('a', row(10, 7)), stroke('b', row(10, 5)));
    // widen bbox so both are found by the query: row x up to 509
    expect(selectInLasso(d, loop, 1)).toEqual(['a']);
  });
  it('single-point stroke inside qualifies', () => {
    expect(selectInLasso(docWith(stroke('p', [[50, 50, 1]])), loop, 1)).toEqual(['p']);
  });
  it('text selected by bbox centre even if corners stick out', () => {
    const t = text('t', 130, 40); // bbox sticks out right of 200
    expect(t.bbox.maxX).toBeGreaterThan(200);
    const cx = (t.bbox.minX + t.bbox.maxX) / 2, cy = (t.bbox.minY + t.bbox.maxY) / 2;
    expect(pointInPolygon(cx, cy, loop)).toBe(true);
    expect(selectInLasso(docWith(t), loop, 1)).toEqual(['t']);
  });
  it('ellipse fully inside selected', () => {
    expect(selectInLasso(docWith(ellipse('e', 100, 50, 40, 30)), loop, 1)).toEqual(['e']);
  });
  it('arrow with only its to-end inside not selected', () => {
    expect(selectInLasso(docWith(arrow('ar', [500, 50], [190, 50])), loop, 1)).toEqual([]);
  });
  it('tiny loop 15x15 at zoom 1 -> [], at zoom 2 works', () => {
    const tiny = rect(0, 0, 15, 15);
    const d = docWith(stroke('s', [[5, 5, 1], [8, 8, 1]]));
    expect(selectInLasso(d, tiny, 1)).toEqual([]);
    expect(selectInLasso(d, tiny, 2)).toEqual(['s']);
  });
  it('fewer than 3 points -> []', () => {
    expect(selectInLasso(docWith(stroke('s', [[5, 5, 1]])), [[0, 0], [100, 100]], 1)).toEqual([]);
  });
  it('empty board -> []', () => {
    expect(selectInLasso(new BoardDoc(), loop, 1)).toEqual([]);
  });
});

describe('selectionBounds', () => {
  it('empty -> null; two objects -> union', () => {
    expect(selectionBounds([])).toBeNull();
    const a = stroke('a', [[0, 0, 1], [10, 10, 1]]);
    const b = stroke('b', [[50, -5, 1], [60, 20, 1]]);
    expect(selectionBounds([a, b])).toEqual({
      minX: Math.min(a.bbox.minX, b.bbox.minX), minY: Math.min(a.bbox.minY, b.bbox.minY),
      maxX: Math.max(a.bbox.maxX, b.bbox.maxX), maxY: Math.max(a.bbox.maxY, b.bbox.maxY),
    });
  });
});
