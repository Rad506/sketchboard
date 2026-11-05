const BAR_ID = 'update-bar'

export function showUpdateBar(onReload: () => void): void {
  if (document.getElementById(BAR_ID)) return
  const bar = document.createElement('div')
  bar.id = BAR_ID
  bar.setAttribute('role', 'button')
  bar.textContent = 'Update ready – tap to reload'
  bar.addEventListener('click', () => onReload())
  document.body.appendChild(bar)
}
