import 'fake-indexeddb/auto'
import { IDBFactory } from 'fake-indexeddb'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { Autosave, wireAutosave } from '../../src/storage/autosave'
import { openDb, type Db } from '../../src/storage/db'
import { BoardDoc } from '../../src/core/board'
import { History } from '../../src/core/history'
import { InputRouter, type RouterEvent } from '../../src/input/router'
import { bboxOf } from '../../src/core/geometry'
import type { BoardObject, StrokeObj } from '../../src/core/types'

const stroke = (id: string): BoardObject => ({
  kind: 'stroke', id, createdAt: 1, pen: 'ink', color: '#000000', size: 3,
  points: [[0, 0, 0.5], [10, 10, 0.5]],
  bbox: { minX: 0, minY: 0, maxX: 10, maxY: 10 },
})

function fakeDb(impl?: (added: BoardObject[], removed: string[]) => Promise<void>) {
  const writeChanges = vi.fn(impl ?? (async () => {}))
  return { writeChanges } as unknown as Db & { writeChanges: ReturnType<typeof vi.fn> }
}

const setVisibility = (v: 'hidden' | 'visible') =>
  Object.defineProperty(document, 'visibilityState', { value: v, configurable: true })

beforeEach(() => {
  vi.useFakeTimers()
  ;(globalThis as { indexedDB: IDBFactory }).indexedDB = new IDBFactory()
})
afterEach(() => {
  vi.useRealTimers()
  setVisibility('visible')
})

