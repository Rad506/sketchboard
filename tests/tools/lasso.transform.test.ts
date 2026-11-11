import { describe, expect, it } from 'vitest';
import { bboxOf } from '../../src/core/geometry';
import type { BoardObject, StrokeObj, ShapeObj, ArrowObj, TextObj } from '../../src/core/types';
import {
  handlePoints,
  hitHandle,
  screenBox,
  transformFor,
  transformObject,
  type Transform,
} from '../../src/tools/lasso';

const box = (minX: number, minY: number, maxX: number, maxY: number) => ({ minX, minY, maxX, maxY });
const withBox = <T extends { kind: string }>(o: T): T & { bbox: ReturnType<typeof box> } =>
  ({ ...o, bbox: bboxOf(o as never) }) as never;

describe('screenBox', () => {
  it('converts world to screen and pads by 8', () => {
    expect(screenBox(box(110, 10, 120, 20), { x: 100, y: 0, zoom: 2 })).toEqual(box(12, 12, 48, 48));
  });
});

describe('hitHandle', () => {
  const b = box(0, 0, 200, 200);
  it('priorities and regions', () => {
    expect(hitHandle(b, 2, 2)).toBe('nw');
    expect(hitHandle(b, 100, 1)).toBe('n');
    expect(hitHandle(b, 100, 100)).toBe('move');
    expect(hitHandle(b, 60, 140)).toBe('inside');
    expect(hitHandle(b, 300, 300)).toBeNull();
  });
  it('corner beats side when overlapping', () => {
    const b88 = box(0, 0, 88, 88); // nw (0,0) and n (44,0) both within 22 of (22,0)
    expect(hitHandle(b88, 22, 0)).toBe('nw');
  });
  it('side beats move when overlapping', () => {
    const b88 = box(0, 0, 88, 88); // n (44,0) and move (44,44) both within 22 of (44,22)
    expect(hitHandle(b88, 44, 22)).toBe('n');
  });
  it.each(['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w', 'move'] as const)('hits %s at its centre', (h) => {
    const b = box(0, 0, 200, 200);
    const [x, y] = handlePoints(b)[h];
    expect(hitHandle(b, x, y)).toBe(h);
  });
  it('hides sides when narrow', () => {
    const r = hitHandle(box(0, 0, 80, 200), 0, 100);
    expect(r === 'inside' || r === null).toBe(true);
    expect(r).not.toBe('w');
  });
  it('follows the viewport via screenBox', () => {
    const world = box(0, 0, 100, 100);
    const a = screenBox(world, { x: 0, y: 0, zoom: 2 });
    const c = screenBox(world, { x: 50, y: 0, zoom: 2 });
    expect(hitHandle(a, a.minX, a.minY)).toBe('nw');
    expect(hitHandle(c, c.minX, c.minY)).toBe('nw');
    expect(hitHandle(c, a.minX, a.minY)).not.toBe('nw');
  });
});

describe('transformFor', () => {
  const start = box(0, 0, 100, 50);
  it('move', () => {
    expect(transformFor('move', start, [0, 0], [30, -10])).toMatchObject({ sx: 1, sy: 1, dx: 30, dy: -10 });
  });
  it('se corner uniform', () => {
    const t = transformFor('se', start, [100, 50], [200, 100]);
    expect(t).toMatchObject({ uniform: true, sx: 2, sy: 2, ax: 0, ay: 0, dx: 0, dy: 0 });
  });
  it('clamps and never flips', () => {
    const t = transformFor('se', start, [100, 50], [-500, -500]);
    expect(t.sx).toBe(0.05);
    expect(t.sy).toBe(0.05);
  });
  it('e side', () => {
    const t = transformFor('e', start, [100, 25], [150, 25]);
    expect(t).toMatchObject({ sx: 1.5, sy: 1, uniform: false, ax: 0 });
  });
  it('w past the anchor', () => {
    expect(transformFor('w', start, [0, 25], [500, 25]).sx).toBe(0.05);
  });
  it.each([
    ['nw', [0, 0], [-100, -50], { ax: 100, ay: 50, sx: 2, sy: 2 }],
    ['ne', [100, 0], [200, -50], { ax: 0, ay: 50, sx: 2, sy: 2 }],
    ['sw', [0, 50], [-100, 100], { ax: 100, ay: 0, sx: 2, sy: 2 }],
    ['se', [100, 50], [200, 100], { ax: 0, ay: 0, sx: 2, sy: 2 }],
  ] as const)('corner %s anchors opposite and scales uniformly', (h, from, to, want) => {
    expect(transformFor(h, start, [...from], [...to])).toMatchObject({ ...want, uniform: true });
  });
  it.each([
    ['w', [0, 25], [-100, 25], { ax: 100, sx: 2, sy: 1 }],
    ['e', [100, 25], [150, 25], { ax: 0, sx: 1.5, sy: 1 }],
    ['n', [50, 0], [50, -50], { ay: 50, sx: 1, sy: 2 }],
    ['s', [50, 50], [50, 100], { ay: 0, sx: 1, sy: 2 }],
  ] as const)('side %s stretches one axis', (h, from, to, want) => {
    expect(transformFor(h, start, [...from], [...to])).toMatchObject({ ...want, uniform: false });
  });
});

