import 'fake-indexeddb/auto'
import { IDBFactory } from 'fake-indexeddb'
import { beforeEach, describe, expect, it } from 'vitest'
import { openDb, openInitialBoard, type BoardMeta } from '../../src/storage/db'
import { defaultSettings } from '../../src/core/settings'
import type { BoardObject } from '../../src/core/types'

const stroke = (id: string, x = 0): BoardObject => ({
  kind: 'stroke', id, createdAt: 1, pen: 'ink', color: '#000000', size: 3,
  points: [[x, 0, 0.5], [x + 10, 10, 0.5]],
  bbox: { minX: x, minY: 0, maxX: x + 10, maxY: 10 },
})
const meta = (id: string, updatedAt = 1): BoardMeta => ({
  id, name: id, createdAt: 1, updatedAt, viewport: { x: 0, y: 0, zoom: 1 }, schema: 1,
})

beforeEach(() => {
  ;(globalThis as { indexedDB: IDBFactory }).indexedDB = new IDBFactory()
})

describe('storage db', () => {
  it('writeChanges then loadObjects round-trips', async () => {
    const db = await openDb()
    await db.putBoard(meta('b1'))
    const a = stroke('a'), b = stroke('b', 50)
    await db.writeChanges('b1', [a, b], [])
    expect((await db.loadObjects('b1')).sort((p, q) => p.id.localeCompare(q.id))).toEqual([a, b])
    await db.writeChanges('b1', [], ['a'])
    expect((await db.loadObjects('b1')).map((o) => o.id)).toEqual(['b'])
  })

  it('writeChanges replaces an object with the same id', async () => {
    const db = await openDb()
    await db.putBoard(meta('b1'))
    await db.writeChanges('b1', [stroke('a', 0)], [])
    await db.writeChanges('b1', [stroke('a', 99)], [])
    const objs = await db.loadObjects('b1')
    expect(objs).toHaveLength(1)
    expect(objs[0].bbox.minX).toBe(99)
  })

  it('deleteBoard removes its objects only', async () => {
    const db = await openDb()
    await db.putBoard(meta('b1'))
    await db.putBoard(meta('b2'))
    await db.writeChanges('b1', [stroke('a')], [])
    await db.writeChanges('b2', [stroke('a'), stroke('c')], [])
    await db.deleteBoard('b1')
    expect(await db.loadObjects('b1')).toEqual([])
    expect((await db.loadObjects('b2')).map((o) => o.id).sort()).toEqual(['a', 'c'])
    expect((await db.listBoards()).map((m) => m.id)).toEqual(['b2'])
  })

  it('listBoards sorts by updatedAt descending', async () => {
    const db = await openDb()
    await db.putBoard(meta('old', 10))
    await db.putBoard(meta('new', 30))
    await db.putBoard(meta('mid', 20))
    expect((await db.listBoards()).map((m) => m.id)).toEqual(['new', 'mid', 'old'])
  })

  it('writeChanges bumps the board updatedAt', async () => {
    const db = await openDb()
    await db.putBoard(meta('b1', 5))
    await db.writeChanges('b1', [stroke('a')], [])
    expect((await db.listBoards())[0].updatedAt).toBeGreaterThan(5)
  })

  it('settings round-trip, undefined before first save', async () => {
    const db = await openDb()
    expect(await db.loadSettings()).toBeUndefined()
    const s = defaultSettings()
    s.fingerDraw = true
    await db.saveSettings(s)
    expect(await db.loadSettings()).toEqual(s)
  })

  it('openInitialBoard creates "My first board" once, then reuses the most recent', async () => {
    const db = await openDb()
    const first = await openInitialBoard(db)
    expect(first.name).toBe('My first board')
    expect((await openInitialBoard(db)).id).toBe(first.id)
    expect(await db.listBoards()).toHaveLength(1)
  })
})
