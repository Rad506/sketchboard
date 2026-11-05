export type PenKind = 'ink' | 'felt' | 'highlighter';
export type Tool =
  | PenKind
  | 'strokeEraser'
  | 'areaEraser'
  | 'ellipse'
  | 'triangle'
  | 'rect'
  | 'arrow'
  | 'text';

export interface ToolState {
  tool: Tool;
  lastPen: PenKind;
}

const isPen = (t: Tool): t is PenKind => t === 'ink' || t === 'felt' || t === 'highlighter';

/** Side-button click: single toggles stroke eraser, double toggles area eraser. */
export function applySideGesture(s: ToolState, g: 'single' | 'double'): ToolState {
  const eraser: Tool = g === 'single' ? 'strokeEraser' : 'areaEraser';
  return { ...s, tool: s.tool === eraser ? s.lastPen : eraser };
}

export function selectTool(s: ToolState, t: Tool): ToolState {
  return { tool: t, lastPen: isPen(t) ? t : s.lastPen };
}
