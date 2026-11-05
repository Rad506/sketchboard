import { createBoard, relativeTime } from '../core/boards'
import type { BoardMeta, Db } from '../storage/db'

let thumbUrls: string[] = []

function thumbUrl(b: Blob): string | null {
  try {
    const u = URL.createObjectURL(b)
    thumbUrls.push(u)
    return u
  } catch {
    return null // e.g. jsdom has no createObjectURL
  }
}

function card(b: BoardMeta, now: number, onOpen: (id: string) => void): HTMLElement {
  const el = document.createElement('button')
  el.type = 'button'
  el.className = 'board-card'
  const thumb = document.createElement('span')
  thumb.className = 'board-thumb'
  const url = b.thumbnail ? thumbUrl(b.thumbnail) : null
  if (url) {
    const img = document.createElement('img')
    img.src = url
    img.alt = ''
    img.draggable = false
    thumb.appendChild(img)
  } else {
    thumb.classList.add('placeholder')
  }
  const name = document.createElement('span')
  name.className = 'board-name'
  name.textContent = b.name
  const time = document.createElement('span')
  time.className = 'board-time'
  time.textContent = relativeTime(b.updatedAt, now)
  el.append(thumb, name, time)
  el.addEventListener('click', () => onOpen(b.id))
  return el
}

/**
 * Renders the boards list into `el` (replacing its contents). If the list can't be read, shows a retry
 * message; if "+ New board" fails, `onError` is called.
 */
export async function mountBoardsHome(
  el: HTMLElement, db: Db, onOpen: (id: string) => void, onError?: () => void,
): Promise<void> {
  let boards: BoardMeta[]
  try {
    boards = await db.listBoards()
  } catch {
    onError?.()
    const box = document.createElement('div')
    box.className = 'boards-error'
    const msg = document.createElement('p')
    msg.textContent = 'Could not load boards'
    const retry = document.createElement('button')
    retry.type = 'button'
    retry.className = 'boards-retry'
    retry.textContent = 'Retry'
    retry.addEventListener('click', () => void mountBoardsHome(el, db, onOpen, onError))
    box.append(msg, retry)
    el.replaceChildren(box)
    return
  }
  for (const u of thumbUrls) URL.revokeObjectURL(u)
  thumbUrls = []
  el.replaceChildren()

  const head = document.createElement('div')
  head.className = 'home-head'
  const title = document.createElement('h1')
  title.textContent = 'Boards'
  const add = document.createElement('button')
  add.type = 'button'
  add.className = 'new-board'
  add.textContent = '+ New board'
  let creating = false
  add.addEventListener('click', async () => {
    if (creating) return
    creating = true
    try {
      onOpen((await createBoard(db)).id)
    } catch {
      onError?.()
    } finally {
      creating = false
    }
  })
  head.append(title, add)
  el.appendChild(head)

  if (boards.length === 0) {
    const empty = document.createElement('p')
    empty.className = 'boards-empty'
    empty.textContent = 'No boards yet'
    el.appendChild(empty)
    return
  }
  const grid = document.createElement('div')
  grid.className = 'board-grid'
  const now = Date.now()
  for (const b of boards) grid.appendChild(card(b, now, onOpen))
  el.appendChild(grid)
}
