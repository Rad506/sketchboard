import { describe, it, expect } from 'vitest';
import { applySideGesture, selectTool, type ToolState } from '../../src/core/toolState';

describe('toolState', () => {
  it('single from ink -> strokeEraser', () => {
    expect(applySideGesture({ tool: 'ink', lastPen: 'ink' }, 'single').tool).toBe('strokeEraser');
  });
  it('single from strokeEraser -> lastPen', () => {
    const r = applySideGesture({ tool: 'strokeEraser', lastPen: 'felt' }, 'single');
    expect(r.tool).toBe('felt');
  });
  it('double from felt -> areaEraser', () => {
    expect(applySideGesture({ tool: 'felt', lastPen: 'felt' }, 'double').tool).toBe('areaEraser');
  });
  it('double from areaEraser -> felt', () => {
    expect(applySideGesture({ tool: 'areaEraser', lastPen: 'felt' }, 'double').tool).toBe('felt');
  });
  it('single from areaEraser -> strokeEraser', () => {
    expect(applySideGesture({ tool: 'areaEraser', lastPen: 'ink' }, 'single').tool).toBe('strokeEraser');
  });
  it('selectTool(highlighter) updates lastPen; selectTool(text) keeps lastPen', () => {
    const s: ToolState = { tool: 'ink', lastPen: 'ink' };
    const h = selectTool(s, 'highlighter');
    expect(h).toEqual({ tool: 'highlighter', lastPen: 'highlighter' });
    expect(selectTool(h, 'text')).toEqual({ tool: 'text', lastPen: 'highlighter' });
  });
  it('does not mutate input', () => {
    const s: ToolState = { tool: 'ink', lastPen: 'ink' };
    applySideGesture(s, 'single');
    expect(s).toEqual({ tool: 'ink', lastPen: 'ink' });
  });
  it('lasso keeps lastPen; side gesture goes to strokeEraser and back', () => {
    const s: ToolState = { tool: 'felt', lastPen: 'felt' };
    const l = selectTool(s, 'lasso');
    expect(l).toEqual({ tool: 'lasso', lastPen: 'felt' });
    const e = applySideGesture(l, 'single');
    expect(e.tool).toBe('strokeEraser');
    expect(applySideGesture(e, 'single').tool).toBe('felt');
  });
});
