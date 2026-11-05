import type { BoardDoc } from './board'
import type { BBox, BoardObject } from './types'
import { fitTo, type Viewport } from './viewport'
import { drawObject, renderOrder } from '../render/pens'
import type { BoardMeta, Db } from '../storage/db'

const THUMB_MARGIN = 16

/** Creates "My first board" on a fresh install; otherwise returns the most recently updated board. */
export async function ensureFirstBoard(db: Db): Promise<BoardMeta> {
  const [latest] = await db.listBoards()
  return latest ?? createBoard(db, 'My first board')
}

/** Default name is "Board N" with the smallest free N from 2 up (the first board is "My first board"). */
export async function createBoard(db: Db, name?: string): Promise<BoardMeta> {
  const existing = new Set((await db.listBoards()).map((b) => b.name))
  let label = name?.trim()
  if (!label) {
    let n = 2
    while (existing.has(`Board ${n}`)) n++
    label = `Board ${n}`
  }
  const now = Date.now()
  const m: BoardMeta = {
    id: crypto.randomUUID(),
    name: label,
    createdAt: now,
    updatedAt: now,
    viewport: { x: 0, y: 0, zoom: 1 },
    schema: 1,
  }
  await db.putBoard(m)
  return m
}

/** Trims the name; a blank name keeps the old one. A rename counts as an edit (moves the board up the list). */
export async function renameBoard(db: Db, id: string, name: string): Promise<BoardMeta> {
  const cur = await db.getBoard(id)
  if (!cur) throw new Error(`no such board: ${id}`)
  const trimmed = name.trim()
  if (!trimmed || trimmed === cur.name) return cur
  return (await db.patchBoard(id, { name: trimmed, updatedAt: Math.max(Date.now(), cur.updatedAt + 1) })) ?? cur
}

/** Viewport-only save: does not bump updatedAt, so the home list stays ordered by real edits. */
export async function saveViewport(db: Db, id: string, viewport: Viewport): Promise<void> {
  await db.patchBoard(id, { viewport })
}

export async function saveThumbnail(db: Db, id: string, thumbnail: Blob | null): Promise<void> {
  if (thumbnail) await db.patchBoard(id, { thumbnail })
}

export async function openBoardData(db: Db, id: string): Promise<{ meta: BoardMeta; objects: BoardObject[] }> {
  const meta = await db.getBoard(id)
  if (!meta) throw new Error(`no such board: ${id}`)
  return { meta, objects: await db.loadObjects(id) }
}

/**
 * Confirms, deletes, then calls `goHome`. Returns whether the board was deleted.
 * `beforeDelete` lets the caller stop autosave first so no late write recreates objects.
 */
export async function deleteBoardFlow(
  db: Db,
  board: Pick<BoardMeta, 'id' | 'name'>,
  confirm: (text: string, okLabel: string) => Promise<boolean>,
  goHome: () => void,
  beforeDelete?: () => Promise<void> | void,
): Promise<boolean> {
  if (!(await confirm(`Delete “${board.name}”? This can't be undone.`, 'Delete'))) return false
  await beforeDelete?.()
  await db.deleteBoard(board.id)
  goHome()
  return true
}

export function relativeTime(ms: number, now: number): string {
  const s = Math.max(0, (now - ms) / 1000)
  if (s < 60) return 'just now'
  const min = Math.floor(s / 60)
  if (min < 60) return `${min} min ago`
  const h = Math.floor(min / 60)
  if (h < 24) return `${h} h ago`
  return `${Math.floor(h / 24)} d ago`
}

export function contentBounds(doc: BoardDoc): BBox | null {
  const all = doc.all()
  if (all.length === 0) return null
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
  for (const o of all) {
    minX = Math.min(minX, o.bbox.minX)
    minY = Math.min(minY, o.bbox.minY)
    maxX = Math.max(maxX, o.bbox.maxX)
    maxY = Math.max(maxY, o.bbox.maxY)
  }
  return { minX, minY, maxX, maxY }
}

/** White-background PNG of the whole board fitted into w×h. Null for an empty board or when canvas is unavailable. */
export async function makeThumbnail(doc: BoardDoc, w = 320, h = 200): Promise<Blob | null> {
  const bounds = contentBounds(doc)
  if (!bounds) return null
  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d')
  if (!ctx) return null
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, w, h)
  const v = fitTo(bounds, w, h, THUMB_MARGIN)
  ctx.setTransform(v.zoom, 0, 0, v.zoom, -v.x * v.zoom, -v.y * v.zoom)
  for (const o of renderOrder(doc.all())) drawObject(ctx, o)
  return new Promise((resolve) => canvas.toBlob((b) => resolve(b), 'image/png'))
}
