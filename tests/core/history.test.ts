import { describe, it, expect } from 'vitest';
import { BoardDoc } from '../../src/core/board';
import { History } from '../../src/core/history';
import type { StrokeObj } from '../../src/core/types';

const s = (id: string): StrokeObj => ({
  id, createdAt: 0, kind: 'stroke', pen: 'ink', color: '#000', size: 2,
  points: [[0, 0, 0.5], [5, 5, 0.5]], bbox: { minX: 0, minY: 0, maxX: 5, maxY: 5 },
});
const ids = (d: BoardDoc) => d.all().map((o) => o.id).sort();

describe('History', () => {
  it('undo reverts add+remove in one step', () => {
    const d = new BoardDoc();
    const a = s('a');
    d.add(a);
    const h = new History(d);
    h.apply({ add: [s('b')], remove: [a] });
    expect(ids(d)).toEqual(['b']);
    expect(h.undo()).toBe(true);
    expect(ids(d)).toEqual(['a']);
    expect(h.undo()).toBe(false);
  });
  it('redo reapplies', () => {
    const d = new BoardDoc();
    const h = new History(d);
    h.apply({ add: [s('a')], remove: [] });
    h.undo();
    expect(h.canRedo()).toBe(true);
    expect(h.redo()).toBe(true);
    expect(ids(d)).toEqual(['a']);
    expect(h.canRedo()).toBe(false);
  });
  it('101st apply drops the oldest', () => {
    const d = new BoardDoc();
    const h = new History(d);
    for (let i = 0; i < 101; i++) h.apply({ add: [s('o' + i)], remove: [] });
    let n = 0;
    while (h.undo()) n++;
    expect(n).toBe(100);
    expect(ids(d)).toEqual(['o0']);
  });
  it('apply after undo clears redo', () => {
    const d = new BoardDoc();
    const h = new History(d);
    h.apply({ add: [s('a')], remove: [] });
    h.undo();
    h.apply({ add: [s('b')], remove: [] });
    expect(h.canRedo()).toBe(false);
    expect(h.canUndo()).toBe(true);
  });
  it('record logs without mutating; undo reverts it', () => {
    const d = new BoardDoc();
    const a = s('a');
    d.add(a);
    const h = new History(d);
    d.remove('a');
    d.add(s('b'));
    h.record({ add: [s('b')], remove: [a] });
    expect(ids(d)).toEqual(['b']);
    expect(h.undo()).toBe(true);
    expect(ids(d)).toEqual(['a']);
    expect(h.redo()).toBe(true);
    expect(ids(d)).toEqual(['b']);
  });
});
