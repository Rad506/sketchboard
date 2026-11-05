import './style.css'
import { registerSW } from 'virtual:pwa-register'
import { showUpdateBar } from './ui/updateBar'
import { renderToolBadge } from './ui/toolBadge'
import { LiveLayer } from './render/liveLayer'
import { InputRouter, type RouterEvent } from './input/router'
import { SideButtonDetector, type PenSample } from './input/sideButton'
import { applySideGesture, selectTool, type PenKind, type Tool, type ToolState } from './core/toolState'
import { BoardDoc } from './core/board'
import { History } from './core/history'
import { bboxOf, newId } from './core/geometry'
import { panBy, toWorld, zoomAt, type Viewport } from './core/viewport'
import type { Pt, StrokeObj } from './core/types'
import { Renderer } from './render/renderer'
import { PEN_DEFAULTS } from './render/pens'
import { StrokeEraseSession } from './tools/strokeEraser'
import { AreaEraseSession } from './tools/areaEraser'

const AREA_RADIUS_PX = 20 // default; Task 13 makes this a setting (5-80)

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
const doc = new BoardDoc()
const history = new History(doc)
const renderer = new Renderer(mainCanvas, doc)
let vp: Viewport = { x: 0, y: 0, zoom: 1 }

function setView(next: Viewport): void {
  vp = next
  live.setViewport(vp)
  renderer.setViewport(vp)
}

function resize(): void {
  const dpr = window.devicePixelRatio || 1
  const w = board.clientWidth
  const h = board.clientHeight
  for (const c of [mainCanvas, liveCanvas]) {
    c.width = Math.round(w * dpr)
    c.height = Math.round(h * dpr)
    c.style.width = `${w}px` // CSS size always equals the board, so backing store maps 1:1
    c.style.height = `${h}px`
  }
  live.setDpr(dpr)
  renderer.requestDraw()
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

const isPen = (t: Tool): t is PenKind => t === 'ink' || t === 'felt' || t === 'highlighter'

// Temporary key bindings until the toolbar (Task 13): 1 ink, 2 felt, 3 highlighter.
const KEY_TOOLS: Record<string, PenKind> = { '1': 'ink', '2': 'felt', '3': 'highlighter' }
window.addEventListener('keydown', (e) => {
  const pen = KEY_TOOLS[e.key]
  if (!pen) return
  toolState = selectTool(toolState, pen)
  renderToolBadge(badge, toolState.tool)
})

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

/** Pen sizes are world units; eraser previews are screen px, so they divide by zoom. */
function styleFor(): { color: string; size: number; alpha: number; pen: PenKind } {
  const t = toolState.tool
  if (isPen(t)) return { ...PEN_DEFAULTS[t], alpha: 1, pen: t }
  if (t === 'strokeEraser') return { color: '#e02020', size: 2 / vp.zoom, alpha: 1, pen: 'felt' }
  return { color: '#2060e0', size: 40 / vp.zoom, alpha: 0.35, pen: 'felt' }
}

/** Tool latched at strokeStart so a mid-stroke side-button change can't switch the action. */
let eraseSession: StrokeEraseSession | null = null
let areaSession: AreaEraseSession | null = null
let current: { pen: PenKind; color: string; size: number; points: Pt[] } | null = null

function commitStroke(): void {
  const cur = current
  current = null
  if (!cur || cur.points.length === 0) return
  const base = {
    kind: 'stroke' as const,
    id: newId(),
    createdAt: Date.now(),
    pen: cur.pen,
    color: cur.color,
    size: cur.size,
    points: cur.points,
  }
  const obj: StrokeObj = { ...base, bbox: bboxOf(base) }
  history.apply({ add: [obj], remove: [] })
}

/** `ev` may be a coalesced sub-event: it contributes its own coordinates, pressure, buttons and time. */
function dispatch(e: PointerEvent, ev: PointerEvent): void {
  const rect = board.getBoundingClientRect()
  const re: RouterEvent = {
    ...toSample(ev),
    type: e.type as PenSample['type'],
    pointerId: e.pointerId,
    pointerType: e.pointerType,
    x: ev.clientX - rect.left,
    y: ev.clientY - rect.top,
  }
  for (const a of router.handle(re)) {
    switch (a.kind) {
      case 'strokeStart': {
        const s = styleFor()
        live.clear()
        const [wx, wy] = toWorld(vp, a.x, a.y)
        if (toolState.tool === 'areaEraser') {
          current = null
          eraseSession = null
          areaSession = new AreaEraseSession(doc, history)
          areaSession.move(wx, wy, AREA_RADIUS_PX / vp.zoom)
          live.cursor(a.x, a.y, AREA_RADIUS_PX)
          break
        }
        live.begin({ pen: s.pen, color: s.color, size: s.size }, s.alpha)
        live.add(a.x, a.y, a.p)
        current = isPen(toolState.tool)
          ? { pen: s.pen, color: s.color, size: s.size, points: [[wx, wy, a.p]] }
          : null
        eraseSession = toolState.tool === 'strokeEraser' ? new StrokeEraseSession(doc, history) : null
        eraseSession?.move(wx, wy, 6 / vp.zoom)
        break
      }
      case 'strokeMove': {
        if (areaSession) {
          const [wx, wy] = toWorld(vp, a.x, a.y)
          areaSession.move(wx, wy, AREA_RADIUS_PX / vp.zoom)
          live.cursor(a.x, a.y, AREA_RADIUS_PX)
          break
        }
        live.add(a.x, a.y, a.p)
        if (eraseSession) {
          const [wx, wy] = toWorld(vp, a.x, a.y)
          eraseSession.move(wx, wy, 6 / vp.zoom)
        }
        if (current) {
          const [wx, wy] = toWorld(vp, a.x, a.y)
          current.points.push([wx, wy, a.p])
        }
        break
      }
      case 'strokeEnd': {
        if (areaSession) {
          const [wx, wy] = toWorld(vp, a.x, a.y)
          areaSession.move(wx, wy, AREA_RADIUS_PX / vp.zoom)
          areaSession.end()
          areaSession = null
          live.clear()
          break
        }
        if (eraseSession) {
          const [wx, wy] = toWorld(vp, a.x, a.y)
          eraseSession.move(wx, wy, 6 / vp.zoom)
          eraseSession.end()
          eraseSession = null
        }
        if (current) {
          const [wx, wy] = toWorld(vp, a.x, a.y)
          const last = current.points[current.points.length - 1]
          if (last[0] !== wx || last[1] !== wy) current.points.push([wx, wy, last[2]]) // pointerup reports pressure 0
        }
        commitStroke()
        live.clear()
        break
      }
      case 'strokeCancel':
        areaSession?.end() // already-cut objects stay cut, so keep them undoable
        areaSession = null
        eraseSession?.end() // already-erased objects stay erased, so keep them undoable
        eraseSession = null
        current = null
        live.clear()
        break
      case 'pan':
        setView(panBy(vp, a.dx, a.dy))
        break
      case 'zoom':
        setView(zoomAt(vp, a.cx, a.cy, a.factor))
        break
      case 'hover':
        if (toolState.tool === 'areaEraser') live.cursor(a.x, a.y, AREA_RADIUS_PX)
        else live.clear()
        break
      default:
        break
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
