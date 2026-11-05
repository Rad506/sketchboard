/** Hue ring + inner saturation/brightness square, drawn on one canvas. */

export function hsvToHex(h: number, s: number, v: number): string {
  const hh = (((h % 360) + 360) % 360) / 60
  const c = v * s
  const x = c * (1 - Math.abs((hh % 2) - 1))
  const m = v - c
  const [r, g, b] =
    hh < 1 ? [c, x, 0] : hh < 2 ? [x, c, 0] : hh < 3 ? [0, c, x] : hh < 4 ? [0, x, c] : hh < 5 ? [x, 0, c] : [c, 0, x]
  const ch = (n: number) => Math.round((n + m) * 255).toString(16).padStart(2, '0')
  return `#${ch(r)}${ch(g)}${ch(b)}`
}

export function hexToHsv(hex: string): [number, number, number] {
  let t = hex.replace('#', '')
  if (t.length === 3) t = t.split('').map((c) => c + c).join('')
  const n = parseInt(t, 16)
  const r = ((n >> 16) & 255) / 255
  const g = ((n >> 8) & 255) / 255
  const b = (n & 255) / 255
  const max = Math.max(r, g, b)
  const d = max - Math.min(r, g, b)
  let h = 0
  if (d !== 0) {
    if (max === r) h = ((g - b) / d) % 6
    else if (max === g) h = (b - r) / d + 2
    else h = (r - g) / d + 4
    h *= 60
    if (h < 0) h += 360
  }
  return [h, max === 0 ? 0 : d / max, max]
}

const RING_FRAC = 0.14 // ring thickness as a fraction of the canvas size
const SQUARE_FRAC = 0.7 // square half-side as a fraction of the ring's inner radius

export function wheelGeometry(size: number) {
  const c = size / 2
  const outer = c
  const inner = outer - size * RING_FRAC
  const half = inner * SQUARE_FRAC
  return { c, outer, inner, half }
}

export type WheelPick = { kind: 'hue'; h: number } | { kind: 'sv'; s: number; v: number } | null

export function wheelPick(x: number, y: number, size: number): WheelPick {
  const { c, outer, inner, half } = wheelGeometry(size)
  const dx = x - c
  const dy = y - c
  if (Math.abs(dx) <= half && Math.abs(dy) <= half) {
    return { kind: 'sv', s: (dx + half) / (2 * half), v: 1 - (dy + half) / (2 * half) }
  }
  const r = Math.hypot(dx, dy)
  if (r >= inner && r <= outer) return { kind: 'hue', h: hueAt(dx, dy) }
  return null
}

const hueAt = (dx: number, dy: number): number => ((Math.atan2(dy, dx) * 180) / Math.PI + 360) % 360

export interface ColorWheel {
  setColor(hex: string): void
}

/** Mounts the wheel. `onInput` fires live while dragging; `onCommit` once on pointer release. */
export function mountColorWheel(
  host: HTMLElement,
  initial: string,
  onInput: (hex: string) => void,
  onCommit: (hex: string) => void,
  size = 200,
): ColorWheel {
  const canvas = document.createElement('canvas')
  canvas.className = 'color-wheel'
  canvas.style.width = `${size}px`
  canvas.style.height = `${size}px`
  canvas.style.touchAction = 'none'
  host.appendChild(canvas)
  const dpr = window.devicePixelRatio || 1
  canvas.width = Math.round(size * dpr)
  canvas.height = Math.round(size * dpr)

  let [h, s, v] = hexToHsv(initial)

  function draw(): void {
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx.clearRect(0, 0, size, size)
    const { c, outer, inner, half } = wheelGeometry(size)
    const mid = (outer + inner) / 2
    ctx.lineWidth = outer - inner
    for (let a = 0; a < 360; a++) {
      ctx.beginPath()
      ctx.strokeStyle = hsvToHex(a, 1, 1)
      ctx.arc(c, c, mid, ((a - 0.6) * Math.PI) / 180, ((a + 1.6) * Math.PI) / 180)
      ctx.stroke()
    }
    ctx.fillStyle = hsvToHex(h, 1, 1)
    ctx.fillRect(c - half, c - half, half * 2, half * 2)
    const white = ctx.createLinearGradient(c - half, 0, c + half, 0)
    white.addColorStop(0, '#ffffff')
    white.addColorStop(1, 'rgba(255,255,255,0)')
    ctx.fillStyle = white
    ctx.fillRect(c - half, c - half, half * 2, half * 2)
    const black = ctx.createLinearGradient(0, c - half, 0, c + half)
    black.addColorStop(0, 'rgba(0,0,0,0)')
    black.addColorStop(1, '#000000')
    ctx.fillStyle = black
    ctx.fillRect(c - half, c - half, half * 2, half * 2)
    const marker = (mx: number, my: number): void => {
      ctx.beginPath()
      ctx.arc(mx, my, 7, 0, Math.PI * 2)
      ctx.lineWidth = 3
      ctx.strokeStyle = '#ffffff'
      ctx.stroke()
      ctx.lineWidth = 1
      ctx.strokeStyle = '#00000088'
      ctx.stroke()
    }
    const ha = (h * Math.PI) / 180
    marker(c + mid * Math.cos(ha), c + mid * Math.sin(ha))
    marker(c - half + s * half * 2, c - half + (1 - v) * half * 2)
  }

  let lock: 'hue' | 'sv' | null = null

  function apply(e: PointerEvent): void {
    const r = canvas.getBoundingClientRect()
    const x = e.clientX - r.left
    const y = e.clientY - r.top
    const { c, half } = wheelGeometry(size)
    if (lock === 'hue') h = hueAt(x - c, y - c)
    else if (lock === 'sv') {
      const px = Math.min(half, Math.max(-half, x - c))
      const py = Math.min(half, Math.max(-half, y - c))
      s = (px + half) / (2 * half)
      v = 1 - (py + half) / (2 * half)
    }
    draw()
    onInput(hsvToHex(h, s, v))
  }

  canvas.addEventListener('pointerdown', (e) => {
    const r = canvas.getBoundingClientRect()
    const hit = wheelPick(e.clientX - r.left, e.clientY - r.top, size)
    if (!hit) return
    lock = hit.kind
    canvas.setPointerCapture?.(e.pointerId)
    apply(e)
  })
  canvas.addEventListener('pointermove', (e) => {
    if (lock) apply(e)
  })
  const end = (): void => {
    if (!lock) return
    lock = null
    onCommit(hsvToHex(h, s, v))
  }
  canvas.addEventListener('pointerup', end)
  canvas.addEventListener('pointercancel', end)

  draw()
  return {
    setColor(hex) {
      ;[h, s, v] = hexToHsv(hex)
      draw()
    },
  }
}
