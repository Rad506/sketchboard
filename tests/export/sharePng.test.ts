import { afterEach, describe, expect, it, vi } from 'vitest'
import { exportRect, shareFileName, shareOrDownload } from '../../src/export/sharePng'

const vp = { x: 100, y: 50, zoom: 2 }

describe('exportRect', () => {
  it('whole: bbox 1000×500 → pxW 2160, pxH 1160, not capped', () => {
    const r = exportRect({ minX: 0, minY: 0, maxX: 1000, maxY: 500 }, 'whole', vp, 800, 600, 3)!
    expect(r.pxW).toBe(2160)
    expect(r.pxH).toBe(1160)
    expect(r.scale).toBe(2)
    expect(r.capped).toBe(false)
    expect(r.world).toEqual({ minX: -40, minY: -40, maxX: 1040, maxY: 540 })
  })
  it('whole: bbox 5000×1000 → pxW 4096 and capped', () => {
    const r = exportRect({ minX: 0, minY: 0, maxX: 5000, maxY: 1000 }, 'whole', vp, 800, 600, 3)!
    expect(r.pxW).toBe(4096)
    expect(r.pxH).toBeLessThanOrEqual(4096)
    expect(r.capped).toBe(true)
  })
  it('view: visible rect equals screen/zoom and pxW = screenW×dpr', () => {
    const r = exportRect(null, 'view', vp, 800, 600, 3)!
    expect(r.world).toEqual({ minX: 100, minY: 50, maxX: 500, maxY: 350 })
    expect(r.pxW).toBe(2400)
    expect(r.pxH).toBe(1800)
    expect(r.scale).toBe(6)
    expect(r.capped).toBe(false)
  })
  it('empty board whole → null', () => {
    expect(exportRect(null, 'whole', vp, 800, 600, 3)).toBeNull()
  })
})

describe('shareFileName', () => {
  it('sanitised and dated (local date, en dash)', () => {
    expect(shareFileName('a/b:c*d?"e<f>g|h\\i', new Date(2026, 10, 5))).toBe('a-b-c-d--e-f-g-h-i – 2026-11-05.png')
    expect(shareFileName('My first board', new Date(2026, 0, 9))).toBe('My first board – 2026-01-09.png')
  })
})

describe('shareOrDownload', () => {
  const blob = new Blob(['x'], { type: 'image/png' })
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })
  function stubDownload() {
    const create = vi.fn(() => 'blob:fake')
    const revoke = vi.fn()
    Object.assign(URL, { createObjectURL: create, revokeObjectURL: revoke })
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})
    return { create, click }
  }

  it('shares when canShare', async () => {
    const share = vi.fn().mockResolvedValue(undefined)
    vi.stubGlobal('navigator', { canShare: () => true, share })
    expect(await shareOrDownload(blob, 'b – 2026-11-05.png')).toBe('shared')
    const arg = share.mock.calls[0][0]
    expect(arg.files[0].name).toBe('b – 2026-11-05.png')
    expect(arg.title).toBe('b – 2026-11-05.png')
  })
  it('downloads when share is unavailable', async () => {
    vi.stubGlobal('navigator', {})
    const { create, click } = stubDownload()
    expect(await shareOrDownload(blob, 'n.png')).toBe('downloaded')
    expect(create).toHaveBeenCalled()
    expect(click).toHaveBeenCalled()
  })
  it('downloads when canShare says no', async () => {
    const share = vi.fn()
    vi.stubGlobal('navigator', { canShare: () => false, share })
    const { click } = stubDownload()
    expect(await shareOrDownload(blob, 'n.png')).toBe('downloaded')
    expect(share).not.toHaveBeenCalled()
    expect(click).toHaveBeenCalled()
  })
  it("returns 'cancelled' on AbortError", async () => {
    const share = vi.fn().mockRejectedValue(new DOMException('x', 'AbortError'))
    vi.stubGlobal('navigator', { canShare: () => true, share })
    const { click } = stubDownload()
    expect(await shareOrDownload(blob, 'n.png')).toBe('cancelled')
    expect(click).not.toHaveBeenCalled()
  })
  it('falls back to download on NotAllowedError (gesture expired)', async () => {
    const share = vi.fn().mockRejectedValue(new DOMException('x', 'NotAllowedError'))
    vi.stubGlobal('navigator', { canShare: () => true, share })
    const { click } = stubDownload()
    expect(await shareOrDownload(blob, 'n.png')).toBe('downloaded')
    expect(click).toHaveBeenCalled()
  })
})
