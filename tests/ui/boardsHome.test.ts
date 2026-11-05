import 'fake-indexeddb/auto'
import { IDBFactory } from 'fake-indexeddb'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { openDb, type Db } from '../../src/storage/db'
import { createBoard, deleteBoardFlow } from '../../src/core/boards'
import { mountBoardsHome } from '../../src/ui/boardsHome'
import { confirmInApp, promptInApp } from '../../src/ui/confirm'

let db: Db
let el: HTMLElement
beforeEach(async () => {
  ;(globalThis as { indexedDB: IDBFactory }).indexedDB = new IDBFactory()
  db = await openDb()
  document.body.innerHTML = '<div id="home"></div>'
  el = document.getElementById('home')!
})

describe('boards home', () => {
  it('lists boards with name and relative time, newest first, and opens on tap', async () => {
    const a = await createBoard(db, 'Alpha')
    const b = await createBoard(db, 'Beta')
    await db.putBoard({ ...a, updatedAt: b.updatedAt + 10 })
    const onOpen = vi.fn()
    await mountBoardsHome(el, db, onOpen)
    const cards = [...el.querySelectorAll<HTMLElement>('.board-card')]
    expect(cards.map((c) => c.querySelector('.board-name')!.textContent)).toEqual(['Alpha', 'Beta'])
    expect(cards[0].querySelector('.board-time')!.textContent).toBe('just now')
    cards[1].click()
    expect(onOpen).toHaveBeenCalledWith(b.id)
  })

  it('"+ New board" creates the next board and opens it', async () => {
    await createBoard(db, 'Alpha')
    const onOpen = vi.fn()
    await mountBoardsHome(el, db, onOpen)
    el.querySelector<HTMLButtonElement>('.new-board')!.click()
    await vi.waitFor(() => expect(onOpen).toHaveBeenCalled())
    const names = (await db.listBoards()).map((b) => b.name).sort()
    expect(names).toEqual(['Alpha', 'Board 2'])
    expect(onOpen).toHaveBeenCalledWith((await db.listBoards()).find((b) => b.name === 'Board 2')!.id)
  })

  it('deleting the last board shows empty list with "+ New board"', async () => {
    const a = await createBoard(db, 'Only')
    await deleteBoardFlow(db, a, async () => true, () => {})
    await mountBoardsHome(el, db, () => {})
    expect(el.querySelectorAll('.board-card')).toHaveLength(0)
    expect(el.querySelector('.new-board')!.textContent).toBe('+ New board')
    expect(el.querySelector('.boards-empty')).not.toBeNull()
  })
})

describe('in-app dialogs', () => {
  it('confirmInApp resolves true on OK and false on Cancel, and cleans up', async () => {
    const p = confirmInApp('Delete “X”? This can\'t be undone.', 'Delete')
    const dlg = document.querySelector('.dialog')!
    expect(dlg.textContent).toContain('Delete “X”?')
    ;(dlg.querySelector('.dialog-ok') as HTMLButtonElement).click()
    expect(await p).toBe(true)
    expect(document.querySelector('.dialog')).toBeNull()

    const q = confirmInApp('Sure?', 'Yes')
    ;(document.querySelector('.dialog-cancel') as HTMLButtonElement).click()
    expect(await q).toBe(false)
  })

  it('promptInApp returns the typed text, or null on cancel', async () => {
    const p = promptInApp('Rename board', 'Old', 'Rename')
    const input = document.querySelector('.dialog-input') as HTMLInputElement
    expect(input.value).toBe('Old')
    input.value = 'New'
    ;(document.querySelector('.dialog-ok') as HTMLButtonElement).click()
    expect(await p).toBe('New')

    const q = promptInApp('Rename board', 'Old', 'Rename')
    ;(document.querySelector('.dialog-cancel') as HTMLButtonElement).click()
    expect(await q).toBeNull()
  })
})
