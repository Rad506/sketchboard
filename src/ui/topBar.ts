export interface MenuItem {
  label: string
  /** When defined the item shows a checkmark column; true = ticked. */
  checked?: boolean
  danger?: boolean
  onSelect: () => void
}

export interface TopBar {
  setName(name: string): void
  /** Hides the ← Boards button and makes the name inert (no storage, so no home screen). */
  setHomeEnabled(on: boolean): void
  closeMenu(): void
}

const CHECK =
  '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>'
const BACK =
  '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M15 5l-7 7 7 7"/></svg>'
const DOTS =
  '<svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor" aria-hidden="true"><circle cx="12" cy="5" r="1.8"/><circle cx="12" cy="12" r="1.8"/><circle cx="12" cy="19" r="1.8"/></svg>'

/**
 * Top bar: [← Boards] [board name (tap = home)] [tool badge slot] [save status slot] [⋮].
 * `el` must already contain the #badge and #save-status elements, which are re-parented here.
 * `items()` is read each time the menu opens, so labels/checkmarks are always current.
 */
export function mountTopBar(
  el: HTMLElement,
  opts: { onHome: () => void; items: () => MenuItem[] },
): TopBar {
  const badge = el.querySelector('#badge')
  const status = el.querySelector('#save-status')
  el.replaceChildren()

  const back = document.createElement('button')
  back.type = 'button'
  back.className = 'tp-btn tp-back'
  back.setAttribute('aria-label', 'Back to boards')
  back.innerHTML = `${BACK}<span>Boards</span>`
  back.addEventListener('click', () => opts.onHome())

  const name = document.createElement('button')
  name.type = 'button'
  name.className = 'tp-name'
  name.setAttribute('aria-label', 'Board name, tap for all boards')
  name.addEventListener('click', () => opts.onHome())

  const spacer = document.createElement('span')
  spacer.className = 'tp-spacer'

  const more = document.createElement('button')
  more.type = 'button'
  more.className = 'tp-btn tp-more'
  more.setAttribute('aria-label', 'Board menu')
  more.setAttribute('aria-haspopup', 'menu')
  more.innerHTML = DOTS

  const menu = document.createElement('div')
  menu.className = 'tp-menu'
  menu.setAttribute('role', 'menu')
  menu.hidden = true

  el.append(back, name)
  if (badge) el.appendChild(badge)
  if (status) el.appendChild(status)
  el.append(spacer, more, menu)

  const closeMenu = (): void => {
    menu.hidden = true
    more.setAttribute('aria-expanded', 'false')
  }
  const openMenu = (): void => {
    menu.replaceChildren()
    for (const it of opts.items()) {
      const b = document.createElement('button')
      b.type = 'button'
      b.className = `tp-item${it.danger ? ' danger' : ''}`
      b.setAttribute('role', it.checked === undefined ? 'menuitem' : 'menuitemcheckbox')
      if (it.checked !== undefined) b.setAttribute('aria-checked', String(it.checked))
      const tick = document.createElement('span')
      tick.className = 'tp-tick'
      if (it.checked) tick.innerHTML = CHECK
      const label = document.createElement('span')
      label.textContent = it.label
      b.append(tick, label)
      b.addEventListener('click', () => {
        closeMenu()
        it.onSelect()
      })
      menu.appendChild(b)
    }
    menu.hidden = false
    more.setAttribute('aria-expanded', 'true')
  }
  more.addEventListener('click', (e) => {
    e.stopPropagation()
    if (menu.hidden) openMenu()
    else closeMenu()
  })
  document.addEventListener('pointerdown', (e) => {
    if (!menu.hidden && !menu.contains(e.target as Node) && e.target !== more && !more.contains(e.target as Node)) closeMenu()
  })
  el.addEventListener('keydown', (e) => {
    if ((e as KeyboardEvent).key === 'Escape') closeMenu()
  })

  return {
    setName(n) {
      name.textContent = n
    },
    setHomeEnabled(on) {
      back.hidden = !on
      name.disabled = !on
    },
    closeMenu,
  }
}
