import './style.css'
import { registerSW } from 'virtual:pwa-register'
import { showUpdateBar } from './ui/updateBar'
import { renderToolBadge } from './ui/toolBadge'
import { LiveLayer, type StrokeStyle } from './render/liveLayer'
import { InputRouter, type RouterEvent } from './input/router'
import { SideButtonDetector, type PenSample } from './input/sideButton'
import { applySideGesture, selectTool, type PenKind, type Tool, type ToolState } from './core/toolState'
import { BoardDoc } from './core/board'
import { History } from './core/history'
import { bboxOf, newId } from './core/geometry'
import { panBy, toScreen, toWorld, zoomAt, type Viewport } from './core/viewport'
import type { Pt, StrokeObj, TextObj } from './core/types'
import { Renderer } from './render/renderer'
import { StrokeEraseSession } from './tools/strokeEraser'
import { AreaEraseSession } from './tools/areaEraser'
import { dragToObject, type ShapeToolKind } from './tools/shapeTool'
import { textChange, openTextEditor } from './tools/textTool'
import { defaultSettings } from './core/settings'
import { mountToolbar } from './ui/toolbar'
import { mountPopover } from './ui/penPopover'
import { SnapController, recognizedToObject, commitStroke } from './tools/snapController'

const TAP_SLOP_PX = 6

/** In-memory tool settings; Task 14 persists them via onSettingsChange. */
const settings = defaultSettings()
let settingsListener: (() => void) | null = null
export function onSettingsChange(cb: () => void): void {
  settingsListener = cb
}
function settingsChanged(): void {
  toolbar.refresh()
  settingsListener?.()
}

const updateSW = registerSW({
  onNeedRefresh: () => showUpdateBar(() => updateSW(true)),
})

const app = document.getElementById('app')!
app.innerHTML = `
  <div id="topbar"><span id="badge"></span></div>
  <div id="board">
    <canvas id="main-canvas"></canvas>
    <canvas id="live-canvas"></canvas>
  </div>
  <div id="toolbar"></div>`
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

function setTool(next: ToolState): void {
  toolState = next
  renderToolBadge(badge, toolState.tool)
  const pk = popover.kind()
  if (pk && pk !== toolState.tool) popover.close() // e.g. side-button switched to an eraser
  toolbar.refresh()
}

const detector = new SideButtonDetector((g) => setTool(applySideGesture(toolState, g)))
const router = new InputRouter({ fingerDraw: () => settings.fingerDraw })

board.addEventListener('contextmenu', (e) => e.preventDefault())

const isPen = (t: Tool): t is PenKind => t === 'ink' || t === 'felt' || t === 'highlighter'

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
  if (isPen(t)) return { ...settings.pens[t], alpha: 1, pen: t }
  if (t === 'strokeEraser') return { color: '#e02020', size: 2 / vp.zoom, alpha: 1, pen: 'felt' }
  return { color: '#2060e0', size: 40 / vp.zoom, alpha: 0.35, pen: 'felt' }
}

/** Tool latched at strokeStart so a mid-stroke side-button change can't switch the action. */
let eraseSession: StrokeEraseSession | null = null
let areaSession: AreaEraseSession | null = null
const isShapeTool = (t: Tool): t is ShapeToolKind =>
  t === 'ellipse' || t === 'triangle' || t === 'rect' || t === 'arrow'

/** Text tool: screen start of a possible tap, and the open editor's finisher. */
let textDrag: { sx: number; sy: number } | null = null
let editing = false
let suppressTap = false

function startText(sx: number, sy: number): void {
  const [wx, wy] = toWorld(vp, sx, sy)
  const hit = doc
    .query({ minX: wx, minY: wy, maxX: wx, maxY: wy })
    .filter((o): o is TextObj => o.kind === 'text')
    .pop() ?? null
  if (hit) doc.remove(hit.id) // hide while the textarea stands in for it
  const at = hit ? toScreen(vp, hit.x, hit.y) : [sx, sy] as [number, number]
  const fs = hit?.fontSize ?? settings.textSize
  editing = true
  openTextEditor(
    board,
    at,
    hit,
    { fontSizePx: fs * vp.zoom, color: hit?.color ?? settings.textColor },
    (text) => {
      editing = false
      toolbar.refresh()
      const [x, y] = toWorld(vp, at[0], at[1])
      const c = textChange(hit, text, { x, y, color: settings.textColor, fontSize: settings.textSize })
      if (c) history.apply(c)
      else if (hit) doc.add(hit)
      toolbar.refresh()
    },
    () => {
      editing = false
      toolbar.refresh()
      if (hit) doc.add(hit)
    },
  )
}

/** Manual shape drag: world start point plus the tool latched at strokeStart. */
let shapeDrag: { tool: ShapeToolKind; a: [number, number] } | null = null

/** Shapes use the last pen's current style. */
function shapeStyle(): StrokeStyle {
  const pen = toolState.lastPen
  return { pen, color: settings.pens[pen].color, size: settings.pens[pen].size }
}

let current: { pen: PenKind; color: string; size: number; points: Pt[] } | null = null

/** World x/y of the current stroke, kept in step with current.points so each sample is O(1). */
let currentXY: [number, number][] = []

const snap = new SnapController((r) => {
  if (!current) return
  live.setPreview(r ? recognizedToObject(r, current) : null)
})