describe('Autosave', () => {
  it('debounces 500ms and merges add+remove of same id to nothing', async () => {
    const db = fakeDb()
    const a = new Autosave(db, 'b1', () => {})
    a.queue([stroke('x')], [])
    a.queue([stroke('y')], [])
    a.queue([], ['x'])
    await vi.advanceTimersByTimeAsync(499)
    expect(db.writeChanges).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(1)
    expect(db.writeChanges).toHaveBeenCalledTimes(1)
    const [board, added, removed] = db.writeChanges.mock.calls[0]
    expect(board).toBe('b1')
    expect((added as BoardObject[]).map((o) => o.id)).toEqual(['y'])
    expect(removed).toEqual([])
  })

  it('writes nothing at all when everything cancels out', async () => {
    const db = fakeDb()
    const a = new Autosave(db, 'b1', () => {})
    a.queue([stroke('x')], [])
    a.queue([], ['x'])
    await vi.advanceTimersByTimeAsync(600)
    await a.flush()
    expect(db.writeChanges).not.toHaveBeenCalled()
  })

  it('remove then add (replace) writes the new object; repeated adds: last wins', async () => {
    const db = fakeDb()
    const a = new Autosave(db, 'b1', () => {}, ['x'])
    const v2 = { ...stroke('x'), size: 9 } as BoardObject
    const v3 = { ...stroke('x'), size: 11 } as BoardObject
    a.queue([], ['x'])
    a.queue([v2], [])
    a.queue([v3], [])
    await a.flush()
    const [, added, removed] = db.writeChanges.mock.calls[0]
    expect(added).toEqual([v3])
    expect(removed).toEqual([])
  })

  it('add then remove of an already-persisted id still deletes it', async () => {
    const db = fakeDb()
    const a = new Autosave(db, 'b1', () => {}, ['x'])
    a.queue([], ['x'])
    a.queue([stroke('x')], [])
    a.queue([], ['x'])
    await a.flush()
    const [, added, removed] = db.writeChanges.mock.calls[0]
    expect(added).toEqual([])
    expect(removed).toEqual(['x'])
  })

  it('flush writes immediately', async () => {
    const db = fakeDb()
    const a = new Autosave(db, 'b1', () => {})
    a.queue([stroke('x')], [])
    await a.flush()
    expect(db.writeChanges).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(1000)
    expect(db.writeChanges).toHaveBeenCalledTimes(1)
  })

  it('db failure -> unavailable, changes kept, later success -> ok', async () => {
    let fail = true
    const db = fakeDb(async () => {
      if (fail) throw new DOMException('full', 'QuotaExceededError')
    })
    const status = vi.fn()
    const a = new Autosave(db, 'b1', status)
    a.queue([stroke('x')], [])
    await a.flush()
    expect(status).toHaveBeenLastCalledWith('unavailable')
    fail = false
    a.queue([stroke('y')], [])
    await a.flush()
    expect(status).toHaveBeenLastCalledWith('ok')
    // the failed batch was retried together with the new one
    const last = db.writeChanges.mock.calls.at(-1)!
    expect((last[1] as BoardObject[]).map((o) => o.id).sort()).toEqual(['x', 'y'])
    expect(status).toHaveBeenCalledTimes(2)
  })

  it('retries a failed write on its own', async () => {
    let fail = true
    const db = fakeDb(async () => {
      if (fail) throw new Error('boom')
    })
    const status = vi.fn()
    const a = new Autosave(db, 'b1', status)
    a.queue([stroke('x')], [])
    await vi.advanceTimersByTimeAsync(500)
    expect(status).toHaveBeenLastCalledWith('unavailable')
    fail = false
    await vi.advanceTimersByTimeAsync(6000)
    expect(status).toHaveBeenLastCalledWith('ok')
  })

  it('no db (openDb threw) -> reports unavailable and drawing still works', async () => {
    const status = vi.fn()
    const a = new Autosave(null, 'b1', status)
    expect(status).toHaveBeenCalledWith('unavailable')
    const doc = new BoardDoc()
    wireAutosave(doc, a)
    doc.add(stroke('x'))
    await a.flush()
    expect(doc.get('x')).toBeDefined()
  })

  it('persists through a real (fake-indexeddb) db via wireAutosave', async () => {
    vi.useRealTimers()
    const db = await openDb()
    await db.putBoard({ id: 'b1', name: 'n', createdAt: 1, updatedAt: 1, viewport: { x: 0, y: 0, zoom: 1 }, schema: 1 })
    const doc = new BoardDoc()
    const a = new Autosave(db, 'b1', () => {})
    wireAutosave(doc, a)
    doc.add(stroke('x'))
    doc.add(stroke('y'))
    doc.remove('y')
    await a.flush()
    expect((await db.loadObjects('b1')).map((o) => o.id)).toEqual(['x'])
  })

  it('pointercancel mid-stroke + hidden -> stroke is saved', async () => {
    const db = fakeDb()
    const a = new Autosave(db, 'b1', () => {})
    const doc = new BoardDoc()
    const history = new History(doc)
    wireAutosave(doc, a)
    const router = new InputRouter({ fingerDraw: () => false })
    const pts: [number, number, number][] = []
    let t = 0
    const feed = (type: RouterEvent['type'], x: number, y: number, pressure: number, buttons: number) => {
      const acts = router.handle({ type, pointerId: 1, pointerType: 'pen', x, y, pressure, buttons, t: ++t })
      for (const act of acts) {
        if (act.kind === 'strokeStart' || act.kind === 'strokeMove') pts.push([act.x, act.y, act.p])
        if (act.kind === 'strokeEnd') {
          const base = {
            kind: 'stroke' as const, id: 's1', createdAt: 1, pen: 'ink' as const,
            color: '#000000', size: 3, points: pts,
          }
          const obj: StrokeObj = { ...base, bbox: bboxOf(base) }
          history.apply({ add: [obj], remove: [] })
        }
      }
    }
    feed('pointerdown', 5, 5, 0.5, 1)
    feed('pointermove', 20, 20, 0.5, 1)
    feed('pointercancel', 20, 20, 0, 0)
    setVisibility('hidden')
    document.dispatchEvent(new Event('visibilitychange'))
    await vi.advanceTimersByTimeAsync(0)
    expect(db.writeChanges).toHaveBeenCalledTimes(1)
    expect((db.writeChanges.mock.calls[0][1] as BoardObject[]).map((o) => o.id)).toEqual(['s1'])
  })

  it('on hidden, runs the beforeFlush hook (open text edit) before flushing', async () => {
    const db = fakeDb()
    const a = new Autosave(db, 'b1', () => {})
    const doc = new BoardDoc()
    const order: string[] = []
    wireAutosave(doc, a, () => {
      order.push('finishEdit')
      doc.add(stroke('t'))
    })
    db.writeChanges.mockImplementation(async () => { order.push('write') })
    setVisibility('hidden')
    document.dispatchEvent(new Event('visibilitychange'))
    await vi.advanceTimersByTimeAsync(0)
    expect(order).toEqual(['finishEdit', 'write'])
  })
  it('dispose drops pending writes and cancels the timer (board deleted)', async () => {
    const db = fakeDb()
    const a = new Autosave(db, 'b1', () => {})
    a.queue([stroke('x')], [])
    await a.dispose()
    await vi.advanceTimersByTimeAsync(5000)
    await a.flush()
    expect(db.writeChanges).not.toHaveBeenCalled()
  })

  it('dispose waits for a write already in flight', async () => {
    let release!: () => void
    const db = fakeDb(() => new Promise<void>((r) => { release = r }))
    const a = new Autosave(db, 'b1', () => {})
    a.queue([stroke('x')], [])
    void a.flush()
    await vi.advanceTimersByTimeAsync(0)
    let done = false
    void a.dispose().then(() => { done = true })
    await vi.advanceTimersByTimeAsync(0)
    expect(done).toBe(false)
    release()
    await vi.advanceTimersByTimeAsync(0)
    expect(done).toBe(true)
  })

  it('the unwire function returned by wireAutosave stops the hidden-flush listener', async () => {
    const db = fakeDb()
    const a = new Autosave(db, 'b1', () => {})
    const doc = new BoardDoc()
    const hook = vi.fn()
    const unwire = wireAutosave(doc, a, hook)
    unwire()
    setVisibility('hidden')
    document.dispatchEvent(new Event('visibilitychange'))
    await vi.advanceTimersByTimeAsync(0)
    expect(hook).not.toHaveBeenCalled()
  })
})
