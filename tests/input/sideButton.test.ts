import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { SideButtonDetector, type PenSample } from '../../src/input/sideButton';

const hover = (t: number, buttons: number, type: PenSample['type'] = 'pointermove'): PenSample => ({
  type, pointerId: 2, pointerType: 'pen', buttons, pressure: 0, t,
});

describe('SideButtonDetector', () => {
  let out: string[];
  let d: SideButtonDetector;
  beforeEach(() => {
    vi.useFakeTimers();
    out = [];
    d = new SideButtonDetector((g) => out.push(g));
  });
  afterEach(() => vi.useRealTimers());

  it("single click emits 'single' after 400ms", () => {
    d.handle(hover(0, 1));
    d.handle(hover(250, 0));
    expect(out).toEqual([]);
    vi.advanceTimersByTime(400);
    expect(out).toEqual(['single']);
  });

  it("double click emits 'double' once and no 'single'", () => {
    d.handle(hover(0, 1));
    vi.advanceTimersByTime(150);
    d.handle(hover(150, 0));
    vi.advanceTimersByTime(100);
    d.handle(hover(250, 1));
    vi.advanceTimersByTime(150);
    d.handle(hover(400, 0));
    vi.advanceTimersByTime(1000);
    expect(out).toEqual(['double']);
  });

  it('press longer than 600ms emits nothing', () => {
    d.handle(hover(0, 1));
    d.handle(hover(700, 0));
    vi.advanceTimersByTime(1000);
    expect(out).toEqual([]);
  });

  it('pointerleave mid-press cancels', () => {
    d.handle(hover(0, 1));
    d.handle(hover(100, 0, 'pointerleave'));
    d.handle(hover(200, 0));
    vi.advanceTimersByTime(1000);
    expect(out).toEqual([]);
  });

  it('tip contact (pressure>0, new pointerId) mid-press cancels', () => {
    d.handle(hover(0, 1));
    d.handle({ type: 'pointerdown', pointerId: 9, pointerType: 'pen', buttons: 1, pressure: 0.027, t: 50 });
    d.handle(hover(200, 0));
    vi.advanceTimersByTime(1000);
    expect(out).toEqual([]);
  });

  it('contact strokes with buttons=1 and pressure>0 are never presses', () => {
    d.handle({ type: 'pointerdown', pointerId: 9, pointerType: 'pen', buttons: 1, pressure: 0.027, t: 0 });
    d.handle({ type: 'pointermove', pointerId: 9, pointerType: 'pen', buttons: 1, pressure: 0.04, t: 10 });
    d.handle({ type: 'pointerup', pointerId: 9, pointerType: 'pen', buttons: 0, pressure: 0, t: 200 });
    vi.advanceTimersByTime(1000);
    expect(out).toEqual([]);
  });

  it('a long press between clicks does not count toward a double', () => {
    d.handle(hover(0, 1));
    d.handle(hover(150, 0));
    d.handle(hover(200, 1));
    d.handle(hover(900, 0)); // 700ms: ignored
    vi.advanceTimersByTime(1000);
    expect(out).toEqual(['single']);
  });
});
