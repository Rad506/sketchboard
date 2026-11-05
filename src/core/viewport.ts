import type { BBox } from './types';

export interface Viewport {
  x: number;
  y: number;
  zoom: number;
}

export const MIN_ZOOM = 0.1;
export const MAX_ZOOM = 8;

const clampZoom = (z: number) => Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, z));

/** screen = (world - {x,y}) * zoom */
export function toScreen(vp: Viewport, wx: number, wy: number): [number, number] {
  return [(wx - vp.x) * vp.zoom, (wy - vp.y) * vp.zoom];
}

export function toWorld(vp: Viewport, sx: number, sy: number): [number, number] {
  return [sx / vp.zoom + vp.x, sy / vp.zoom + vp.y];
}

/** Zoom by factor, keeping the world point under (sx, sy) fixed. */
export function zoomAt(vp: Viewport, sx: number, sy: number, factor: number): Viewport {
  const zoom = clampZoom(vp.zoom * factor);
  const [wx, wy] = toWorld(vp, sx, sy);
  return { x: wx - sx / zoom, y: wy - sy / zoom, zoom };
}

export function panBy(vp: Viewport, dxScreen: number, dyScreen: number): Viewport {
  return { x: vp.x - dxScreen / vp.zoom, y: vp.y - dyScreen / vp.zoom, zoom: vp.zoom };
}

export function fitTo(b: BBox, w: number, h: number, margin: number): Viewport {
  const bw = Math.max(b.maxX - b.minX, 1e-6);
  const bh = Math.max(b.maxY - b.minY, 1e-6);
  const zoom = clampZoom(Math.min((w - 2 * margin) / bw, (h - 2 * margin) / bh));
  const cx = (b.minX + b.maxX) / 2;
  const cy = (b.minY + b.maxY) / 2;
  return { x: cx - w / 2 / zoom, y: cy - h / 2 / zoom, zoom };
}
