import type { BoardDoc } from '../core/board'
import type { BBox } from '../core/types'
import type { Viewport } from '../core/viewport'
import { drawObject, renderOrder } from '../render/pens'

export const SHARE_MARGIN = 40
export const SHARE_SCALE = 2
export const SHARE_MAX_PX = 4096

export interface ExportRect {
  world: BBox
  scale: number
  pxW: number
  pxH: number
  capped: boolean
}

/** Which world area to render and at what pixel size. Null = nothing to export (empty board, whole mode). */
export function exportRect(
  content: BBox | null,
  mode: 'whole' | 'view',
  vp: Viewport,
  screenW: number,
  screenH: number,
  dpr: number,
): ExportRect | null {
  if (mode === 'view') {
    const world = { minX: vp.x, minY: vp.y, maxX: vp.x + screenW / vp.zoom, maxY: vp.y + screenH / vp.zoom }
    return { world, scale: vp.zoom * dpr, pxW: Math.round(screenW * dpr), pxH: Math.round(screenH * dpr), capped: false }
  }
  if (!content) return null
  const world = {
    minX: content.minX - SHARE_MARGIN,
    minY: content.minY - SHARE_MARGIN,
    maxX: content.maxX + SHARE_MARGIN,
    maxY: content.maxY + SHARE_MARGIN,
  }
  const w = world.maxX - world.minX
  const h = world.maxY - world.minY
  let scale = SHARE_SCALE
  let capped = false
  if (Math.max(w, h) * scale > SHARE_MAX_PX) {
    scale = SHARE_MAX_PX / Math.max(w, h)
    capped = true
  }
  return {
    world,
    scale,
    pxW: Math.min(SHARE_MAX_PX, Math.round(w * scale)),
    pxH: Math.min(SHARE_MAX_PX, Math.round(h * scale)),
    capped,
  }
}

export function shareFileName(boardName: string, d: Date): string {
  const safe = boardName.replace(/[\\/:*?"<>|]/g, '-')
  const p = (n: number): string => String(n).padStart(2, '0')
  return `${safe} – ${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}.png`
}

/** White background, then every object in render order, at the rect's world-to-pixel mapping. */
export async function renderPng(doc: BoardDoc, rect: ExportRect): Promise<Blob> {
  const draw = (ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D): void => {
    const c = ctx as CanvasRenderingContext2D
    c.fillStyle = '#ffffff'
    c.fillRect(0, 0, rect.pxW, rect.pxH)
    c.setTransform(rect.scale, 0, 0, rect.scale, -rect.world.minX * rect.scale, -rect.world.minY * rect.scale)
    for (const o of renderOrder(doc.all())) drawObject(c, o)
  }
  if (typeof OffscreenCanvas !== 'undefined') {
    const oc = new OffscreenCanvas(rect.pxW, rect.pxH)
    const ctx = oc.getContext('2d')
    if (ctx) {
      draw(ctx)
      return oc.convertToBlob({ type: 'image/png' })
    }
  }
  const canvas = document.createElement('canvas')
  canvas.width = rect.pxW
  canvas.height = rect.pxH
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('canvas unavailable')
  draw(ctx)
  return new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('png encode failed'))), 'image/png'),
  )
}

function download(blob: Blob, name: string): void {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = name
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 10_000)
}

/** Share sheet when the browser can share files; otherwise (or if the gesture expired) a download. */
export async function shareOrDownload(blob: Blob, name: string): Promise<'shared' | 'downloaded' | 'cancelled'> {
  const file = new File([blob], name, { type: 'image/png' })
  if (typeof navigator.canShare === 'function' && typeof navigator.share === 'function' && navigator.canShare({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: name })
      return 'shared'
    } catch (e) {
      if ((e as { name?: string })?.name === 'AbortError') return 'cancelled'
      // NotAllowedError (gesture expired) or anything else: fall through to download
    }
  }
  download(blob, name)
  return 'downloaded'
}
