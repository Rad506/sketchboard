import './style.css'
import { registerSW } from 'virtual:pwa-register'
import { showUpdateBar } from './ui/updateBar'
import { renderToolBadge } from './ui/toolBadge'
import { LiveLayer, type StrokeStyle } from './render/liveLayer'
import { InputRouter, type RouterAction, type RouterEvent } from './input/router'
import { SideButtonDetector, type PenSample } from './input/sideButton'
import { applySideGesture, selectTool, type PenKind, type Tool, type ToolState } from './core/toolState'
import { BoardDoc } from './core/board'
import { History } from './core/history'
import { bboxOf, newId } from './core/geometry'
import { fitTo, panBy, toScreen, toWorld, zoomAt, type Viewport } from './core/viewport'
import type { Pt, StrokeObj, TextObj } from './core/types'
import { Renderer } from './render/renderer'
import { StrokeEraseSession } from './tools/strokeEraser'
import { AreaEraseSession } from './tools/areaEraser'
import { dragToObject, type ShapeToolKind } from './tools/shapeTool'
import { textChange, openTextEditor } from './tools/textTool'
import { applyLoadedSettings, defaultSettings } from './core/settings'
import { openDb, type BoardMeta, type Db } from './storage/db'
import { Autosave, wireAutosave } from './storage/autosave'
import { mountToolbar } from './ui/toolbar'
import { mountPopover } from './ui/penPopover'
import { mountTopBar, type MenuItem } from './ui/topBar'
import { mountBoardsHome } from './ui/boardsHome'
import { confirmInApp, promptInApp } from './ui/confirm'
import {
  contentBounds,
  createBoard,
  deleteBoardFlow,
  ensureFirstBoard,
  makeThumbnail,
  openBoardData,
  renameBoard,
  saveViewport,
} from './core/boards'
import { exportRect, renderPng, shareFileName, shareOrDownload } from './export/sharePng'
import { chooseShareMode } from './ui/shareSheet'
import { showToast } from './ui/toast'
import { seedStressStrokes } from './core/stress'
import { SelectionController } from './tools/selectionController'
import { screenBox } from './tools/lasso'
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
  <div id="topbar"><span id="badge"></span><span id="save-status" hidden>Not saving — storage unavailable</span></div>
  <div id="home"></div>
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
let doc = new BoardDoc()
let history = new History(doc)
let sel = new SelectionController(doc, (c) => history.apply(c))
let toolState: ToolState = { tool: 'ink', lastPen: 'ink' }
const renderer = new Renderer(mainCanvas, doc)
let vp: Viewport = { x: 0, y: 0, zoom: 1 }

function setView(next: Viewport, persist = true): void {
  vp = next
  live.setViewport(vp)
  renderer.setViewport(vp)
  if (persist) scheduleViewportSave()
  if (toolState.tool === 'lasso' && (sel.active || sel.busy)) redrawSelection()
}

/** Sync the lasso overlay (loop, dragged preview, box + handles) and which objects the main canvas hides. */
function redrawSelection(): void {
  renderer.setHidden(sel.hidden)
  const b = sel.bounds()
  if (sel.loop === null && !sel.active && !sel.busy) {
    live.clear()
    return
  }
  live.drawSelection({ loop: sel.loop, preview: sel.preview, box: b ? screenBox(b, vp) : null })
}

/** Drop any selection and its overlay (tool change, undo/redo, board switch, app hidden). */
function clearSelection(): void {
  const had = sel.active || sel.busy || sel.loop !== null
  sel.cancel()
  sel.clear()
  if (had) redrawSelection()
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
  if (toolState.tool === 'lasso' && (sel.active || sel.busy)) redrawSelection()
}
window.addEventListener('resize', resize)
window.addEventListener('orientationchange', resize)
resize()

renderToolBadge(badge, toolState.tool)

function setTool(next: ToolState): void {
  if (next.tool !== toolState.tool) clearSelection()
  toolState = next
  renderToolBadge(badge, toolState.tool)
  const pk = popover.kind()
  if (pk && pk !== toolState.tool) popover.close() // e.g. side-button switched to an eraser
  toolbar.refresh()
}

const detector = new SideButtonDetector((g) => setTool(applySideGesture(toolState, g)))
const router = new InputRouter({
  fingerDraw: () => settings.fingerDraw,
  claimTouch: (x, y) => toolState.tool === 'lasso' && sel.hits(x, y, vp),
})

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

