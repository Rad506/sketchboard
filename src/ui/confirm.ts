/** In-page dialogs. Never window.confirm / window.prompt (blocked or ugly in an installed PWA). */

interface DialogOpts {
  text: string
  okLabel: string
  input?: string
  danger?: boolean
}

function openDialog<T>(opts: DialogOpts, result: (ok: boolean, input: HTMLInputElement | null) => T): Promise<T> {
  return new Promise((resolve) => {
    const scrim = document.createElement('div')
    scrim.className = 'dialog-scrim'
    const dlg = document.createElement('div')
    dlg.className = 'dialog'
    dlg.setAttribute('role', 'dialog')
    dlg.setAttribute('aria-modal', 'true')

    const msg = document.createElement('p')
    msg.className = 'dialog-text'
    msg.textContent = opts.text
    dlg.appendChild(msg)

    let input: HTMLInputElement | null = null
    if (opts.input !== undefined) {
      input = document.createElement('input')
      input.className = 'dialog-input'
      input.type = 'text'
      input.value = opts.input
      input.maxLength = 80
      input.autocomplete = 'off'
      dlg.appendChild(input)
    }

    const row = document.createElement('div')
    row.className = 'dialog-actions'
    const cancel = document.createElement('button')
    cancel.className = 'dialog-btn dialog-cancel'
    cancel.type = 'button'
    cancel.textContent = 'Cancel'
    const ok = document.createElement('button')
    ok.className = `dialog-btn dialog-ok${opts.danger ? ' danger' : ''}`
    ok.type = 'button'
    ok.textContent = opts.okLabel
    row.append(cancel, ok)
    dlg.appendChild(row)
    scrim.appendChild(dlg)

    const finish = (accepted: boolean): void => {
      const r = result(accepted, input)
      scrim.remove()
      resolve(r)
    }
    ok.addEventListener('click', () => finish(true))
    cancel.addEventListener('click', () => finish(false))
    scrim.addEventListener('pointerdown', (e) => {
      if (e.target === scrim) finish(false)
    })
    dlg.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') finish(false)
      else if (e.key === 'Enter' && input) finish(true)
    })
    document.body.appendChild(scrim)
    if (input) {
      input.focus()
      input.select()
    } else {
      ok.focus()
    }
  })
}

export function confirmInApp(text: string, okLabel: string): Promise<boolean> {
  return openDialog({ text, okLabel, danger: true }, (ok) => ok)
}

/** Resolves the typed text, or null when cancelled. */
export function promptInApp(text: string, initial: string, okLabel: string): Promise<string | null> {
  return openDialog({ text, okLabel, input: initial }, (ok, input) => (ok ? (input?.value ?? '') : null))
}
