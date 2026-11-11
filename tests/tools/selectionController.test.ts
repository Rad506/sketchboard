import { describe, it, expect, vi } from 'vitest';
import { BoardDoc } from '../../src/core/board';
import { bboxOf } from '../../src/core/geometry';
import type { Change } from '../../src/core/history';
import type { Pt, StrokeObj } from '../../src/core/types';
import { screenBox } from '../../src/tools/lasso';
import { SelectionController } from '../../src/tools/selectionController';

const vp = { x: 0, y: 0, zoom: 1 };
const stroke = (id: string, pts: [number, number][]): StrokeObj => {
  const base = { id, createdAt: 1, kind: 'stroke' as const, pen: 'ink' as const, color: '#000', size: 2, points: pts.map(([x, y]) => [x, y, 0.5] as Pt) };
  return { ...base, bbox: bboxOf(base) };
};
const setup = () => {
  const doc = new BoardDoc();
  doc.add(stroke('a', [[100, 100], [150, 120], [200, 100]]));
  doc.add(stroke('b', [[100, 200], [150, 220], [200, 200]]));
  const onCommit = vi.fn<(c: Change) => void>();
  return { doc, onCommit, c: new SelectionController(doc, onCommit) };
};
const lassoAround = (c: SelectionController) => {
  expect(c.down(50, 50, 50, 50, vp)).toBe('lasso');
  c.move(300, 50); c.move(300, 300); c.move(50, 300);
  c.up(vp);
};

describe('SelectionController', () => {
  it('lassos two strokes without committing', () => {
    const { c, onCommit } = setup();
    lassoAround(c);
    expect(c.active).toBe(true);
    expect(c.ids.sort()).toEqual(['a', 'b']);
    expect(c.loop).toBeNull();
    expect(onCommit).not.toHaveBeenCalled();
  });

  it('busy while lassoing and dragging', () => {
    const { c } = setup();
    expect(c.busy).toBe(false);
    c.down(50, 50, 50, 50, vp);
    expect(c.busy).toBe(true);
    c.move(300, 50); c.move(300, 300); c.move(50, 300);
    c.up(vp);
    expect(c.busy).toBe(false);
    c.down(150, 160, 150, 160, vp);
    expect(c.busy).toBe(true);
    c.cancel();
    expect(c.busy).toBe(false);
  });

  it('exposes the loop while lassoing', () => {
    const { c } = setup();
    c.down(50, 50, 50, 50, vp);
    c.move(60, 70);
    expect(c.loop).toEqual([[50, 50], [60, 70]]);
  });

  it('tiny or empty lasso stays inactive', () => {
    const { c, onCommit } = setup();
    c.down(500, 500, 500, 500, vp);
    c.move(505, 500); c.move(505, 505);
    c.up(vp);
    expect(c.active).toBe(false);
    c.down(1000, 1000, 1000, 1000, vp);
    c.move(1100, 1000); c.move(1100, 1100); c.move(1000, 1100);
    c.up(vp);
    expect(c.active).toBe(false);
    expect(onCommit).not.toHaveBeenCalled();
  });

  it('drag flow: hidden, preview, single commit', () => {
    const { c, doc, onCommit } = setup();
    lassoAround(c);
    expect(c.down(150, 160, 150, 160, vp)).toBe('drag');
    c.move(180, 190);
    expect([...c.hidden].sort()).toEqual(['a', 'b']);
    expect(c.preview).toHaveLength(2);
    const pa = c.preview.find((o) => o.id === 'a') as StrokeObj;
    expect(pa.points[0][0]).toBe(130);
    expect(pa.points[0][1]).toBe(130);
    expect(c.bounds()!.minX).toBe(pa.bbox.minX);
    c.up(vp);
    expect(onCommit).toHaveBeenCalledTimes(1);
    const ch = onCommit.mock.calls[0][0];
    expect(ch.remove).toContain(doc.get('a'));
    expect(ch.remove).toContain(doc.get('b'));
    expect(ch.remove.map((o) => o.id).sort()).toEqual(['a', 'b']);
    expect(ch.add.map((o) => o.id).sort()).toEqual(['a', 'b']);
    expect((ch.add.find((o) => o.id === 'a') as StrokeObj).points[0][0]).toBe(130);
    expect(c.hidden.size).toBe(0);
    expect(c.preview).toEqual([]);
    expect(c.active).toBe(true);
  });

  it('identity drag does not commit', () => {
    const { c, onCommit } = setup();
    lassoAround(c);
    c.down(150, 160, 150, 160, vp);
    c.move(150, 160);
    c.up(vp);
    expect(onCommit).not.toHaveBeenCalled();
    expect(c.active).toBe(true);
  });

  it('resize by corner handle commits scaled objects', () => {
    const { c, doc, onCommit } = setup();
    lassoAround(c);
    const box = screenBox(c.bounds()!, vp);
    expect(c.down(200, 220, box.maxX, box.maxY, vp)).toBe('drag');
    c.move(300, 340);
    c.up(vp);
    expect(onCommit).toHaveBeenCalledTimes(1);
    expect(doc.get('a')).toBeDefined();
  });

  it('cancel mid-drag clears without commit', () => {
    const { c, onCommit } = setup();
    lassoAround(c);
    c.down(150, 160, 150, 160, vp);
    c.move(180, 190);
    c.cancel();
    expect(c.hidden.size).toBe(0);
    expect(c.preview).toEqual([]);
    expect(c.active).toBe(true);
    expect(onCommit).not.toHaveBeenCalled();
  });

  it('cancel mid-lasso goes idle', () => {
    const { c } = setup();
    c.down(50, 50, 50, 50, vp);
    c.move(300, 300);
    c.cancel();
    expect(c.loop).toBeNull();
    expect(c.busy).toBe(false);
    expect(c.active).toBe(false);
  });

  it('down outside box ends selection, no lasso', () => {
    const { c } = setup();
    lassoAround(c);
    expect(c.down(900, 900, 900, 900, vp)).toBe('ended');
    expect(c.active).toBe(false);
    expect(c.loop).toBeNull();
    expect(c.busy).toBe(false);
  });

  it('clear ends the selection', () => {
    const { c } = setup();
    lassoAround(c);
    c.clear();
    expect(c.active).toBe(false);
    expect(c.ids).toEqual([]);
  });

  it('ids drop removed objects; all removed means inactive', () => {
    const { c, doc } = setup();
    lassoAround(c);
    doc.remove('a');
    expect(c.ids).toEqual(['b']);
    expect(c.active).toBe(true);
    doc.remove('b');
    expect(c.active).toBe(false);
    expect(c.bounds()).toBeNull();
  });

  it('hits: corner and inside true, outside false', () => {
    const { c } = setup();
    lassoAround(c);
    const box = screenBox(c.bounds()!, vp);
    expect(c.hits(box.minX, box.minY, vp)).toBe(true);
    expect(c.hits((box.minX + box.maxX) / 2 + 5, box.minY + 20, vp)).toBe(true);
    expect(c.hits(900, 900, vp)).toBe(false);
    c.clear();
    expect(c.hits(box.minX, box.minY, vp)).toBe(false);
  });
});