/** Pen sizes are board px: an 8 px pen always draws an 8 px line on the board, which looks thicker or thinner as you zoom. Eraser previews are screen px, so they divide by zoom. */
function styleFor(): { color: string; size: number; alpha: number; pen: PenKind } {
  const t = toolState.tool
  if (isPen(t)) return { color: settings.pens[t].color, size: settings.pens[t].size, alpha: 1, pen: t }
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
let commitOpenEdit: (() => void) | null = null
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
  const handle = openTextEditor(
    board,
    at,
    hit,
    { fontSizePx: fs * vp.zoom, color: hit?.color ?? settings.textColor },
    (text) => {
      editing = false
      commitOpenEdit = null
      toolbar.refresh()
      const [x, y] = toWorld(vp, at[0], at[1])
      const c = textChange(hit, text, { x, y, color: settings.textColor, fontSize: settings.textSize })
      if (c) history.apply(c)
      else if (hit) doc.add(hit)
      toolbar.refresh()
    },
    () => {
      editing = false
      commitOpenEdit = null
      toolbar.refresh()
      if (hit) doc.add(hit)
    },
  )
  commitOpenEdit = () => handle.commit()
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
  applyActions(router.handle(re))
}

/** Live-layer clear scheduled after the next committed draw is dropped if a newer stroke has started since. */
let liveEpoch = 0
/** On lift the committed stroke only appears at the next frame, so clear the live layer after that draw to avoid a blink. */
function clearLiveAfterDraw(): void {
  const epoch = liveEpoch
  renderer.requestDraw(() => {
    if (epoch === liveEpoch) live.clear()
  })
}

function applyActions(actions: RouterAction[]): void {
  let sessionChanged = false
  for (const a of actions) {
    if (a.kind === 'strokeStart' || a.kind === 'strokeEnd' || a.kind === 'strokeCancel') sessionChanged = true
    if (toolState.tool === 'lasso') {
      if (a.kind === 'strokeStart') {
        if (editing) {
          ;(document.activeElement as HTMLElement | null)?.blur()
        } else {
          liveEpoch++
          const [wx, wy] = toWorld(vp, a.x, a.y)
          sel.down(wx, wy, a.x, a.y, vp)
          redrawSelection()
        }
        continue
      }
      if (a.kind === 'strokeMove') {
        const [wx, wy] = toWorld(vp, a.x, a.y)
        sel.move(wx, wy)
        redrawSelection()
        continue
      }
      if (a.kind === 'strokeEnd') {
        const committing = sel.preview.length > 0
        sel.up(vp)
        if (committing) {
          // history.apply only schedules the main redraw: keep the live preview up until that frame has painted
          renderer.setHidden(sel.hidden)
          const epoch = liveEpoch
          renderer.requestDraw(() => {
            if (epoch === liveEpoch) redrawSelection()
          })
        } else redrawSelection()
        continue
      }
      if (a.kind === 'strokeCancel') {
        sel.cancel()
        redrawSelection()
        continue
      }
      if (a.kind === 'hover') continue // keep the selection overlay on screen
    }
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
        liveEpoch++
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
        if (current) snap.sample(a.x, a.y, a.t, currentXY)
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
          snap.sample(a.x, a.y, a.t, currentXY)
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
          clearLiveAfterDraw()
          break
        }
        if (areaSession) {
          const [wx, wy] = toWorld(vp, a.x, a.y)
          areaSession.move(wx, wy, settings.eraserRadius / vp.zoom)
          areaSession.end()
          areaSession = null
          clearLiveAfterDraw()
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
        clearLiveAfterDraw()
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
  !!(current || eraseSession || areaSession || shapeDrag || textDrag || editing || sel.busy)

function undoRedo(redo: boolean): void {
  if (sessionActive()) return
  clearSelection()
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

/**
 * Android can hide the app mid-stroke without a pointercancel. Finish the open stroke / erase / shape
 * session exactly like a pen-up (so it is committed and autosaved) and reset the router so no pen stays "down".
 * Registered before the autosave listeners, so the commit lands before they flush.
 */
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState !== 'hidden') return
  textDrag = null // a text tap cut short by hiding must not pop an editor open
  sel.cancel()
  applyActions(router.reset())
  clearSelection()
})

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

/**
 * Storage and boards. Start-up opens the most recently edited board; the home screen is
 * reached via "← Boards" / tapping the name. Each board gets a fresh BoardDoc + History +
 * Autosave, and the renderer is re-pointed, so nothing leaks across boards. If storage is
 * unavailable the app still draws on a scratch board.
 */
const saveStatus = document.getElementById('save-status') as HTMLElement
const homeEl = document.getElementById('home') as HTMLDivElement
const showStatus = (s: 'ok' | 'unavailable'): void => {
  saveStatus.hidden = s === 'ok'
}

