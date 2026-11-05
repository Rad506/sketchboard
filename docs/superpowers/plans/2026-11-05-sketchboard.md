# Sketchboard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** An installable infinite-board drawing web app for Galaxy S25 Ultra + S Pen with three pens, side-button erasers, hold-to-snap shapes, text, named boards, auto-save and Share to Claude.

**Architecture:**
- **Pure core**: viewport math, board document, history, recognition, erasers, gesture state machines. Fully unit-tested.
- **Thin DOM/canvas shell** wired in `src/main.ts`.
- **Two canvases**: a main canvas for committed objects (culled, highlighters first) and a low-latency top canvas for the stroke in progress.
- **Storage**: IndexedDB, one record per object.

**Tech Stack:** Vite 5, TypeScript (strict), Vitest + jsdom + fake-indexeddb, `perfect-freehand`, `idb`, `vite-plugin-pwa`. GitHub Actions → GitHub Pages.

**Spec:** `docs/superpowers/specs/2026-11-05-sketchboard-design.md` (read it, especially §2 measured S Pen behaviour and §3.9 edge rules). Decisions: `docs/superpowers/decisions/sketchboard-decisions.md`. Pen logs/fixtures: `spike/pen-logs.md`.

## Global Constraints

- Project root: `C:\DIY Software\SH\sketchboard\`. Repo: `https://github.com/Rad506/sketchboard`. Served at `https://rad506.github.io/sketchboard/` → Vite `base: '/sketchboard/'`, PWA `scope` and `start_url` = `/sketchboard/`.
- Commits: Conventional Commits, casual and concise, **no Co-Authored-By / "Generated with" trailers** (Enrico's global rule).
- TDD for every module in `src/core`, `src/input`, `src/tools`, `src/storage` and `src/export`: write the test, watch it fail, make it pass.
- 1 world unit = 1 screen px at zoom 1. Zoom is clamped to **0.1–8**.
- Pen defaults:

  | Pen | Size range | Default size | Default colour |
  |---|---|---|---|
  | ink | 1–30 | 3 | `#000000` |
  | felt | 2–40 | 6 | `#1a2f6b` |
  | highlighter | 8–60 | 24 | `#ffe14d`, opacity 0.35, drawn under other ink |

- Text size range is 12–96 (default 24).
- Area eraser radius range is 5–80 screen px (default 20).
- Recent colours: max 8.
- Side button:
  - A press is the hover pointer reporting `buttons` 0→1 while `pressure === 0`.
  - A click is a press released within **600 ms**.
  - A double-click is a second click within **400 ms**.
  - Leaving or touching down mid-press cancels it.
- Stroke-eraser hit tolerance: **6 px ÷ zoom**.
- Hold-to-snap: still within **6 screen px** for **500 ms**. "Closed" means the start–end gap is less than **20 %** of the bbox diagonal. A circle is a perfect circle when the aspect ratio is within **0.85–1.15**. A rectangle is straightened when within **10°** and becomes a square when its sides are within **10 %**.
- History: max **100** steps per board, kept in memory only.
- Autosave: **500 ms** debounce, plus a flush on `visibilitychange` → hidden.
- Share PNG:
  - Whole board: content fitted with a **40 px** margin at **2×** scale, longest side capped at **4096 px**, white background.
  - Current view: device pixel ratio.
  - File name: `<board name> – <yyyy-mm-dd>.png`.
- UI copy, verbatim:
  - "Update ready – tap to reload"
  - "Nothing to share yet"
  - "Board is large — text may be small; try Current view"
  - "Not saving — storage unavailable"
  - "My first board"
  - "+ New board"
- `contextmenu` is always prevented on the board, and `touch-action: none` is set on it.

## Review Focus

1. **Single tap or dot strokes (1–2 points):** they render as a visible dot, the recognizer returns `null` without throwing, and the stroke eraser can hit them. Tests are in Tasks 6, 7 and 9.
2. **App hidden or `pointercancel` mid-stroke:** the stroke so far is committed and saved, and the router returns to idle (no stuck pen-down that blocks finger pan). Tests are in Tasks 3 and 14.
3. **Storage unavailable or quota error:** drawing keeps working in memory and the top bar shows "Not saving — storage unavailable". Test is in Task 14.
4. **Deleting the open board, deleting the last board, renaming to a blank name:** deleting the last board gives an empty list with "+ New board"; a blank rename keeps the old name. Tests are in Task 15.
5. **Area eraser leaving fragments with fewer than 2 points:** they are dropped, not stored as invisible objects. Test is in Task 8.

---

### Task 1: Scaffold, repo and Pages deploy with update prompt

**Files:**
- Create: `package.json`, `tsconfig.json`, `vite.config.ts`, `vitest.config.ts`, `index.html`, `src/main.ts`, `src/style.css`, `src/ui/updateBar.ts`, `public/icon-192.png`, `public/icon-512.png`, `.github/workflows/deploy.yml`, `.gitignore`
- Test: `tests/smoke.test.ts`

**Interfaces:**
- Produces: `showUpdateBar(onReload: () => void): void` in `src/ui/updateBar.ts`

- [ ] **Step 1: Check tooling.** Run `node -v` (need ≥ 20) and `git ls-remote https://github.com/Rad506/sketchboard`. Note whether the remote already has commits. If it does, `git pull` them first and keep their files.
- [ ] **Step 2: Initialise the repo.** In `sketchboard/`, run `git init -b main`, `git remote add origin https://github.com/Rad506/sketchboard.git`, and add a `.gitignore` covering `node_modules`, `dist` and `.env*`.
- [ ] **Step 3: Scaffold.**
  - Run `npm create vite@latest . -- --template vanilla-ts` (keep the existing `docs/` and `spike/`).
  - Install dev dependencies: `vitest jsdom fake-indexeddb vite-plugin-pwa`.
  - Install dependencies: `perfect-freehand idb`.
  - In `vite.config.ts`:
    - Set `base: '/sketchboard/'`.
    - Use `VitePWA({ registerType: 'prompt', manifest: { name: 'Sketchboard', short_name: 'Sketchboard', display: 'fullscreen', orientation: 'any', start_url: '/sketchboard/', scope: '/sketchboard/', background_color: '#ffffff', theme_color: '#ffffff', icons: [...] } })`.
  - In `vitest.config.ts`, use the `jsdom` environment.
  - In `index.html`, set the viewport meta with `user-scalable=no, viewport-fit=cover`.
- [ ] **Step 4: Write the failing smoke test** in `tests/smoke.test.ts`: `it('showUpdateBar renders the exact copy and calls onReload on tap')`. It calls `showUpdateBar(fn)`, then asserts `document.body.textContent` contains `"Update ready – tap to reload"`, clicks the bar, and expects `fn` to have been called once.
- [ ] **Step 5: Run `npx vitest run tests/smoke.test.ts`** and expect a FAIL (module missing).
- [ ] **Step 6: Implement `showUpdateBar`** as a fixed bottom bar, a single element, idempotent. In `main.ts`, wire `registerSW({ onNeedRefresh: () => showUpdateBar(() => updateSW(true)) })` from `virtual:pwa-register`.
- [ ] **Step 7: Run the test and expect a PASS.** Also run `npm run build` and expect `dist/` to contain `manifest.webmanifest` and `sw.js`.
- [ ] **Step 8: Add the deploy workflow.** `.github/workflows/deploy.yml` runs on push to `main`: `actions/checkout@v4` → `actions/setup-node@v4` (node 20) → `npm ci` → `npx vitest run` → `npm run build` → `actions/upload-pages-artifact@v3` (path `dist`) → `actions/deploy-pages@v4`, with `permissions: pages: write, id-token: write`.
- [ ] **Step 9: Commit and push.** Run `git add -A && git commit -m "chore: scaffold sketchboard pwa with pages deploy"` and then `git push -u origin main`. Ask Enrico to set **Settings → Pages → Source: GitHub Actions** once. Verify that the workflow run is green with `gh run list --repo Rad506/sketchboard --limit 1`.

### Task 2: Side-button detector and tool state

**Files:**
- Create: `src/input/sideButton.ts`, `src/core/toolState.ts`
- Test: `tests/input/sideButton.test.ts`, `tests/core/toolState.test.ts`

**Interfaces:**
- Produces:
  - `type PenSample = { type: 'pointerdown'|'pointermove'|'pointerup'|'pointercancel'|'pointerleave'; pointerId: number; pointerType: string; buttons: number; pressure: number; t: number }`
  - `class SideButtonDetector { constructor(onGesture: (g: 'single'|'double') => void); handle(s: PenSample): void }`. It uses `setTimeout` for the 400 ms single-click wait.
  - `type Tool = 'ink'|'felt'|'highlighter'|'strokeEraser'|'areaEraser'|'ellipse'|'triangle'|'rect'|'arrow'|'text'`
  - `type PenKind = 'ink'|'felt'|'highlighter'`
  - `interface ToolState { tool: Tool; lastPen: PenKind }`
  - `applySideGesture(s: ToolState, g: 'single'|'double'): ToolState`
  - `selectTool(s: ToolState, t: Tool): ToolState`

- [ ] **Step 1: Write the failing detector tests** (use `vi.useFakeTimers()`). Build the sample sequences from the v2 and v6 entries in `spike/pen-logs.md`, with hover pointer id 2:
  - `single click emits 'single' after 400ms`: buttons 1 at t=0, buttons 0 at t=250; advance 400 → `['single']`.
  - `double click emits 'double' once and no 'single'`: presses at 0–150 and 250–400 (the 13.34–13.82 trace) → `['double']`.
  - `press longer than 600ms emits nothing`: down at 0, up at 700 → `[]`.
  - `pointerleave mid-press cancels`: down, then leave → `[]`.
  - `tip contact (pressure>0, new pointerId) mid-press cancels` → `[]`.
  - `contact strokes with buttons=1 and pressure>0 are never presses`: pointerdown on id 9 with p 0.027 → `[]`.
- [ ] **Step 2: Run `npx vitest run tests/input`** and expect a FAIL.
- [ ] **Step 3: Implement `SideButtonDetector`.** Only hover samples (`pointerType==='pen' && pressure===0`) can start or end a press.
- [ ] **Step 4: Write the failing toolState tests:**
  - `single from ink → strokeEraser`
  - `single from strokeEraser → lastPen`
  - `double from felt → areaEraser`
  - `double from areaEraser → felt`
  - `single from areaEraser → strokeEraser`
  - `selectTool('highlighter') updates lastPen; selectTool('text') keeps lastPen`
- [ ] **Step 5: Implement the tool state and run `npx vitest run`.** Expect a PASS.
- [ ] **Step 6: Commit** with `feat: s pen side-button click detection and tool state`.

### Task 3: Viewport math and input router

**Files:**
- Create: `src/core/viewport.ts`, `src/input/router.ts`
- Test: `tests/core/viewport.test.ts`, `tests/input/router.test.ts`

**Interfaces:**
- Produces:
  - `interface Viewport { x: number; y: number; zoom: number }`. Here `screen = (world - {x,y}) * zoom`.
  - `toScreen(vp, wx, wy): [number, number]` and `toWorld(vp, sx, sy): [number, number]`
  - `zoomAt(vp, sx, sy, factor): Viewport`, clamped to 0.1–8 and keeping the world point under (sx, sy) fixed
  - `panBy(vp, dxScreen, dyScreen): Viewport`
  - `fitTo(b: BBox, w: number, h: number, margin: number): Viewport`
  - `interface BBox { minX: number; minY: number; maxX: number; maxY: number }` (exported from `src/core/types.ts`, created here)
  - `type RouterAction = {kind:'strokeStart'|'strokeMove'|'strokeEnd', x:number, y:number, p:number, t:number} | {kind:'strokeCancel'} | {kind:'hover', x:number, y:number} | {kind:'pan', dx:number, dy:number} | {kind:'zoom', cx:number, cy:number, factor:number}`
  - `class InputRouter { constructor(opts: { fingerDraw: () => boolean }); handle(e: RouterEvent): RouterAction[] }`. Here `RouterEvent = PenSample & { x: number; y: number }`; the router also accepts `pointerType 'touch'`.

- [ ] **Step 1: Write the failing viewport tests:**
  - `toWorld(toScreen(p)) round-trips`
  - `zoomAt keeps the pinch point fixed`
  - `zoomAt clamps to 0.1 and 8`
  - `fitTo centres the bbox with margin`
  - `toWorld stays accurate at x=1e6` (precision within 1e-6 relative)
- [ ] **Step 2: Run the tests (FAIL), implement, run them again (PASS).**
- [ ] **Step 3: Write the failing router tests:**
  - `pen contact emits strokeStart/Move/End`
  - `touches are ignored while the pen tip is down`
  - `two touches emit pan for midpoint movement and zoom for distance ratio`
  - `one touch does nothing when fingerDraw is false`
  - `fingerDraw: one touch draws; second finger landing emits strokeCancel then pan/zoom`
  - `pointercancel during pen stroke emits strokeEnd (keeps the stroke) and returns to idle`
  - `pen hover emits hover action`
- [ ] **Step 4: Implement `InputRouter`, run `npx vitest run`, and expect a PASS.**
- [ ] **Step 5: Commit** with `feat: viewport math and pointer input router`.

### Task 4: A1 milestone — bare app on the phone

**Files:**
- Create: `src/render/liveLayer.ts`, `src/ui/toolBadge.ts`
- Modify: `src/main.ts`, `src/style.css`

**Interfaces:**
- Consumes: `InputRouter`, `SideButtonDetector`, `applySideGesture`, `Viewport`.
- Produces:
  - `class LiveLayer { constructor(canvas: HTMLCanvasElement); begin(style: StrokeStyle): void; add(sx: number, sy: number, p: number): void; clear(): void }`. The canvas context is `getContext('2d', { desynchronized: true })`; if that returns null, retry without the option.
  - `type StrokeStyle = { pen: PenKind; color: string; size: number }`
  - `renderToolBadge(el: HTMLElement, tool: Tool): void`, which shows "Pen" / "Stroke eraser" / "Area eraser" plus the tool name for other tools.

- [ ] **Step 1: Build the shell.**
  - The page is full-screen: a board `<div>` with `touch-action:none`, two stacked canvases sized to `devicePixelRatio`, and a badge in the top bar.
  - Forward `pointerdown/move/up/cancel/leave` (using `getCoalescedEvents()` on move) to the router, and pen hover samples to the detector.
  - Draw a temporary plain polyline on the live layer: black for pens, red for strokeEraser, blue for areaEraser.
  - Prevent `contextmenu`.
- [ ] **Step 2: Build and run locally.** Run `npm run build && npx vite preview --host`, then open it in the desktop browser. Expect drawing with the mouse to work and the console to be clean.
- [ ] **Step 3: Commit and push** with `feat: a1 milestone shell with side-button tool switching`. Wait for the Pages deploy to go green.
- [ ] **Step 4: Gate (manual, Enrico).** Open `https://rad506.github.io/sketchboard/` in **Chrome** on the S25 Ultra and run "Add to Home screen". Check acceptance item A1 from the spec: single click 10/10, double-click 10/10, and no tool change on presses longer than 600 ms.
  - If it fails, record the observed behaviour in `spike/pen-logs.md` and the decisions log, and proceed with toolbar-only erasers (spec §3.9).

### Task 5: Board document and history

**Files:**
- Modify: `src/core/types.ts`
- Create: `src/core/board.ts`, `src/core/history.ts`, `src/core/geometry.ts`
- Test: `tests/core/board.test.ts`, `tests/core/history.test.ts`, `tests/core/geometry.test.ts`

**Interfaces:**
- Produces, in `types.ts`:
  - `type Pt = [number, number, number]` (x, y, pressure)
  - `type ObjBase = { id: string; createdAt: number; bbox: BBox }`
  - `type StrokeObj = ObjBase & { kind: 'stroke'; pen: PenKind; color: string; size: number; points: Pt[] }`
  - `type ShapeObj = ObjBase & { kind: 'shape'; shape: 'ellipse'|'rect'|'triangle'|'line'; pen: PenKind; color: string; size: number; ellipse?: { cx: number; cy: number; rx: number; ry: number }; vertices?: [number, number][] }`
  - `type ArrowObj = ObjBase & { kind: 'arrow'; from: [number, number]; to: [number, number]; pen: PenKind; color: string; size: number }`
  - `type TextObj = ObjBase & { kind: 'text'; x: number; y: number; text: string; color: string; fontSize: number }`
  - `type BoardObject = StrokeObj | ShapeObj | ArrowObj | TextObj`
- Produces, in `geometry.ts`:
  - `distPointSeg(px, py, ax, ay, bx, by): number`
  - `segCircle(ax, ay, bx, by, cx, cy, r): number[]` (the t values in [0, 1] where the segment crosses the circle, sorted)
  - `bboxOf(o: Omit<BoardObject, 'bbox'>): BBox`
  - `outlineOf(o: BoardObject): [number, number][][]` (polylines; an ellipse is sampled as 64 points; an arrow is shaft plus two barbs with length max(12, 4×size) at ±30°)
  - `newId(): string` (`crypto.randomUUID`)
- Produces, in `board.ts`: `class BoardDoc { add(o): void; remove(id): void; get(id): BoardObject | undefined; all(): BoardObject[]; query(b: BBox): BoardObject[]; onChange(cb: (added: BoardObject[], removedIds: string[]) => void): void }`. Its spatial grid has 256-unit cells.
- Produces, in `history.ts`:
  - `type Change = { add: BoardObject[]; remove: BoardObject[] }`
  - `class History { constructor(doc: BoardDoc, limit = 100); apply(c: Change): void; undo(): boolean; redo(): boolean; canUndo(): boolean; canRedo(): boolean }`. `apply` clears the redo stack.

- [ ] **Step 1: Write the failing tests:**
  - geometry:
    - `distPointSeg` on endpoint and perpendicular cases
    - `segCircle` returns two t values for a chord, one for a segment starting inside, none for a miss
    - `bboxOf` includes half the stroke size
    - `outlineOf(ellipse)` has 65 points (closed)
  - board:
    - `query returns only objects whose bbox intersects`
    - `remove drops from query`
  - history:
    - `undo reverts add+remove in one step`
    - `redo reapplies`
    - `101st apply drops the oldest`
    - `apply after undo clears redo`
- [ ] **Step 2: Run `npx vitest run tests/core` and expect a FAIL.**
- [ ] **Step 3: Implement all three modules, run the tests, and expect a PASS.**
- [ ] **Step 4: Commit** with `feat: board document, geometry helpers and undo history`.

### Task 6: Pen rendering and the main renderer

**Files:**
- Create: `src/render/pens.ts`, `src/render/renderer.ts`
- Modify: `src/render/liveLayer.ts`, `src/main.ts`
- Test: `tests/render/pens.test.ts`, `tests/render/renderer.test.ts`

**Interfaces:**
- Consumes: `BoardDoc.query`, `Viewport`, `outlineOf`.
- Produces:
  - `inkOutline(points: Pt[], size: number): [number, number][]` (perfect-freehand `getStroke` with `thinning: 0.6, smoothing: 0.5, streamline: 0.4, simulatePressure: false`, tapers on)
  - `drawObject(ctx: CanvasRenderingContext2D, o: BoardObject): void`, which works in world coordinates; the caller sets the transform
  - `renderOrder(objs: BoardObject[]): BoardObject[]` (highlighter-pen objects first, then the rest; each group keeps `createdAt` order)
  - `class Renderer { constructor(canvas, doc: BoardDoc); setViewport(vp: Viewport): void; requestDraw(): void }` (rAF-coalesced; draws only `doc.query(visibleWorldBBox)`)
- Pen looks:
  - Felt: constant `lineWidth=size`, round caps and joins, `shadowBlur = size*0.15` in the same colour.
  - Highlighter: `globalAlpha 0.35`, `lineCap 'butt'`, `lineJoin 'bevel'`.

- [ ] **Step 1: Write the failing tests:**
  - `inkOutline of a single point returns a closed dot polygon with ≥ 8 points` (Review Focus 1)
  - `inkOutline width grows with pressure`: compare the widths for p 0.2 and p 0.9 at the midpoint
  - `renderOrder puts highlighter strokes and highlighter shapes before ink, keeping createdAt order`
  - `Renderer draws only objects inside the view`: spy on `drawObject` with a doc of 3 objects, one of them off-screen → 2 calls
- [ ] **Step 2: Run them and expect a FAIL. Implement, run them again, and expect a PASS.**
- [ ] **Step 3: Wire the live layer.**
  - The live layer previews the in-progress stroke using the same pen looks.
  - On `strokeEnd`, build a `StrokeObj` (world coordinates via `toWorld`) and pass it to `history.apply({add: [obj], remove: []})`, then clear the live layer.
  - Pan and zoom actions update the viewport and call `requestDraw`.
- [ ] **Step 4: Smoke test with `npx vite preview --host`.** Draw with each pen through a temporary hidden key binding (1/2/3); the toolbar comes in Task 13. Pan and zoom should redraw crisply.
- [ ] **Step 5: Commit** with `feat: ink, felt and highlighter rendering with culled main canvas`.

### Task 7: Stroke eraser

**Files:**
- Create: `src/tools/strokeEraser.ts`
- Modify: `src/main.ts`
- Test: `tests/tools/strokeEraser.test.ts`

**Interfaces:**
- Consumes: `BoardDoc.query`, `outlineOf`, `distPointSeg`, `History.apply`.
- Produces:
  - `hitObjects(doc: BoardDoc, x: number, y: number, tolWorld: number): BoardObject[]`. A hit means the distance to the outline is ≤ `tolWorld + size/2`. Text counts as a hit when the point is inside its bbox expanded by `tolWorld`.
  - `class StrokeEraseSession { constructor(doc, history); move(x, y, tolWorld): void; end(): void }`. `move` removes hits from the doc immediately for feedback. `end` records one `Change` with every removed object, so undo restores all of them in one step.

- [ ] **Step 1: Write the failing tests:**
  - `hits a stroke within 6/zoom of its line at zoom 1 and 0.5`
  - `misses beyond tolerance`
  - `hits a single-point dot stroke` (Review Focus 1)
  - `hits arrow shafts and ellipse outlines but not the empty inside of a circle`
  - `hits text inside its box`
  - `one session = one undo step restoring all erased objects`
- [ ] **Step 2: Run them and expect a FAIL. Implement, run them again, and expect a PASS.**
- [ ] **Step 3: Wire it up.** When `tool==='strokeEraser'`, stroke actions drive a session with `tolWorld = 6 / vp.zoom`.
- [ ] **Step 4: Commit** with `feat: stroke eraser deletes whole objects`.

### Task 8: Area eraser

**Files:**
- Create: `src/tools/areaEraser.ts`
- Modify: `src/main.ts`, `src/render/liveLayer.ts` (circle cursor)
- Test: `tests/tools/areaEraser.test.ts`

**Interfaces:**
- Consumes: `segCircle`, `outlineOf`, `History`.
- Produces:
  - `cutPoints(points: Pt[], cx: number, cy: number, r: number): Pt[][]`. It splits at the circle crossings, inserts the boundary points with interpolated pressure, drops the parts inside, and drops pieces with fewer than 2 points.
  - `toStrokes(o: ShapeObj | ArrowObj): StrokeObj[]`. Each outline polyline becomes a stroke with pressure 0.5 and the same pen, colour and size.
  - `class AreaEraseSession { constructor(doc, history); move(x, y, rWorld): void; end(): void }`. On end it records one `Change` (the removed originals plus the added pieces). Text is ignored.

- [ ] **Step 1: Write the failing tests:**
  - `cutting the middle of a straight stroke yields two pieces whose new endpoints lie on the circle (±0.01)`
  - `pieces keep original pressure values; boundary pressure is interpolated`
  - `a stroke fully inside the circle is removed with no pieces`
  - `fragments under 2 points are dropped` (Review Focus 5)
  - `a circle shape cut once becomes stroke pieces`
  - `text objects are untouched`
  - `highlighter strokes are cut like others`
  - `one session is one undo step`
- [ ] **Step 2: Run them and expect a FAIL. Implement, run them again, and expect a PASS.**
- [ ] **Step 3: Wire it up.**
  - When `tool==='areaEraser'`, use `rWorld = radiusPx / vp.zoom` (default radius 20).
  - Draw the cursor circle on the live layer for hover and contact.
- [ ] **Step 4: Commit** with `feat: area eraser cuts strokes under a round cursor`.

### Task 9: Shape recognizer

**Files:**
- Create: `src/tools/recognize.ts`
- Test: `tests/tools/recognize.test.ts`, `tests/tools/fixtures.ts`

**Interfaces:**
- Produces:
  - `type Recognized = { shape: 'ellipse'; cx: number; cy: number; rx: number; ry: number } | { shape: 'rect' | 'triangle' | 'line'; vertices: [number, number][] } | { shape: 'arrow'; from: [number, number]; to: [number, number] }`
  - `recognize(pts: [number, number][]): Recognized | null`
- Approach:
  1. Return `null` when there are fewer than 3 points or the bbox diagonal is under 10.
  2. Run Ramer–Douglas–Peucker with ε = 4 % of the bbox diagonal.
  3. **Arrow test (runs first):** the longest RDP segment is at least 50 % of the path length. Its end is followed by a head: either one "›" (two segments of 10–40 % of the shaft length at 15–60° to the shaft, on opposite sides), or barb → back to the tip → barb. Result: `from` = shaft start, `to` = shaft end.
  4. Closed (gap < 20 % of the diagonal) with 3 corners → triangle.
  5. Closed with 4 corners → rect. Rotate it to the axes when the longest side is within 10° of horizontal or vertical. Equalise the sides when they are within 10 %.
  6. Closed otherwise, with the radius coefficient of variation < 0.25 → ellipse fitted to the bbox. Make rx = ry when the aspect ratio is within 0.85–1.15.
  7. Open with RDP giving 2 points, and every point within 4 % of the diagonal of the chord → line.
  8. Otherwise → `null`.
- `fixtures.ts` provides seeded-noise generators: `noisyCircle`, `noisyEllipse`, `noisyTriangle`, `noisyRect(angleDeg)`, `arrowChevron`, `arrowBarbs`, `noisyLine`, plus handwriting samples (`letterA`, `letterD`, `scribble`, `zigzag`, `openU`) with points written as literals.

- [ ] **Step 1: Write the failing tests.** Use seeded noise of ±3 % amplitude and run 5 seeds each, requiring at least 4/5 to pass (A4):
  - `recognizes circle → ellipse with rx===ry`
  - `recognizes 2:1 ellipse`
  - `triangle → 3 vertices`
  - `rect at 5° → axis-aligned 4 vertices`
  - `rect at 30° stays rotated`
  - `near-square → equal sides`
  - `chevron arrow → from/to within 5 % of the true shaft ends`
  - `barb-back-barb arrow → same`
  - `straight line → line`
  - `letterA / zigzag / scribble / openU → null`
  - `1-point and 2-point input → null` (Review Focus 1)
- [ ] **Step 2: Run them and expect a FAIL. Implement, iterate the thresholds within the spec values until they pass, then run them again (PASS).**
- [ ] **Step 3: Commit** with `feat: shape and arrow recognizer`.

### Task 10: Hold-to-snap

**Files:**
- Create: `src/tools/snapController.ts`
- Modify: `src/main.ts`, `src/render/liveLayer.ts` (preview a `BoardObject`)
- Test: `tests/tools/snapController.test.ts`

**Interfaces:**
- Consumes: `recognize`, `History`, `bboxOf`, `newId`.
- Produces:
  - `class SnapController { constructor(onPreview: (r: Recognized | null) => void); sample(sx: number, sy: number, t: number, worldPts: [number, number][]): void; current(): Recognized | null }`. The timer is driven by sample timestamps plus a `setTimeout` for when the pen stays perfectly still.
  - `recognizedToObject(r: Recognized, style: StrokeStyle): ShapeObj | ArrowObj`
  - `commitStroke(history, raw: StrokeObj, snapped: ShapeObj | ArrowObj | null): void`. When snapped, it applies `{add: [raw]}` then `{add: [snapped], remove: [raw]}`, so a single undo brings back the hand-drawn stroke.

- [ ] **Step 1: Write the failing tests** (fake timers):
  - `500ms still within 6px calls recognize on the whole stroke and previews`
  - `drift >6px restarts the timer`
  - `moving >6px after a preview cancels it (onPreview(null)) and drawing continues`
  - `no match → no preview`
  - `a lift without pause never snaps (a written 'O' stays a stroke)`
  - `commitStroke: undo once restores the raw stroke, undo twice removes it`
  - `snapped object keeps pen/color/size (highlighter circle stays highlighter)`
- [ ] **Step 2: Run them and expect a FAIL. Implement and wire it into the pen flow, then run them again (PASS).**
- [ ] **Step 3: Commit** with `feat: hold-to-snap shapes and arrows`.

### Task 11: Manual shape and arrow tools

**Files:**
- Create: `src/tools/shapeTool.ts`
- Modify: `src/main.ts`
- Test: `tests/tools/shapeTool.test.ts`

**Interfaces:**
- Produces: `dragToObject(tool: 'ellipse' | 'triangle' | 'rect' | 'arrow', a: [number, number], b: [number, number], style: StrokeStyle): ShapeObj | ArrowObj | null`. It returns null for drags under 4 world units. The style comes from `lastPen`'s settings.
  - Ellipse: inscribed in the drag box.
  - Triangle: apex at the top-centre, base along the bottom.
  - Rect: the drag box.
  - Arrow: from a to b.
- [ ] **Step 1: Write the failing tests** with exact geometry for each tool, the reversed-direction drag (b above-left of a), the tiny-drag null case, and `style uses the last pen`.
- [ ] **Step 2: Run them and expect a FAIL. Implement; the live layer previews during the drag, and the shape is committed on end. Run them again (PASS).**
- [ ] **Step 3: Commit** with `feat: manual circle, triangle, square and arrow tools`.

### Task 12: Text tool

**Files:**
- Create: `src/tools/textTool.ts`
- Modify: `src/main.ts`, `src/style.css`
- Test: `tests/tools/textTool.test.ts`

**Interfaces:**
- Produces:
  - `textChange(before: TextObj | null, text: string, base: { x: number; y: number; color: string; fontSize: number }): Change | null`. It returns null when nothing changed. An empty text removes `before` (or does nothing for a new box). An edit replaces the object.
  - `openTextEditor(boardEl: HTMLElement, screenPos: [number, number], initial: TextObj | null, onDone: (text: string) => void): void` (an absolutely positioned `<textarea>` that grows with its content; it finishes on blur or on a tap outside)
- [ ] **Step 1: Write the failing tests:**
  - `new text → add change`
  - `empty new text → null`
  - `edit → remove old + add new with same id`
  - `cleared existing text → remove`
  - `text bbox measured with fontSize × lines` (uses a monospace width estimate of 0.6 × fontSize per character; the real canvas measure happens at render)
- [ ] **Step 2: Run them and expect a FAIL. Implement and wire it up:** tapping with the text tool on an existing text edits it; otherwise it creates a new one. Run them again (PASS).
- [ ] **Step 3: Commit** with `feat: text tool`.

### Task 13: Toolbar, pen popover, colour wheel and tool settings

**Files:**
- Create: `src/ui/toolbar.ts`, `src/ui/penPopover.ts`, `src/ui/colorWheel.ts`, `src/core/settings.ts`
- Modify: `src/main.ts`, `src/style.css`
- Test: `tests/ui/colorWheel.test.ts`, `tests/core/settings.test.ts`, `tests/ui/toolbar.test.ts`

**Interfaces:**
- Produces:
  - `interface Settings { pens: Record<PenKind, { size: number; color: string }>; textColor: string; textSize: number; eraserRadius: number; fingerDraw: boolean; recent: string[] }`
  - `defaultSettings(): Settings`, with the values from Global Constraints
  - `clampSize(pen: PenKind, n: number): number`
  - `pushRecent(recent: string[], hex: string): string[]` (most recent first, no duplicates, max 8)
  - `hsvToHex(h, s, v): string` and `hexToHsv(hex): [number, number, number]`
  - `wheelPick(x: number, y: number, size: number): { kind: 'hue'; h: number } | { kind: 'sv'; s: number; v: number } | null` (hue ring plus the inner saturation/brightness square)
  - `mountToolbar(el: HTMLElement, getState: () => ToolState, onSelect: (t: Tool) => void, onUndo: () => void, onRedo: () => void): { refresh(): void }`
- Layout (spec §3.8):
  - The bottom floating toolbar holds Ink · Felt · Highlighter | Stroke eraser · Area eraser | Shapes ▾ · Arrow · Text | Undo · Redo.
  - Tapping the active pen opens the popover: a px slider with a live dot and number, the colour wheel, and recent swatches.
  - The area-eraser button also opens a radius slider (5–80).
- [ ] **Step 1: Write the failing tests:**
  - `defaults match spec`
  - `clampSize per pen range`
  - `pushRecent dedupes and caps at 8`
  - `hsv↔hex round-trip`
  - `wheelPick ring vs square vs outside`
  - `toolbar marks the active tool and disables Undo when !canUndo`
- [ ] **Step 2: Run them and expect a FAIL. Implement, run them again, and expect a PASS.** Remove the temporary key bindings from Task 6.
- [ ] **Step 3: Commit** with `feat: toolbar, pen settings popover and colour wheel`.

### Task 14: Storage and autosave

**Files:**
- Create: `src/storage/db.ts`, `src/storage/autosave.ts`
- Modify: `src/main.ts`
- Test: `tests/storage/db.test.ts`, `tests/storage/autosave.test.ts` (import `fake-indexeddb/auto`)

**Interfaces:**
- Produces:
  - `interface BoardMeta { id: string; name: string; createdAt: number; updatedAt: number; viewport: Viewport; thumbnail?: Blob; schema: 1 }`
  - `openDb(): Promise<Db>` (database `sketchboard`, version 1, stores `boards` (key `id`), `objects` (key `[boardId, id]`, index `boardId`) and `settings` (key `'settings'`); upgrades are forward-only migrations keyed by version)
  - `Db` methods:
    - `listBoards(): Promise<BoardMeta[]>`, sorted by `updatedAt` descending
    - `putBoard(m: BoardMeta): Promise<void>`
    - `deleteBoard(id): Promise<void>`, which also deletes its objects
    - `loadObjects(boardId): Promise<BoardObject[]>`
    - `writeChanges(boardId, added: BoardObject[], removedIds: string[]): Promise<void>`
    - `loadSettings(): Promise<Settings | undefined>` and `saveSettings(s: Settings): Promise<void>`
  - `class Autosave { constructor(db: Db | null, boardId: string, onStatus: (s: 'ok' | 'unavailable') => void); queue(added: BoardObject[], removedIds: string[]): void; flush(): Promise<void> }`. It debounces for 500 ms and merges queued changes (an add followed by a remove cancels out). `flush` runs on `visibilitychange` → hidden.
- [ ] **Step 1: Write the failing tests:**
  - `writeChanges then loadObjects round-trips`
  - `deleteBoard removes its objects only`
  - `autosave debounces 500ms and merges add+remove of same id to nothing`
  - `flush writes immediately`
  - `db failure (writeChanges rejects with QuotaExceededError) → onStatus('unavailable'), objects stay in memory, later success → 'ok'` (Review Focus 3)
  - `openDb throwing → Autosave(null) reports 'unavailable' and drawing still works`
  - `pointercancel mid-stroke + hidden → stroke is saved` (Review Focus 2; an integration test through router → history → autosave with a fake doc)
- [ ] **Step 2: Run them and expect a FAIL. Implement and wire `BoardDoc.onChange` → `Autosave.queue`.** The top bar shows "Not saving — storage unavailable" while the status is unavailable, and settings save on change. Run the tests again (PASS).
- [ ] **Step 3: Commit** with `feat: indexeddb storage with debounced autosave`.

### Task 15: Boards home, top bar and board menu

**Files:**
- Create: `src/ui/boardsHome.ts`, `src/ui/topBar.ts`, `src/ui/confirm.ts`, `src/core/boards.ts`
- Modify: `src/main.ts`, `src/style.css`
- Test: `tests/core/boards.test.ts`, `tests/ui/boardsHome.test.ts`

**Interfaces:**
- Consumes: `Db`, `fitTo`, `BoardDoc`.
- Produces:
  - `ensureFirstBoard(db): Promise<BoardMeta>`. It creates "My first board" when none exist and returns the most recent board.
  - `createBoard(db, name?: string): Promise<BoardMeta>` (the default name is "Board N", with the next free N)
  - `renameBoard(db, id, name): Promise<BoardMeta>`. The name is trimmed; a blank name keeps the old one.
  - `relativeTime(ms: number, now: number): string` ("just now", "5 min ago", "2 h ago", "3 d ago")
  - `makeThumbnail(doc: BoardDoc, w = 320, h = 200): Promise<Blob | null>`, which reuses `drawObject` and `fitTo` with a 16 px margin
  - `mountBoardsHome(el, db, onOpen: (id) => void): Promise<void>`
  - `confirmInApp(text: string, okLabel: string): Promise<boolean>` (an in-page dialog, never `window.confirm`)
- Behaviour:
  - Home is a list of boards (thumbnail, name, relative time) with a "+ New board" button.
  - The top bar has ← Boards, the board name (tap to go home), the tool badge, and ⋮ with Fit to content, Draw with finger (a checkmark), Rename, Delete and Share (Task 16).
  - The viewport is saved in `BoardMeta` on every pan or zoom (debounced 500 ms). The thumbnail is regenerated when you leave a board.
- [ ] **Step 1: Write the failing tests:**
  - `first launch creates "My first board"`
  - `createBoard names Board 2, Board 3`
  - `rename to "  " keeps old name` (Review Focus 4)
  - `deleting the open board returns to home` (with a stubbed `onOpen`/home callback)
  - `deleting the last board shows empty list with "+ New board"` (Review Focus 4)
  - `relativeTime buckets`
  - `reopening a board restores its saved viewport`
- [ ] **Step 2: Run them and expect a FAIL. Implement, run them again, and expect a PASS.**
- [ ] **Step 3: Commit** with `feat: named boards with home screen and board menu`.

### Task 16: Share to Claude

**Files:**
- Create: `src/export/sharePng.ts`
- Modify: `src/ui/topBar.ts`, `src/main.ts`
- Test: `tests/export/sharePng.test.ts`

**Interfaces:**
- Consumes: `BoardDoc`, `drawObject`, `renderOrder`, `Viewport`.
- Produces:
  - `exportRect(content: BBox | null, mode: 'whole' | 'view', vp: Viewport, screenW: number, screenH: number, dpr: number): { world: BBox; scale: number; pxW: number; pxH: number; capped: boolean } | null`. It returns null when `content` is null in whole mode. Whole mode: margin 40, scale 2, scaled down so that max(pxW, pxH) ≤ 4096, `capped` set when that happens. View mode: the visible world rectangle at `zoom × dpr`.
  - `shareFileName(boardName: string, d: Date): string` gives `"<name> – yyyy-mm-dd.png"`, with characters that are illegal in file names (`\/:*?"<>|`) replaced by `-`.
  - `renderPng(doc, rect): Promise<Blob>` (an OffscreenCanvas, or a canvas as fallback; white fill, then objects in `renderOrder`)
  - `shareOrDownload(blob: Blob, name: string): Promise<'shared' | 'downloaded' | 'cancelled'>`. It uses `navigator.canShare({ files: [file] })` → `navigator.share({ files: [file], title: name })`. An `AbortError` gives 'cancelled'. Otherwise it falls back to an `<a download>` link on a blob URL.
- Messages:
  - An empty board shows the toast "Nothing to share yet".
  - When capped, the toast "Board is large — text may be small; try Current view" shows before the share sheet opens.
- [ ] **Step 1: Write the failing tests:**
  - `whole: bbox 1000×500 → pxW 2160, pxH 1160, not capped`
  - `whole: bbox 5000×1000 → pxW 4096 and capped`
  - `view: visible rect equals screen/zoom and pxW = screenW×dpr`
  - `empty board whole → null`
  - `file name sanitised and dated`
  - `shareOrDownload uses share when canShare, falls back to download otherwise, returns 'cancelled' on AbortError` (with a stubbed `navigator`)
- [ ] **Step 2: Run them and expect a FAIL. Implement, add ⋮ → Share → Whole board / Current view, then run them again (PASS).**
- [ ] **Step 3: Commit and push** with `feat: share board as png to claude via share sheet`. Wait for the deploy to go green.

### Task 17: Acceptance on the phone

**Files:**
- Create: `docs/acceptance/2026-11-xx-v1.md` (results)

- [ ] **Step 1: Run the full suite.** `npx vitest run` should show all tests passing, and `npm run build` should succeed.
- [ ] **Step 2: Enrico runs A1–A7 from spec §5** on the installed app in Chrome. For A3, add a hidden `?stress=2000` query flag that seeds 2,000 random strokes of 50–300 points into a new board named "Stress test".
- [ ] **Step 3: Record pass/fail per item** in the results file. Failures become `fix:` tasks through superpowers:systematic-debugging.
- [ ] **Step 4: Commit** with `docs: v1 acceptance results`.
