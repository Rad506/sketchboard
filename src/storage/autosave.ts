import type { BoardDoc } from '../core/board'
import type { BoardObject } from '../core/types'
import type { Db } from './db'

export type SaveStatus = 'ok' | 'unavailable'

const DEBOUNCE_MS = 500
const RETRY_MS = 5000

/**
 * Debounced, merged writer. Pending state is one entry per id: an object to put,
 * or null meaning "delete". Failed writes are folded back in so nothing is lost
 * while storage is unavailable.
 */
export class Autosave {
  private pending = new Map<string, BoardObject | null>()
  /** Ids the db is known (or likely) to hold; an add+remove of any other id cancels out. */
  private persisted: Set<string>
  private timer: ReturnType<typeof setTimeout> | null = null
  private inflight: Promise<void> = Promise.resolve()
  private status: SaveStatus = 'ok'
  private disposed = false

  constructor(
    private db: Pick<Db, 'writeChanges'> | null,
    private boardId: string,
    private onStatus: (s: SaveStatus) => void,
    knownIds: Iterable<string> = [],
  ) {
    this.persisted = new Set(knownIds)
    if (!db) this.setStatus('unavailable')
  }

  private setStatus(s: SaveStatus): void {
    if (s === this.status) return
    this.status = s
    this.onStatus(s)
  }

  queue(added: BoardObject[], removedIds: string[]): void {
    if (!this.db || this.disposed) return
    for (const id of removedIds) {
      const prev = this.pending.get(id)
      if (prev && !this.persisted.has(id)) this.pending.delete(id) // add then remove: never hit the db
      else this.pending.set(id, null)
    }
    for (const o of added) this.pending.set(o.id, o)
    this.arm(DEBOUNCE_MS)
  }

  private arm(ms: number): void {
    if (this.timer) clearTimeout(this.timer)
    this.timer = this.pending.size ? setTimeout(() => void this.flush(), ms) : null
  }

  flush(): Promise<void> {
    if (this.timer) clearTimeout(this.timer)
    this.timer = null
    this.inflight = this.inflight.then(() => this.write())
    return this.inflight
  }

  /**
   * Stop for good and drop anything unwritten (the board is being deleted, so a late
   * write would leave orphan objects). Resolves once an in-flight write has settled.
   */
  dispose(): Promise<void> {
    this.disposed = true
    if (this.timer) clearTimeout(this.timer)
    this.timer = null
    this.pending = new Map()
    return this.inflight
  }

  private async write(): Promise<void> {
    if (!this.db || this.disposed || this.pending.size === 0) return
    const batch = this.pending
    this.pending = new Map()
    const added: BoardObject[] = []
    const removed: string[] = []
    for (const [id, o] of batch) {
      if (o) added.push(o)
      else removed.push(id)
    }
    try {
      await this.db.writeChanges(this.boardId, added, removed)
    } catch {
      for (const [id, o] of batch) if (!this.pending.has(id)) this.pending.set(id, o) // newer entries win
      if (this.disposed) return
      this.setStatus('unavailable')
      this.arm(RETRY_MS)
      return
    }
    for (const o of added) this.persisted.add(o.id)
    for (const id of removed) this.persisted.delete(id)
    this.setStatus('ok')
  }
}

/**
 * Feeds doc changes to the autosaver and flushes when the app is hidden.
 * Returns an unwire function (call it when leaving the board). `beforeFlush` runs first on hidden (e.g. finish an open text edit, which
 * temporarily removes its text from the doc).
 */
export function wireAutosave(doc: BoardDoc, autosave: Autosave, beforeFlush?: () => void): () => void {
  doc.onChange((added, removed) => autosave.queue(added, removed))
  const onVisibility = (): void => {
    if (document.visibilityState !== 'hidden') return
    beforeFlush?.()
    void autosave.flush()
  }
  document.addEventListener('visibilitychange', onVisibility)
  return () => document.removeEventListener('visibilitychange', onVisibility)
}