let db: Db | null = null
let active: { meta: BoardMeta; autosave: Autosave; unwire: () => void } | null = null
/** True while switching boards, so a double tap can't interleave two switches. */
let busy = false

/** Viewport saves are debounced 500 ms and don't bump updatedAt (the home list orders by real edits). */
let vpTimer: ReturnType<typeof setTimeout> | null = null
function scheduleViewportSave(): void {
  if (!db || !active) return
  if (vpTimer) clearTimeout(vpTimer)
  vpTimer = setTimeout(flushViewportSave, 500)
}
function flushViewportSave(): void {
  if (vpTimer) clearTimeout(vpTimer)
  vpTimer = null
  if (!db || !active) return
  saveViewport(db, active.meta.id, vp).catch(() => showStatus('unavailable'))
}

function resetSessions(): void {
  textDrag = null
  suppressTap = false
  shapeDrag = null
  areaSession = null
  eraseSession = null
  current = null
  snap.cancel()
  sel.cancel()
  sel.clear()
  renderer.setHidden(sel.hidden)
  live.clear()
}

const showView = (v: 'home' | 'board' | 'boot'): void => {
  app.dataset.view = v
  if (v === 'board') resize()
}
showView('boot')

const topbar = mountTopBar(document.getElementById('topbar')!, { onHome: () => void showHome(), items: () => menuItems() })

/** Finish edits, flush autosave, save viewport + thumbnail, then drop per-board state. */
async function leaveBoard(): Promise<void> {
  const a = active
  if (!a || !db) return
  commitOpenEdit?.() // a text being edited is out of the doc; finish it so it's saved
  popover.close()
  topbar.closeMenu()
  resetSessions()
  active = null
  a.unwire()
  if (vpTimer) clearTimeout(vpTimer)
  vpTimer = null
  try {
    await a.autosave.flush()
    const thumb = await makeThumbnail(doc).catch(() => null)
    const empty = doc.all().length === 0
    await db.patchBoard(a.meta.id, { viewport: vp, ...(thumb || empty ? { thumbnail: thumb ?? undefined } : {}) })
  } catch {
    showStatus('unavailable')
  }
}

/**
 * Android Back: opening a board pushes one history entry; Back pops it and lands on home.
 * Leaving through the UI pops the entry itself (silently) so Back on home behaves normally.
 */
let boardEntry = false
let silentPops = 0
function pushBoardEntry(): void {
  if (boardEntry) return
  try {
    window.history.pushState({ sketchboard: 'board' }, '')
    boardEntry = true
  } catch {
    // history unavailable: Back just behaves as before
  }
}
function popBoardEntry(): void {
  if (!boardEntry) return
  boardEntry = false
  silentPops++
  window.history.back()
}
window.addEventListener('popstate', () => {
  if (silentPops > 0) {
    silentPops--
    return
  }
  boardEntry = false
  if (app.dataset.view === 'board' && active) void showHome()
})

async function showHome(): Promise<void> {
  if (!db || busy) return
  busy = true
  try {
    await leaveBoard()
    popBoardEntry()
    showView('home')
    await mountBoardsHome(
      homeEl,
      db,
      (id) => {
        void openBoard(id).then((ok) => {
          if (!ok) void showHome()
        })
      },
      () => showStatus('unavailable'),
    )
  } catch {
    showStatus('unavailable')
  } finally {
    busy = false
  }
}

async function openBoard(id: string): Promise<boolean> {
  if (!db || busy) return false
  busy = true
  try {
    await leaveBoard()
    const { meta, objects } = await openBoardData(db, id)
    doc = new BoardDoc()
    for (const o of objects) doc.add(o) // load first, THEN subscribe autosave, so loading doesn't re-save everything
    history = new History(doc)
    sel = new SelectionController(doc, (c) => history.apply(c))
    renderer.setHidden(sel.hidden)
    renderer.setDoc(doc)
    const autosave = new Autosave(db, meta.id, showStatus, objects.map((o) => o.id))
    const unwire = wireAutosave(doc, autosave, () => commitOpenEdit?.())
    active = { meta, autosave, unwire }
    topbar.setName(meta.name)
    showView('board')
    pushBoardEntry()
    setView(meta.viewport, false)
    toolbar.refresh()
    return true
  } catch {
    return false
  } finally {
    busy = false
  }
}

function fitContent(): void {
  const b = contentBounds(doc)
  if (!b) return
  setView(fitTo(b, board.clientWidth, board.clientHeight, 40))
}

