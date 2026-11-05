import { describe, it, expect, vi } from 'vitest'
import { textChange, openTextEditor } from '../../src/tools/textTool'
import type { TextObj } from '../../src/core/types'
import { bboxOf } from '../../src/core/geometry'

const base = { x: 10, y: 20, color: '#000000', fontSize: 24 }
const existing = (): TextObj => {
  const o = { kind: 'text' as const, id: 't1', createdAt: 1, x: 10, y: 20, text: 'old', color: '#000000', fontSize: 24 }
  return { ...o, bbox: bboxOf(o) }
}

describe('textChange', () => {
  it('new text → add change', () => {
    const c = textChange(null, 'hello', base)!
    expect(c.remove).toEqual([])
    expect(c.add).toHaveLength(1)
    const o = c.add[0] as TextObj
    expect(o).toMatchObject({ kind: 'text', x: 10, y: 20, text: 'hello', color: '#000000', fontSize: 24 })
    expect(o.id).toBeTruthy()
  })
  it('empty new text → null', () => {
    expect(textChange(null, '', base)).toBeNull()
    expect(textChange(null, '  \n ', base)).toBeNull()
  })
  it('edit → remove old + add new with same id', () => {
    const before = existing()
    const c = textChange(before, 'new', base)!
    expect(c.remove).toEqual([before])
    const o = c.add[0] as TextObj
    expect(o.id).toBe('t1')
    expect(o.text).toBe('new')
    expect(o.x).toBe(10)
  })
  it('unchanged edit → null', () => {
    expect(textChange(existing(), 'old', base)).toBeNull()
  })
  it('cleared existing text → remove', () => {
    const before = existing()
    const c = textChange(before, '', base)!
    expect(c.add).toEqual([])
    expect(c.remove).toEqual([before])
  })
  it('text bbox measured with fontSize × lines', () => {
    const o = textChange(null, 'abcd\nab', base)!.add[0] as TextObj
    expect(o.bbox.minX).toBe(10)
    expect(o.bbox.maxX).toBeCloseTo(10 + 0.6 * 24 * 4)
    expect(o.bbox.maxY).toBeCloseTo(20 + 1.2 * 24 * 2)
  })
})

describe('openTextEditor', () => {
  it('creates a positioned textarea and reports its value on blur', () => {
    const board = document.createElement('div')
    document.body.appendChild(board)
    const onDone = vi.fn()
    openTextEditor(board, [30, 40], null, { fontSizePx: 24, color: '#000000' }, onDone)
    const ta = board.querySelector('textarea')!
    expect(ta.style.left).toBe('30px')
    expect(ta.style.top).toBe('40px')
    expect(ta.style.fontSize).toBe('24px')
    ta.value = 'typed'
    ta.dispatchEvent(new Event('blur'))
    expect(onDone).toHaveBeenCalledWith('typed')
    expect(board.querySelector('textarea')).toBeNull()
    ta.dispatchEvent(new Event('blur'))
    expect(onDone).toHaveBeenCalledTimes(1)
  })
  it('Escape cancels without calling onDone', () => {
    const board = document.createElement('div')
    document.body.appendChild(board)
    const onDone = vi.fn()
    const onCancel = vi.fn()
    openTextEditor(board, [0, 0], null, { fontSizePx: 24, color: '#000' }, onDone, onCancel)
    const ta = board.querySelector('textarea')!
    ta.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
    expect(onDone).not.toHaveBeenCalled()
    expect(onCancel).toHaveBeenCalled()
    expect(board.querySelector('textarea')).toBeNull()
  })
})
