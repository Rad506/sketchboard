let timer: ReturnType<typeof setTimeout> | null = null

/** One reused polite live-region element at the bottom of the screen. */
export function showToast(text: string, ms = 3000): void {
  let el = document.getElementById('toast')
  if (!el) {
    el = document.createElement('div')
    el.id = 'toast'
    el.setAttribute('aria-live', 'polite')
    document.body.appendChild(el)
  }
  const t = el
  t.textContent = text
  t.hidden = false
  if (timer) clearTimeout(timer)
  timer = setTimeout(() => {
    t.hidden = true
  }, ms)
}
