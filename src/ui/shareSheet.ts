/** Tiny in-app chooser. Resolves the picked mode, or null when dismissed. */
export function chooseShareMode(): Promise<'whole' | 'view' | null> {
  return new Promise((resolve) => {
    const scrim = document.createElement('div')
    scrim.className = 'dialog-scrim'
    const dlg = document.createElement('div')
    dlg.className = 'dialog'
    dlg.setAttribute('role', 'dialog')
    dlg.setAttribute('aria-modal', 'true')
    const msg = document.createElement('p')
    msg.className = 'dialog-text'
    msg.textContent = 'Share as image'
    const row = document.createElement('div')
    row.className = 'dialog-actions'
    const finish = (v: 'whole' | 'view' | null): void => {
      scrim.remove()
      resolve(v)
    }
    const mk = (label: string, v: 'whole' | 'view'): HTMLButtonElement => {
      const b = document.createElement('button')
      b.type = 'button'
      b.className = 'dialog-btn dialog-ok'
      b.textContent = label
      b.addEventListener('click', () => finish(v))
      return b
    }
    const first = mk('Whole board', 'whole')
    row.append(mk('Current view', 'view'), first)
    dlg.append(msg, row)
    scrim.appendChild(dlg)
    scrim.addEventListener('pointerdown', (e) => {
      if (e.target === scrim) finish(null)
    })
    dlg.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') finish(null)
    })
    document.body.appendChild(scrim)
    first.focus()
  })
}
