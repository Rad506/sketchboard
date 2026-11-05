import type { Tool } from '../core/toolState'

const PENS = new Set<Tool>(['ink', 'felt', 'highlighter'])

export function renderToolBadge(el: HTMLElement, tool: Tool): void {
  el.textContent = PENS.has(tool) ? 'Pen' : tool === 'strokeEraser' ? 'Stroke eraser' : tool === 'areaEraser' ? 'Area eraser' : tool
  el.classList.toggle('badge-stroke-eraser', tool === 'strokeEraser')
  el.classList.toggle('badge-area-eraser', tool === 'areaEraser')
}
