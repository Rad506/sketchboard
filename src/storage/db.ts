import { openDB, type IDBPDatabase, type IDBPTransaction } from 'idb'
import type { BoardObject } from '../core/types'
import type { Viewport } from '../core/viewport'
import type { Settings } from '../core/settings'

export interface BoardMeta {
  id: string
  name: string
  createdAt: number
  updatedAt: number
  viewport: Viewport
  thumbnail?: Blob
  schema: 1
}

const DB_NAME = 'sketchboard'
const DB_VERSION = 1
const SETTINGS_KEY = 'settings'

type ObjRecord = BoardObject & { boardId: string }
type Upgrade = (db: IDBPDatabase, tx: IDBPTransaction<unknown, string[], 'versionchange'>) => void

/** Forward-only migrations: entry N upgrades a db at version N-1 to N. */
const MIGRATIONS: Record<number, Upgrade> = {
  1: (db) => {
    db.createObjectStore('boards', { keyPath: 'id' })
    const objects = db.createObjectStore('objects', { keyPath: ['boardId', 'id'] })
    objects.createIndex('boardId', 'boardId')
    db.createObjectStore('settings')
  },
}

export interface Db {
  listBoards(): Promise<BoardMeta[]>
  getBoard(id: string): Promise<BoardMeta | undefined>
  putBoard(m: BoardMeta): Promise<void>
  /** Atomic read-modify-write of one board's meta. Returns undefined if the board is gone. */
  patchBoard(id: string, patch: Partial<Omit<BoardMeta, 'id' | 'schema' | 'createdAt'>>): Promise<BoardMeta | undefined>
  deleteBoard(id: string): Promise<void>
  loadObjects(boardId: string): Promise<BoardObject[]>
  writeChanges(boardId: string, added: BoardObject[], removedIds: string[]): Promise<void>
  loadSettings(): Promise<Settings | undefined>
  saveSettings(s: Settings): Promise<void>
}

export async function openDb(): Promise<Db> {
  const idb = await openDB(DB_NAME, DB_VERSION, {
    upgrade(db, oldVersion, newVersion, tx) {
      for (let v = oldVersion + 1; v <= (newVersion ?? DB_VERSION); v++) MIGRATIONS[v]?.(db as IDBPDatabase, tx as never)
    },
  })

  return {
    async listBoards() {
      const all = (await idb.getAll('boards')) as BoardMeta[]
      return all.sort((a, b) => b.updatedAt - a.updatedAt)
    },

    async getBoard(id) {
      return (await idb.get('boards', id)) as BoardMeta | undefined
    },

    async putBoard(m) {
      await idb.put('boards', m)
    },

    async patchBoard(id, patch) {
      const tx = idb.transaction('boards', 'readwrite')
      const cur = (await tx.store.get(id)) as BoardMeta | undefined
      if (!cur) {
        await tx.done
        return undefined
      }
      const next: BoardMeta = { ...cur, ...patch }
      await Promise.all([tx.store.put(next), tx.done])
      return next
    },

    async deleteBoard(id) {
      const tx = idb.transaction(['boards', 'objects'], 'readwrite')
      const keys = await tx.objectStore('objects').index('boardId').getAllKeys(id)
      await Promise.all([
        tx.objectStore('boards').delete(id),
        ...keys.map((k) => tx.objectStore('objects').delete(k)),
        tx.done,
      ])
    },

    async loadObjects(boardId) {
      const recs = (await idb.getAllFromIndex('objects', 'boardId', boardId)) as ObjRecord[]
      return recs.map(({ boardId: _b, ...o }) => o as BoardObject)
    },

    async writeChanges(boardId, added, removedIds) {
      const tx = idb.transaction(['boards', 'objects'], 'readwrite')
      const objects = tx.objectStore('objects')
      const ops: Promise<unknown>[] = []
      for (const id of removedIds) ops.push(objects.delete([boardId, id]))
      for (const o of added) ops.push(objects.put({ ...o, boardId }))
      const boards = tx.objectStore('boards')
      const meta = (await boards.get(boardId)) as BoardMeta | undefined
      if (meta) ops.push(boards.put({ ...meta, updatedAt: Math.max(Date.now(), meta.updatedAt + 1) }))
      await Promise.all([...ops, tx.done])
    },

    async loadSettings() {
      return (await idb.get('settings', SETTINGS_KEY)) as Settings | undefined
    },

    async saveSettings(s) {
      await idb.put('settings', s, SETTINGS_KEY)
    },
  }
}
