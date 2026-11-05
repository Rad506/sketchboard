import { describe, it, expect, vi, beforeEach, afterEach, type Mock } from 'vitest';
import { BoardDoc } from '../../src/core/board';
import { History } from '../../src/core/history';
import { bboxOf } from '../../src/core/geometry';
import { SnapController, recognizedToObject, commitStroke } from '../../src/tools/snapController';
import type { Recognized } from '../../src/tools/recognize';
import type { StrokeObj } from '../../src/core/types';
import { noisyCircle, letterA } from './fixtures';

const circle = noisyCircle(1);
const last = circle[circle.length - 1];

let onPreview: Mock<(r: Recognized | null) => void>;
let sc: SnapController;
beforeEach(() => {
  vi.useFakeTimers();
  onPreview = vi.fn<(r: Recognized | null) => void>();
  sc = new SnapController(onPreview);
});
afterEach(() => vi.useRealTimers());

describe('SnapController', () => {
  it('500ms still within 6px calls recognize on the whole stroke and previews', () => {
    sc.sample(last[0], last[1], 0, circle);
    vi.advanceTimersByTime(499);
    expect(onPreview).not.toHaveBeenCalled();
    sc.sample(last[0] + 3, last[1] + 2, 300, circle); // jitter within 6px
    vi.advanceTimersByTime(1);
    expect(onPreview).toHaveBeenCalledTimes(1);
    expect(onPreview.mock.calls[0][0]?.shape).toBe('ellipse');
    expect(sc.current()?.shape).toBe('ellipse');
  });

  it('snaps from sample timestamps alone when 500ms elapsed between samples', () => {
    sc.sample(last[0], last[1], 0, circle);
    sc.sample(last[0] + 1, last[1], 520, circle);
    expect(sc.current()).not.toBeNull();
  });

  it('drift >6px restarts the timer', () => {
    sc.sample(last[0], last[1], 0, circle);
    vi.advanceTimersByTime(400);
    sc.sample(last[0] + 10, last[1], 400, circle);
    vi.advanceTimersByTime(400); // 800 from first, 400 from restart
    expect(onPreview).not.toHaveBeenCalled();
    vi.advanceTimersByTime(100);
    expect(onPreview).toHaveBeenCalledTimes(1);
  });

  it('moving >6px after a preview cancels it (onPreview(null)) and drawing continues', () => {
    sc.sample(last[0], last[1], 0, circle);
    vi.advanceTimersByTime(500);
    expect(sc.current()).not.toBeNull();
    sc.sample(last[0] + 20, last[1], 600, circle);
    expect(onPreview).toHaveBeenLastCalledWith(null);
    expect(sc.current()).toBeNull();
    vi.advanceTimersByTime(500); // restarted from the new position
    expect(onPreview).toHaveBeenCalledTimes(3);
  });

  it('no match → no preview', () => {
    const a = letterA.map(([x, y]) => [x, y] as [number, number]);
    const e = a[a.length - 1];
    sc.sample(e[0], e[1], 0, a);
    vi.advanceTimersByTime(600);
    expect(onPreview).not.toHaveBeenCalled();
    expect(sc.current()).toBeNull();
  });

  it("a lift without pause never snaps (a written 'O' stays a stroke)", () => {
    for (let i = 0; i < circle.length; i++) {
      sc.sample(circle[i][0] * 20, circle[i][1] * 20, i * 10, circle.slice(0, i + 1)); // fast, big moves
      vi.advanceTimersByTime(10);
    }
    sc.cancel();
    vi.advanceTimersByTime(2000);
    expect(onPreview).not.toHaveBeenCalled();
    expect(sc.current()).toBeNull();
  });
});

const raw = (pen: 'ink' | 'felt' | 'highlighter'): StrokeObj => {
  const base = { kind: 'stroke' as const, id: 'raw', createdAt: 1, pen, color: '#ffe14d', size: 24, points: [[0, 0, 1], [10, 10, 1]] as [number, number, number][] };
  return { ...base, bbox: bboxOf(base) };
};
const style = { pen: 'highlighter' as const, color: '#ffe14d', size: 24 };

describe('recognizedToObject', () => {
  it('keeps pen/color/size (highlighter circle stays highlighter)', () => {
    const o = recognizedToObject({ shape: 'ellipse', cx: 5, cy: 5, rx: 10, ry: 10 }, style);
    expect(o).toMatchObject({ kind: 'shape', shape: 'ellipse', pen: 'highlighter', color: '#ffe14d', size: 24 });
    expect(o.bbox.minX).toBeLessThan(-5);
    expect(o.id).toBeTruthy();
  });
  it('maps polygons and arrows', () => {
    const v: [number, number][] = [[0, 0], [10, 0]];
    expect(recognizedToObject({ shape: 'line', vertices: v }, style)).toMatchObject({ kind: 'shape', shape: 'line', vertices: v });
    const r: Recognized = { shape: 'arrow', from: [0, 0], to: [50, 0] };
    expect(recognizedToObject(r, style)).toMatchObject({ kind: 'arrow', from: [0, 0], to: [50, 0], pen: 'highlighter' });
  });
});

describe('commitStroke', () => {
  it('undo once restores the raw stroke, undo twice removes it', () => {
    const doc = new BoardDoc();
    const h = new History(doc);
    const r = raw('ink');
    const snapped = recognizedToObject({ shape: 'ellipse', cx: 5, cy: 5, rx: 10, ry: 10 }, style);
    commitStroke(h, r, snapped);
    expect(doc.all().map((o) => o.id)).toEqual([snapped.id]);
    h.undo();
    expect(doc.all().map((o) => o.id)).toEqual(['raw']);
    h.undo();
    expect(doc.all()).toEqual([]);
  });
  it('commits just the raw stroke when not snapped', () => {
    const doc = new BoardDoc();
    const h = new History(doc);
    commitStroke(h, raw('ink'), null);
    expect(doc.all().map((o) => o.id)).toEqual(['raw']);
    h.undo();
    expect(doc.all()).toEqual([]);
  });
});