async function renameCurrent(): Promise<void> {
  const a = active
  if (!db || !a) return
  const v = await promptInApp('Rename board', a.meta.name, 'Rename')
  if (v === null) return
  try {
    a.meta = await renameBoard(db, a.meta.id, v)
    topbar.setName(a.meta.name)
  } catch {
    showStatus('unavailable')
  }
}

async function deleteCurrent(): Promise<void> {
  const a = active
  if (!db || !a) return
  try {
    await deleteBoardFlow(db, a.meta, confirmInApp, () => void showHome(), async () => {
      commitOpenEdit?.()
      a.unwire()
      await a.autosave.dispose() // no late write may recreate the deleted board's objects
      if (vpTimer) clearTimeout(vpTimer)
      vpTimer = null
      resetSessions()
      active = null
    })
  } catch {
    showStatus('unavailable')
    void showHome()
  }
}

async function shareBoard(): Promise<void> {
  commitOpenEdit?.()
  if (doc.all().length === 0) {
    showToast('Nothing to share yet')
    return
  }
  const mode = await chooseShareMode()
  if (!mode) return
  const dpr = window.devicePixelRatio || 1
  const rect = exportRect(contentBounds(doc), mode, vp, board.clientWidth, board.clientHeight, dpr)
  if (!rect) {
    showToast('Nothing to share yet')
    return
  }
  try {
    const blob = await renderPng(doc, rect)
    if (rect.capped) showToast('Board is large — text may be small; try Current view', 4000)
    const name = shareFileName(active?.meta.name ?? 'Sketchboard', new Date())
    const how = await shareOrDownload(blob, name)
    if (how === 'downloaded') showToast('Saved to Downloads')
  } catch {
    showToast('Could not create the image')
  }
}

function menuItems(): MenuItem[] {
  const items: MenuItem[] = [
    { label: 'Fit to content', onSelect: fitContent },
    {
      label: 'Draw with finger',
      checked: settings.fingerDraw,
      onSelect: () => {
        settings.fingerDraw = !settings.fingerDraw
        settingsChanged()
      },
    },
  ]
  if (db && active) {
    items.push({ label: 'Rename', onSelect: () => void renameCurrent() })
    items.push({ label: 'Delete', danger: true, onSelect: () => void deleteCurrent() })
  }
  items.push({ label: 'Share', onSelect: () => void shareBoard() })
  return items
}

function noStorage(): void {
  new Autosave(null, '', showStatus)
  topbar.setName('Sketchboard')
  topbar.setHomeEnabled(false)
  showView('board')
}

/** `?stress=2000` seeds that many random strokes into a new "Stress test" board (for perf checks on the phone). */
function stressCount(): number {
  const n = Number.parseInt(new URLSearchParams(location.search).get('stress') ?? '', 10)
  return Number.isFinite(n) && n > 0 ? Math.min(n, 50_000) : 0
}

async function seedStressBoard(d: Db, n: number): Promise<string> {
  const meta = await createBoard(d, 'Stress test')
  await d.writeChanges(meta.id, seedStressStrokes(n, Date.now() & 0xffff), [])
  try {
    const url = new URL(location.href)
    url.searchParams.delete('stress')
    window.history.replaceState(null, '', url) // a reload must not seed a second board
  } catch {
    // ignore
  }
  return meta.id
}

async function initStorage(): Promise<void> {
  try {
    db = await openDb()
  } catch {
    db = null
    noStorage()
    return
  }
  void navigator.storage?.persist?.() // ask the browser not to evict our boards under storage pressure
  try {
    applyLoadedSettings(settings, await db.loadSettings())
    toolbar.refresh()
  } catch {
    // keep defaults
  }

  let settingsTimer: ReturnType<typeof setTimeout> | null = null
  const saveSettingsNow = (): void => {
    if (settingsTimer) clearTimeout(settingsTimer)
    settingsTimer = null
    db?.saveSettings(structuredClone(settings)).catch(() => showStatus('unavailable'))
  }
  onSettingsChange(() => {
    if (settingsTimer) clearTimeout(settingsTimer)
    settingsTimer = setTimeout(saveSettingsNow, 500)
  })
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState !== 'hidden') return
    if (settingsTimer) saveSettingsNow()
    if (vpTimer) flushViewportSave()
  })

  let opened = false
  try {
    const stress = stressCount()
    if (stress) {
      opened = await openBoard(await seedStressBoard(db, stress))
      if (opened) fitContent()
    }
    if (!opened) opened = await openBoard((await ensureFirstBoard(db)).id)
  } catch {
    opened = false
  }
  if (!opened) {
    db = null
    noStorage()
  }
}
void initStorage()
