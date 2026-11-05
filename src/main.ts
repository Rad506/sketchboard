import './style.css'
import { registerSW } from 'virtual:pwa-register'
import { showUpdateBar } from './ui/updateBar'
import { renderToolBadge } from './ui/toolBadge'
import { LiveLayer } from './render/liveLayer'
import { InputRouter, type RouterEvent } from './input/router'
import { SideButtonDetector, type PenSample } from './input/sideButton'
import { applySideGesture, type ToolState } from './core/toolState'

const updateSW = registerSW({
  onNeedRefresh: () => showUpdateBar(() => updateSW(true)),
})

const app = document.getElementById('app')!
app.innerHTML = `
  <div id="topbar"><span id="badge"></span></div>
  <div id="board">
    <canvas id="main-canvas"></canvas>
    <canvas id="live-canvas"></canvas>
  </div>`
const board = document.getElementById('board') as HTMLDivElement
const badge = document.getElementById('badge') as HTMLElement
const mainCanvas = document.getElementById('main-canvas') as HTMLCanvasElement
const liveCanvas = document.getElementById('live-canvas') as HTMLCanvasElement
const live = new LiveLayer(liveCanvas)

function resize(): void {
  const dpr = window.devicePixelRatio || 1
  const w = board.clientWidth
  const h = board.clientHeight
  for (const c of [mainCanvas, liveCanvas]) {
    c.width = Math.round(w * dpr)
    c.height = Math.round(h * dpr)
  }
  live.setDpr(dpr)
}
window.addEventListener('resize', resize)
window.addEventListener('orientationchange', resize)
resize()

let toolState: ToolState = { tool: 'ink', lastPen: 'ink' }
renderToolBadge(badge, toolState.tool)

const detector = new SideButtonDetector((g) => {
  toolState = applySideGesture(toolState, g)
  renderToolBadge(badge, toolState.tool)
})
const router = new InputRouter({ fingerDraw: () => false })

board.addEventListener('contextmenu', (e) => e.preventDefault())

function toSample(e: PointerEvent): PenSample {
  return {
    type: e.type as PenSample['type'],
    pointerId: e.pointerId,
    pointerType: e.pointerType,
    buttons: e.buttons,
    pressure: e.pressure,
    t: e.timeStamp,
  }
}

function styleFor(): { color: string; size: number; alpha: number } {
  switch (toolState.tool) {
    case 'strokeEraser':
      return { color: '#e02020', size: 2, alpha: 1 }
    case 'areaEraser':
      return { color: '#2060e0', size: 40, alpha: 0.35 }
    default:
      return { color: '#000000', size: 3, alpha: 1 }
  }
}

function dispatch(e: PointerEvent, ev: PointerEvent): void {
  const rect = board.getBoundingClientRect()
  const re: RouterEvent = { ...toSample(e), x: ev.clientX - rect.left, y: ev.clientY - rect.top }
  for (const a of router.handle(re)) {
    switch (a.kind) {
      case 'strokeStart': {
        const s = styleFor()
        live.clear()
        live.begin({ pen: toolState.lastPen, color: s.color, size: s.size }, s.alpha)
        live.add(a.x, a.y, a.p)
        break
      }
      case 'strokeMove':
        live.add(a.x, a.y, a.p)
        break
      case 'strokeEnd':
      case 'strokeCancel':
        live.clear() // nothing is committed yet (Task 5-6)
        break
      default:
        break // pan / zoom / hover: no main-canvas content yet
    }
  }
}

for (const type of ['pointerdown', 'pointermove', 'pointerup', 'pointercancel', 'pointerleave'] as const) {
  board.addEventListener(type, (e) => {
    if (e.pointerType === 'pen') detector.handle(toSample(e))
    if (type === 'pointermove') {
      const list = e.getCoalescedEvents?.()
      const evs = list && list.length ? list : [e]
      for (const ce of evs) dispatch(e, ce)
    } else {
      dispatch(e, e)
    }
  })
}
