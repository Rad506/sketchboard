import 'fake-indexeddb/auto'
import { IDBFactory } from 'fake-indexeddb'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { openDb, type Db } from '../../src/storage/db'
import {
  createBoard,
  deleteBoardFlow,
  ensureFirstBoard,
  makeThumbnail,
  openBoardData,
  relativeTime,
  renameBoard,
  saveViewport,
} from '../../src/core/boards'
import { BoardDoc } from '../../src/core/board'
import { bboxOf } from '../../src/core/geometry'
import { drawObject } from '../../src/render/pens'
import type { BoardObject } from '../../src/core/types'

vi.mock('../../src/render/pens', async (orig) => ({
  ...(await orig<typeof import('../../src/render/pens')>()),
  drawObject: vi.fn(),
}))

let db: Db
beforeEach(async () => {
  ;(globalThis as { indexedDB: IDBFactory }).indexedDB = new IDBFactory()
  db = await openDb()
})
afterEach(() => vi.restoreAllMocks())

describe('boards', () => {
  it('first launch creates "My first board"', async () => {
    const m = await ensureFirstBoard(db)
    expect(m.name).toBe('My first board')
    expect((await db.listBoards()).map((b) => b.name)).toEqual(['My first board'])
    expect((await ensureFirstBoard(db)).id).toBe(m.id) // second launch reuses it
  })

  it('ensureFirstBoard returns the most recently updated board', async () => {
    const a = await createBoard(db, 'A')
    const b = await createBoard(db, 'B')
    await db.putBoard({ ...a, updatedAt: b.updatedAt + 1000 })
    expect((await ensureFirstBoard(db)).id).toBe(a.id)
  })

  it('createBoard names Board 2, Board 3', async () => {
    await ensureFirstBoard(db)
    expect((await createBoard(db)).name).toBe('Board 2')
    expect((await createBoard(db)).name).toBe('Board 3')
  })

  it('createBoard uses the next free N and an explicit name trimmed', async () => {
    await createBoard(db, 'Board 2')
    expect((await createBoard(db)).name).toBe('Board 3')
    expect((await createBoard(db, '  Plans ')).name).toBe('Plans')
  })

  it('rename trims, and "  " keeps old name', async () => {
    const m = await createBoard(db, 'Old')
    expect((await renameBoard(db, m.id, '  New name  ')).name).toBe('New name')
    const kept = await renameBoard(db, m.id, '  ')
    expect(kept.name).toBe('New name')
    expect((await db.listBoards())[0].name).toBe('New name')
  })

  it('reopening a board restores its saved viewport', async () => {
    const m = await createBoard(db, 'V')
    const before = (await db.getBoard(m.id))!.updatedAt
    await saveViewport(db, m.id, { x: -120, y: 45, zoom: 2.5 })
    const { meta } = await openBoardData(db, m.id)
    expect(meta.viewport).toEqual({ x: -120, y: 45, zoom: 2.5 })
    expect(meta.updatedAt).toBe(before) // viewport-only saves don't reorder the home list
  })

  it('openBoardData returns the saved objects', async () => {
    const m = await createBoard(db, 'O')
    const base = { kind: 'stroke' as const, id: 's1', createdAt: 1, pen: 'ink' as const, color: '#000', size: 3, points: [[0, 0, 0.5], [5, 5, 0.5]] as [number, number, number][] }
    await db.writeChanges(m.id, [{ ...base, bbox: bboxOf(base) }], [])
    expect((await openBoardData(db, m.id)).objects.map((o) => o.id)).toEqual(['s1'])
  })

  it('deleting the open board returns to home', async () => {
    const a = await createBoard(db, 'A')
    await createBoard(db, 'B')
    const goHome = vi.fn()
    const confirm = vi.fn().mockResolvedValue(true)
    expect(await deleteBoardFlow(db, a, confirm, goHome)).toBe(true)
    expect(confirm).toHaveBeenCalledWith('Delete “A”? This can\'t be undone.', 'Delete')
    expect(goHome).toHaveBeenCalledOnce()
    expect((await db.listBoards()).map((b) => b.name)).toEqual(['B'])
  })

  it('declining the confirm keeps the board and stays put', async () => {
    const a = await createBoard(db, 'A')
    const goHome = vi.fn()
    expect(await deleteBoardFlow(db, a, async () => false, goHome)).toBe(false)
    expect(goHome).not.toHaveBeenCalled()
    expect(await db.listBoards()).toHaveLength(1)
  })

  it('relativeTime buckets', () => {
    const now = 10_000_000_000
    expect(relativeTime(now - 5_000, now)).toBe('just now')
    expect(relativeTime(now - 59_000, now)).toBe('just now')
    expect(relativeTime(now + 5_000, now)).toBe('just now') // clock skew
    expect(relativeTime(now - 5 * 60_000, now)).toBe('5 min ago')
    expect(relativeTime(now - 59 * 60_000, now)).toBe('59 min ago')
    expect(relativeTime(now - 2 * 3_600_000, now)).toBe('2 h ago')
    expect(relativeTime(now - 23 * 3_600_000, now)).toBe('23 h ago')
    expect(relativeTime(now - 3 * 86_400_000, now)).toBe('3 d ago')
  })
})

describe('makeThumbnail', () => {
  it('returns null for an empty board', async () => {
    expect(await makeThumbnail(new BoardDoc())).toBeNull()
  })

  it('fits content into the canvas with a 16px margin', async () => {
    const ctx = { setTransform: vi.fn(), fillRect: vi.fn(), fillStyle: '' }
    let size = { w: 0, h: 0 }
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(function (this: HTMLCanvasElement) {
      size = { w: this.width, h: this.height }
      return ctx as never
    })
    vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation((cb) => cb(new Blob(['x'], { type: 'image/png' })))
    const doc = new BoardDoc()
    const base = { kind: 'stroke' as const, id: 's', createdAt: 1, pen: 'ink' as const, color: '#000', size: 3, points: [[0, 0, 0.5], [288, 168, 0.5]] as [number, number, number][] }
    doc.add({ ...base, bbox: { minX: 0, minY: 0, maxX: 288, maxY: 168 } } as BoardObject)
    const blob = await makeThumbnail(doc)
    expect(blob).toBeInstanceOf(Blob)
    expect(size).toEqual({ w: 320, h: 200 })
    // bbox 288x168 exactly fills (320-32)x(200-32) -> zoom 1, centred
    expect(ctx.setTransform).toHaveBeenCalledWith(1, 0, 0, 1, 16, 16)
    expect(vi.mocked(drawObject)).toHaveBeenCalledTimes(1)
  })
})