describe('transformObject', () => {
  const stretch: Transform = { ax: 0, ay: 0, sx: 2, sy: 3, dx: 0, dy: 0, uniform: false };
  const uni: Transform = { ax: 0, ay: 0, sx: 2, sy: 2, dx: 10, dy: 0, uniform: true };
  const stroke: StrokeObj = withBox({
    id: 's', createdAt: 5, kind: 'stroke' as const, pen: 'pen' as never, color: '#fff', size: 4,
    points: [[1, 1, 0.5], [3, 2, 0.7]] as [number, number, number][],
  });
  it('stroke', () => {
    const u = transformObject(stroke, uni) as StrokeObj;
    expect(u.points).toEqual([[12, 2, 0.5], [16, 4, 0.7]]);
    expect(u.size).toBe(8);
    const s = transformObject(stroke, stretch) as StrokeObj;
    expect(s.size).toBe(4);
    expect(stroke.points[0]).toEqual([1, 1, 0.5]); // no mutation
    expect(u.id).toBe('s');
    expect(u.createdAt).toBe(5);
    expect(u.bbox).toEqual(bboxOf({ ...u, bbox: undefined } as never));
  });
  it('ellipse', () => {
    const e: ShapeObj = withBox({
      id: 'e', createdAt: 1, kind: 'shape' as const, shape: 'ellipse' as const, pen: 'pen' as never,
      color: '#fff', size: 2, ellipse: { cx: 10, cy: 10, rx: 5, ry: 4 },
    });
    const r = transformObject(e, stretch) as ShapeObj;
    expect(r.ellipse).toEqual({ cx: 20, cy: 30, rx: 10, ry: 12 });
    expect(r.bbox).toEqual(bboxOf({ ...r, bbox: undefined } as never));
  });
  it('rect vertices', () => {
    const rect: ShapeObj = withBox({
      id: 'r', createdAt: 1, kind: 'shape' as const, shape: 'rect' as const, pen: 'pen' as never,
      color: '#fff', size: 2, vertices: [[0, 0], [10, 0], [10, 5], [0, 5]] as [number, number][],
    });
    const r = transformObject(rect, stretch) as ShapeObj;
    expect(r.vertices).toEqual([[0, 0], [20, 0], [20, 15], [0, 15]]);
  });
  it('arrow', () => {
    const a: ArrowObj = withBox({
      id: 'a', createdAt: 1, kind: 'arrow' as const, pen: 'pen' as never, color: '#fff', size: 2,
      from: [1, 1] as [number, number], to: [4, 2] as [number, number],
    });
    const r = transformObject(a, stretch) as ArrowObj;
    expect(r.from).toEqual([2, 3]);
    expect(r.to).toEqual([8, 6]);
    expect(r.bbox).toEqual(bboxOf({ ...r, bbox: undefined } as never));
  });
  it('text', () => {
    const t: TextObj = withBox({
      id: 't', createdAt: 1, kind: 'text' as const, x: 5, y: 5, text: 'hi', color: '#fff', fontSize: 20,
    });
    const u = transformObject(t, uni) as TextObj;
    expect([u.x, u.y, u.fontSize]).toEqual([20, 10, 40]);
    expect((transformObject(t, stretch) as TextObj).fontSize).toBe(20);
    const big = transformObject(t, { ...uni, sx: 1000, sy: 1000 }) as TextObj;
    expect(big.fontSize).toBe(2000);
    const tiny = transformObject(t, { ...uni, sx: 0.05, sy: 0.05 }) as TextObj;
    expect(tiny.fontSize).toBe(4);
    expect(u.bbox).toEqual(bboxOf({ ...u, bbox: undefined } as never));
  });
  it('type check helper', () => {
    const o: BoardObject = stroke;
    expect(o.kind).toBe('stroke');
  });
});
