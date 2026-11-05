import { describe, it, expect } from 'vitest';
import { distPointSeg, segCircle, bboxOf, outlineOf, newId } from '../../src/core/geometry';
import type { BoardObject } from '../../src/core/types';

describe('distPointSeg', () => {
  it('endpoint case', () => {
    expect(distPointSeg(-3, 4, 0, 0, 10, 0)).toBeCloseTo(5);
    expect(distPointSeg(13, 4, 0, 0, 10, 0)).toBeCloseTo(5);
  });
  it('perpendicular case', () => {
    expect(distPointSeg(5, 3, 0, 0, 10, 0)).toBeCloseTo(3);
  });
  it('degenerate segment', () => {
    expect(distPointSeg(3, 4, 0, 0, 0, 0)).toBeCloseTo(5);
  });
});

describe('segCircle', () => {
  it('two t values for a chord', () => {
    const ts = segCircle(-10, 0, 10, 0, 0, 0, 5);
    expect(ts).toHaveLength(2);
    expect(ts[0]).toBeCloseTo(0.25);
    expect(ts[1]).toBeCloseTo(0.75);
  });
  it('one t for a segment starting inside', () => {
    const ts = segCircle(0, 0, 10, 0, 0, 0, 5);
    expect(ts).toHaveLength(1);
    expect(ts[0]).toBeCloseTo(0.5);
  });
  it('none for a miss', () => {
    expect(segCircle(-10, 10, 10, 10, 0, 0, 5)).toEqual([]);
  });
});

describe('bboxOf', () => {
  it('includes half the stroke size', () => {
    const b = bboxOf({
      id: 'a', createdAt: 0, kind: 'stroke', pen: 'ink', color: '#000', size: 10,
      points: [[0, 0, 0.5], [100, 50, 0.5]],
    });
    expect(b).toEqual({ minX: -5, minY: -5, maxX: 105, maxY: 55 });
  });
  it('text bbox from font metrics', () => {
    const b = bboxOf({ id: 't', createdAt: 0, kind: 'text', x: 10, y: 20, text: 'ab\nabcd', color: '#000', fontSize: 10 });
    expect(b).toEqual({ minX: 10, minY: 20, maxX: 10 + 0.6 * 10 * 4, maxY: 20 + 10 * 1.2 * 2 });
  });
  it('arrow includes barbs', () => {
    const b = bboxOf({ id: 'r', createdAt: 0, kind: 'arrow', from: [0, 0], to: [100, 0], pen: 'ink', color: '#000', size: 3 });
    expect(b.minY).toBeLessThan(-1.5);
    expect(b.maxY).toBeGreaterThan(1.5);
  });
});

describe('outlineOf', () => {
  it('ellipse has 65 points (closed)', () => {
    const o: BoardObject = {
      id: 'e', createdAt: 0, kind: 'shape', shape: 'ellipse', pen: 'ink', color: '#000', size: 3,
      ellipse: { cx: 0, cy: 0, rx: 10, ry: 5 }, bbox: { minX: -10, minY: -5, maxX: 10, maxY: 5 },
    };
    const lines = outlineOf(o);
    expect(lines).toHaveLength(1);
    expect(lines[0]).toHaveLength(65);
    expect(lines[0][0]).toEqual(lines[0][64]);
  });
  it('arrow is shaft plus two barbs', () => {
    const lines = outlineOf({ id: 'r', createdAt: 0, kind: 'arrow', from: [0, 0], to: [100, 0], pen: 'ink', color: '#000', size: 3, bbox: { minX: 0, minY: 0, maxX: 0, maxY: 0 } });
    expect(lines).toHaveLength(3);
    const barb = lines[1];
    expect(Math.hypot(barb[1][0] - barb[0][0], barb[1][1] - barb[0][1])).toBeCloseTo(12);
  });
  it('text is its bbox rectangle, closed', () => {
    const lines = outlineOf({ id: 't', createdAt: 0, kind: 'text', x: 0, y: 0, text: 'a', color: '#000', fontSize: 10, bbox: { minX: 0, minY: 0, maxX: 6, maxY: 12 } });
    expect(lines).toHaveLength(1);
    expect(lines[0]).toHaveLength(5);
  });
});

describe('newId', () => {
  it('returns unique ids', () => {
    expect(newId()).not.toBe(newId());
  });
});
