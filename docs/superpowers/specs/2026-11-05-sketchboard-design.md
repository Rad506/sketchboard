# Sketchboard — design

Status: **approved by Enrico** · 2026-11-05
Decisions log: `docs/superpowers/decisions/sketchboard-decisions.md` (🟢 = my call, 🟡 = my call, please sanity-check, ✅ = Enrico's call)

## 1. What and why

Sketchboard is a personal drawing app for Enrico's **Galaxy S25 Ultra with its S Pen**. It works like a near-infinite sheet of paper, the way Miro does, and inks like Samsung Notes. Enrico should be able to jot, sketch and diagram freely, and the app should clean up rough shapes for him.

Success means opening it from the home screen, drawing straight away with no lag, erasing with the S Pen side button without reaching for a toolbar, and having rough circles, squares, triangles and arrows snap clean when he asks for it.

### Goals (v1)
1. Infinite board: pan and zoom freely with nothing hitting an edge.
2. Three pens: **ink pen**, **felt pen** and **highlighter**. Each has its own size in px and its own colour, chosen from a colour wheel.
3. S Pen side-button erasers:
   - **Stroke eraser** deletes whole objects, meaning everything from pen-down to pen-up.
   - **Area eraser** works like Paint and erases under a round cursor.
4. Manual tools: **circle, triangle, square, arrow, text**.
5. **Hold to snap**: hold the pen still at the end of a hand-drawn circle, triangle, square or arrow and it becomes a clean shape.
6. **Boards** ("environments"): several named boards, each with its own contents and last view position.
7. Everything saves on the phone automatically, with undo and redo.
8. **Share to Claude:** export a board as an image Claude can view and discuss. ✅

### Non-goals (v1)
- No sync across devices, sharing, collaboration or accounts.
- No PDF export, no importing images, no layers. PNG export exists only through Share (3.10).
- No select / move / resize of existing objects. Erase and redraw instead. This is the first candidate for v2.
- No handwriting-to-text.

### Anti-goals (a failure even if it technically works)
- Ink that lags behind the pen, or lines that look jagged or blobby.
- Erasing things by accident.
- Handwriting (an "O", a "D") turning into shapes on its own.
- Losing a drawing after the app is closed, the phone restarts or the app updates.

## 2. Constraints

- **Device:** Galaxy S25 Ultra, built-in S Pen. The S Pen has no Bluetooth, so the side button is only readable while the pen hovers near the screen. ✅
- **Platform:** installable web app (PWA). You open it in Chrome, tap "Add to Home screen", and it runs full-screen and offline. 🟢
- **Hosting:** GitHub Pages from the repo https://github.com/Rad506/sketchboard, served at `https://rad506.github.io/sketchboard/`, so the PWA scope and base path are `/sketchboard/`. ✅
- **Method:** test-first (Vitest) for all logic: geometry, recognition, erasing, gestures, storage. 🟡
- **Measured S Pen behaviour** (test page v1–v6, run in the Android WebView inside the Claude app, Chromium 156):
  - When the tip touches, a new `pointerId` arrives with `pointerType "pen"`, `pressure > 0` (about 50 distinct levels) and `buttons = 1`.
  - Hovering arrives on its own pointer, with `pressure = 0` and `buttons = 0`.
  - **Side button pressed while hovering:** the hover pointer reports `buttons = 1` and `pressure = 0`.
  - **Side button held while touching:** this can't be told apart from hovering with the button held. No `pointerdown` arrives and pressure stays 0. **So the button can only be used as a click-in-the-air signal.**
  - `contextmenu` fires after about 0.6 s on any touch, so the app must suppress it and must not rely on it.
  - None of this has been tested in standalone Chrome yet. The first deployed build must repeat the v6 checks there (acceptance item A1).

## 3. How it behaves

### 3.1 Board and navigation
- The S Pen draws. **Two fingers** pan and pinch-zoom. One finger does nothing, which protects against the palm, unless "Draw with finger" is switched on. In that mode one finger draws and two fingers still pan and zoom. 🟡
- Zoom in up to 800 %; zoom out is practically unlimited (Enrico, 2026-11-06). Zoom is centred on the pinch point. ✅
- A "fit to content" button sits in the board menu, so it's hard to get lost. 🟢
- Coordinates are world units, and **1 world unit = 1 screen px at 100 % zoom**. Pen and text sizes are **board px**: an 8 px pen always makes an 8 px line on the board, whatever the zoom; it simply looks thicker zoomed in and thinner zoomed out (Enrico, 2026-11-06). ✅

### 3.2 Pens

| Pen | Look | Size range (px) | Default |
|---|---|---|---|
| Ink pen | Width follows S Pen pressure, smooth tapered ends | 1–30 | 3 px, black |
| Felt pen | Even width, slightly soft edge, no pressure | 2–40 | 6 px, dark blue |
| Highlighter | Flat chisel end, about 35 % opacity, always drawn **under** the other ink | 8–60 | 24 px, yellow |

- Tapping the active pen again opens its settings popover: a **px size slider** with a live preview dot and number, plus a **colour wheel** (hue ring + saturation/brightness square) with the 8 most recent colours. 🟢
- Each pen remembers its own size and colour across sessions. These settings are shared by all boards. 🟡
- Strokes are vector objects, so they stay crisp at any zoom. 🟢

### 3.3 S Pen side button (replaces the original "click and hold" idea; see decisions 8a–8c)
- **One click** of the side button in the air switches to the **Stroke eraser**.
- **A double-click** (two clicks within 400 ms) switches to the **Area eraser**.
- **The same gesture again** switches back to the **pen that was active before**.
- Pressing for longer than 600 ms is ignored. In the v6 test Enrico produced several of these out of habit, and none of them changed the tool.
- Erasing only happens **with the tip on the glass**.
- A badge always shows the current tool (Pen / Stroke eraser / Area eraser).
- The toolbar has the same two eraser buttons for finger use.
- **Stroke eraser:** any object whose drawn outline the tip passes within (6 px ÷ zoom) of is deleted whole. That covers strokes, shapes, arrows and text boxes. One erase gesture is one undo step. 🟢
- **Area eraser:** a circle cursor (default 20 px screen radius, adjustable 5–80) shows where it acts. It cuts strokes, so the parts of a stroke inside the circle disappear and the rest stays as separate strokes. Snapped shapes and arrows are turned into plain strokes the moment they are first cut. Text boxes are **not** affected; delete them with the stroke eraser. 🟡

### 3.4 Hold to snap ✅
- While drawing with a pen, if the tip **stays within 6 screen px for 500 ms**, the stroke is checked. If it matches a shape, a clean preview replaces it immediately. Lifting the pen keeps the clean shape. Lifting without a pause keeps the hand-drawn stroke.
- Recognised shapes:
  - **Circle / ellipse:** closed and roundish. It becomes a perfect circle when the width-to-height ratio is within 0.85–1.15. 🟡
  - **Triangle:** closed with 3 corners.
  - **Rectangle / square:** closed with 4 corners, straightened to horizontal when within 10°. It becomes a square when the sides are within 10 %. 🟡
  - **Arrow:** one open stroke made of a long shaft plus a head at its end, drawn in one go. Two styles must work: shaft then "›" back-and-forth, and shaft then one barb, back to the tip, then the other barb. It becomes a straight arrow from the shaft start to the tip. 🟡
  - **Straight line:** an open stroke that is nearly straight. Not requested; included because it costs nothing and Samsung Notes does it. 🟡
- If nothing matches, nothing happens and drawing continues.
- The snapped shape keeps the pen, colour and size it was drawn with. A highlighter circle stays a highlighter circle.
- **Undo once** after a snap brings back the hand-drawn stroke.

### 3.5 Manual tools
- **Shape tool (circle / triangle / square):** drag a box and the shape fills it. 🟢
- **Arrow tool:** drag from the start point to the tip. 🟢
- Shapes and arrows use the colour and size of the **last used pen**, outline only. 🟡
- **Text tool:** tap the board to open a text box with the keyboard. Tap outside to finish. Tap an existing text with the text tool to edit it. Text has its own colour and a size of 12–96 px. An empty text box is removed. 🟢

### 3.6 Boards ✅ (the details are 🟡)
- **Home screen:** a list of boards showing name, a small preview thumbnail and "edited 2 h ago", plus **+ New board**.
- Each board can be renamed and deleted. Deleting asks for confirmation in the app itself.
- Each board remembers its last pan/zoom and opens where it was left.
- The board name shows in the top bar. Tapping it returns to the home screen.
- The very first launch creates a board called "My first board".

### 3.7 Saving and undo
- Saves automatically to on-device storage (IndexedDB) about 0.5 s after any change, and immediately when the app is hidden. 🟢
- Undo/redo works per board and keeps up to 100 steps. Undo history is lost when the app is closed; the drawing is not. 🟡
- Tool settings (pens, sizes, colours, finger-draw) are saved separately. 🟢

### 3.8 Layout
- A floating toolbar sits at the bottom within thumb reach: Ink · Felt · Highlighter | Stroke eraser · Area eraser | Shapes ▾ (circle / triangle / square) · Arrow · Text | Undo · Redo.
- A slim top bar shows ← Boards, the board name, the current-tool badge and a ⋮ menu (Fit to content, Draw with finger, Rename, Delete).
- Portrait and landscape both work. 🟢

### 3.10 Share to Claude ✅ (the details are 🟡)
- A **Share** item in the ⋮ menu offers **Whole board** or **Current view**.
- It renders a PNG on a white background:
  - **Whole board** is fitted to the content with a 40 px margin, at 2× scale. The longest side is capped at 4096 px; if the cap kicks in, the app says so ("Board is large — text may be small; try Current view").
  - **Current view** is exactly what's on screen, at the device's pixel ratio.
- The file is named `<board name> – <yyyy-mm-dd>.png`.
- It opens the Android **share sheet** (Web Share API with a file), so Enrico can pick the Claude app directly and then ask about the drawing.
- If file sharing isn't supported, the app falls back to a save/download.
- An empty board shows "Nothing to share yet" instead.

### 3.9 Edge rules (settled after the builder check; all are my calls 🟡 unless marked)
- **Side-button fallback:** if A1 fails in installed Chrome, that's **not** a blocker. The toolbar eraser buttons are always built and remain the way to switch. A1 is the **first milestone**: deploy a bare skeleton with the v6 gesture logic and check it in Chrome before building on it.
- **What counts as a click:**
  - A press is the hover pointer's `buttons` going 0→1 while `pressure = 0`.
  - The click completes when `buttons` goes back to 0 within 600 ms.
  - If the hover pointer leaves (`pointerleave`/`pointercancel`) or the tip touches down mid-press, the press is cancelled.
  - A second completed click within 400 ms of the first is a double-click.
  - The real logs are in `spike/pen-logs.md` and serve as fixtures.
- **Touches during a pen stroke:** while the pen tip is down, every finger and palm touch is ignored. Touches only pan and zoom when the pen is up.
- **"Draw with finger" mode:** if a second finger lands during a one-finger stroke, the stroke is discarded (no undo entry) and the gesture becomes pan/zoom.
- **Hold-to-snap trigger:**
  - The 500 ms timer restarts whenever the tip drifts more than 6 screen px from where the pause began.
  - At a pause the **whole stroke so far** is checked. A pause at a triangle corner simply finds no match and drawing continues.
  - After a snap preview appears, moving the pen more than 6 px cancels it and the stroke continues hand-drawn.
  - The arrow test runs before the closed-shape tests.
  - "Closed" means the gap between start and end is less than 20 % of the stroke's bounding-box diagonal.
- **Area eraser details:**
  - The cut is a true segment-to-circle intersection, with new end points placed on the circle.
  - Remaining pieces keep their original pressure values. No new tapers are added at the cut.
  - Highlighters are cut like any other stroke.
  - One erase gesture (tip down to tip up) is one undo step.
- **Performance:** aim for 120 Hz, with 60 Hz as the minimum on a board of 2,000 strokes of about 50–300 points each. If `desynchronized` misbehaves on the device, fall back to a normal canvas.
- **App updates:** when a new version is ready, a small "Update ready – tap to reload" bar appears. The app never reloads by itself mid-drawing.
- **Storage:**
  - Records carry a schema version from day one, with forward-only migrations.
  - Objects are stored one record per object, keyed by board, so saves are small.
  - The thumbnail is stored and regenerated when you leave a board.

## 4. Technical shape (builder may adjust)

- Vite + TypeScript, no UI framework (the UI is small). Small libraries are allowed: `perfect-freehand` for ink outlines, `idb-keyval` or equivalent for storage, `vite-plugin-pwa` for install/offline. 🟢
- **Objects** (world coordinates), each with `id`, `createdAt` and a bounding box:
  - `stroke {pen, color, size, points[x,y,pressure]}`
  - `shape {shape: ellipse|rect|triangle|line, pen, color, size, geometry}`
  - `arrow {from, to, pen, color, size}`
  - `text {x, y, text, color, fontSize}`
- **Drawing:** a main canvas redraws the visible objects (culled by bounding box) whenever the view changes. The stroke in progress is drawn on a separate top canvas with `desynchronized: true` and `getCoalescedEvents()` to keep latency low. Highlighters are drawn first. A spatial grid speeds up hit-testing.
- **Pointer handling:**
  - A pure state machine takes pointer events and outputs actions (draw / erase / pan / tool change). The real event sequences from the v2–v6 logs are its test fixtures.
  - The default browser behaviour of `contextmenu` and touch gestures is blocked, and `touch-action: none` is set on the board.
- **Recognition** is a pure function: points in, shape or nothing out. Its tests use recorded strokes, including handwriting that must **not** snap.

## 5. Acceptance checklist (on the phone)
- **A1** In installed Chrome, the side-button click and double-click switch tools reliably: 10 out of 10 each, and no tool change from presses longer than 600 ms.
- **A2** Ink keeps up with fast writing, with no visible gap between the pen tip and the line.
- **A3** Pan and zoom stay smooth on a board with 2,000 strokes.
- **A4** Each of the 5 snap shapes is recognised 4 times out of 5 when drawn reasonably. A normal "O", "D" or "A" written without a pause never snaps.
- **A5** Close the app, reopen it and the board is unchanged. The same holds after airplane mode plus a restart.
- **A6** Create, rename, switch and delete boards, and each opens where it was left.
- **A7** Share → Whole board → Claude app: the image arrives in a new Claude chat, and Claude can read the handwriting and shapes on a typical board.

## 6. Left to the builder
- Exact smoothing, outline and felt-edge rendering, within the looks described above.
- The recognition algorithm and its thresholds, provided A4 passes.
- Toolbar icon set and visual styling.
- Folder structure and module boundaries.