function commitCurrent(): void {
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
  const r = snap.current()
  snap.cancel()
  commitStroke(history, obj, r ? recognizedToObject(r, cur) : null)
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
  let sessionChanged = false
  for (const a of router.handle(re)) {
    if (a.kind === 'strokeStart' || a.kind === 'strokeEnd' || a.kind === 'strokeCancel') sessionChanged = true
    switch (a.kind) {
      case 'strokeStart': {
        if (editing) {
          // this tap only finishes the open edit
          ;(document.activeElement as HTMLElement | null)?.blur()
          suppressTap = true
          textDrag = null
          break
        }
        if (toolState.tool === 'text') {
          textDrag = { sx: a.x, sy: a.y }
          break
        }
        const s = styleFor()
        live.clear()
        const [wx, wy] = toWorld(vp, a.x, a.y)
        if (toolState.tool === 'areaEraser') {
          current = null
          eraseSession = null
          areaSession = new AreaEraseSession(doc, history)
          areaSession.move(wx, wy, settings.eraserRadius / vp.zoom)
          live.cursor(a.x, a.y, settings.eraserRadius)
          break
        }
        if (isShapeTool(toolState.tool)) {
          current = null
          eraseSession = null
          snap.cancel()
          shapeDrag = { tool: toolState.tool, a: [wx, wy] }
          live.begin(shapeStyle(), 1)
          break
        }
        live.begin({ pen: s.pen, color: s.color, size: s.size }, s.alpha)
        live.add(a.x, a.y, a.p)
        current = isPen(toolState.tool)
          ? { pen: s.pen, color: s.color, size: s.size, points: [[wx, wy, a.p]] }
          : null
        eraseSession = toolState.tool === 'strokeEraser' ? new StrokeEraseSession(doc, history) : null
        eraseSession?.move(wx, wy, 6 / vp.zoom)
        snap.cancel()
        currentXY = [[wx, wy]]
        if (current) snap.sample(a.x, a.y, ev.timeStamp, currentXY)
        break
      }
      case 'strokeMove': {
        if (textDrag || suppressTap) break
        if (shapeDrag) {
          const [wx, wy] = toWorld(vp, a.x, a.y)
          live.setPreview(dragToObject(shapeDrag.tool, shapeDrag.a, [wx, wy], shapeStyle()))
          break
        }
        if (areaSession) {
          const [wx, wy] = toWorld(vp, a.x, a.y)
          areaSession.move(wx, wy, settings.eraserRadius / vp.zoom)
          live.cursor(a.x, a.y, settings.eraserRadius)
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
          currentXY.push([wx, wy])
          snap.sample(a.x, a.y, ev.timeStamp, currentXY)
        }
        break
      }
      case 'strokeEnd': {
        if (suppressTap) {
          suppressTap = false
          break
        }
        if (textDrag) {
          const d = textDrag
          textDrag = null
          if (Math.hypot(a.x - d.sx, a.y - d.sy) < TAP_SLOP_PX) startText(d.sx, d.sy)
          break
        }
        if (shapeDrag) {
          const [wx, wy] = toWorld(vp, a.x, a.y)
          const obj = dragToObject(shapeDrag.tool, shapeDrag.a, [wx, wy], shapeStyle())
          shapeDrag = null
          if (obj) history.apply({ add: [obj], remove: [] })
          live.clear()
          break
        }
        if (areaSession) {
          const [wx, wy] = toWorld(vp, a.x, a.y)
          areaSession.move(wx, wy, settings.eraserRadius / vp.zoom)
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
        commitCurrent()
        live.clear()
        break
      }
      case 'strokeCancel':
        textDrag = null
        suppressTap = false
        shapeDrag = null
        areaSession?.end() // already-cut objects stay cut, so keep them undoable
        areaSession = null
        eraseSession?.end() // already-erased objects stay erased, so keep them undoable
        eraseSession = null
        current = null
        snap.cancel()
        live.clear()
        break
      case 'pan':
        setView(panBy(vp, a.dx, a.dy))
        break
      case 'zoom':
        setView(zoomAt(vp, a.cx, a.cy, a.factor))
        break
      case 'hover':
        if (toolState.tool === 'areaEraser') live.cursor(a.x, a.y, settings.eraserRadius)
        else live.clear()
        break
      default:
        break
    }
  }
  if (sessionChanged) toolbar.refresh()
}

/** True while any stroke / eraser / shape / text session is open; undo and redo are blocked then. */
const sessionActive = (): boolean =>
  !!(current || eraseSession || areaSession || shapeDrag || textDrag || editing)

function undoRedo(redo: boolean): void {
  if (sessionActive()) return
  if (redo) history.redo()
  else history.undo()
  renderer.requestDraw()
  toolbar.refresh()
}

const toolbarEl = document.getElementById('toolbar') as HTMLDivElement
const popover = mountPopover(app, toolbarEl, () => settings, settingsChanged)
const toolbar = mountToolbar(
  toolbarEl,
  () => toolState,
  (t) => {
    popover.close()
    setTool(selectTool(toolState, t))
  },
  () => undoRedo(false),
  () => undoRedo(true),
  {
    canUndo: () => history.canUndo() && !sessionActive(),
    canRedo: () => history.canRedo() && !sessionActive(),
    onActiveTap: (t, anchor) => {
      if (isPen(t) || t === 'text' || t === 'areaEraser') popover.open(t, anchor)
    },
    colorOf: (p) => settings.pens[p].color,
  },
)

for (const type of ['pointerdown', 'pointermove', 'pointerup', 'pointercancel', 'pointerleave'] as const) {
  board.addEventListener(type, (e) => {
    if ((e.target as HTMLElement).tagName === 'TEXTAREA') return // events inside the editor are the editor's
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
