import { expect, it, vi } from 'vitest'
import { showUpdateBar } from '../src/ui/updateBar'

it('showUpdateBar renders the exact copy and calls onReload on tap', () => {
  const fn = vi.fn()
  showUpdateBar(fn)
  showUpdateBar(fn)
  expect(document.body.textContent).toContain('Update ready – tap to reload')
  expect(document.querySelectorAll('#update-bar').length).toBe(1)
  ;(document.getElementById('update-bar') as HTMLElement).click()
  expect(fn).toHaveBeenCalledTimes(1)
})
