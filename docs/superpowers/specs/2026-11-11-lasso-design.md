# Lasso select, move and resize — design

Status: draft for Enrico's review · 2026-11-11
Decisions: `docs/superpowers/decisions/sketchboard-decisions.md` → "Lasso select & transform" (L1–L14).

## 1. What and why

Enrico wants to fix layout after the fact: circle some handwriting or a sketch, then move it or resize it, like OneNote's lasso. Today the only option is to erase and redraw.

Success means he can circle part of a board with the pen, drag it somewhere else, and make it bigger or smaller without distorting it. He can also stretch it in one direction when he wants to, and undo any of it in one step.

### Goals
1. A **Lasso** tool selects objects by drawing a free loop around them.
2. A selection box with a **centre move button**, **4 corner handles** (aspect-locked resize) and **4 side-centre handles** (one-direction stretch).
3. Move and resize are live while dragging, are saved like any other edit, and are **one undo step** each.

### Non-goals (v1)
Rotate, duplicate/copy, a delete-selection button, recolouring a selection, multi-board copy/paste.

### Anti-goals
- Losing or duplicating objects if the app is closed or backgrounded mid-drag.
- The board panning or a stroke being drawn when the user means to grab a handle.
- Text letters becoming stretched or squashed.

## 2. Behaviour

### 2.1 Making a selection
- The toolbar gets a **Lasso** button after Text, with a dashed-loop icon. Selecting it shows the tool badge "Lasso".
- With the lasso tool, drawing with the pen (or a finger when "Draw with finger" is on) traces a **dashed blue loop** on the live layer.
- On lift, the loop is closed automatically with a straight line back to its start.
- If the loop's bounding box is under **20 screen px** in both directions, or no object qualifies, nothing is selected and the loop disappears.
- **What qualifies:**
  - **Strokes:** at least **60 %** of their points lie inside the closed loop (even–odd point-in-polygon test).
  - **Shapes and arrows:** at least 60 % of the points of their `outlineOf` polylines lie inside. Ellipses use the 64-point sample.
  - **Text:** the centre of its bbox lies inside.
- The selection holds **ids**, never copies of objects.

### 2.2 The selection box
- The box is the union of the selected objects' bboxes, drawn as a **dashed** outline on the live layer in screen space, with an 8 px screen padding.
- **Handles** are drawn and hit-tested in **screen px**, so they are the same size at any zoom:
  - **Corners:** 4 squares, 16 px drawn, **44 px** hit area.
  - **Side-centres:** 4 squares, 14 px drawn, 44 px hit area.
  - **Centre move button:** a 32 px circle with a four-way arrow, 44 px hit area.
- **Hit priority:** corner > side > centre button > inside the box.
- If the box is too small on screen to fit all the handles (either side under 88 px), the side handles are hidden; corners and the centre button remain.
- The selection stays active until it is ended (§2.5). The original objects keep rendering normally while nothing is being dragged.

### 2.3 Dragging
Dragging uses the pen (or a finger, subject to the palm rule in §2.6).

| Grab | Effect | Anchor |
|---|---|---|
| Centre button or inside the box | Move by the drag delta | – |
| Corner | Uniform scale `s` from the opposite corner. `s` is the projection of the drag onto the box diagonal, clamped to at least 0.05 | Opposite corner |
| Left or right side | Scale X only (`sx`, clamped to at least 0.05 in magnitude; no flipping) | Opposite side |
| Top or bottom side | Scale Y only (`sy`, same clamp) | Opposite side |

- **Live preview:** while dragging, the selected originals are **hidden from the main renderer** through a `hiddenIds` set; they stay in the BoardDoc and storage. The transformed copies are drawn on the live layer each frame together with the box and handles.
- **On release:** a single `history.apply({ remove: originals, add: transformed })` runs with the **same ids**, giving one undo step and one autosave batch. Then `hiddenIds` is cleared, and the selection keeps the same ids, now at the new place and size.
- **On cancel** (`pointercancel`, app hidden, or a tool change mid-drag): `hiddenIds` is cleared and nothing is committed. The originals simply reappear.

### 2.4 How each object type transforms
The transform is `p' = anchor + (p − anchor) × (sx, sy)`. A move is `sx = sy = 1` plus a translation.

| Object | Geometry | Size |
|---|---|---|
| Stroke | every point; pressure unchanged | uniform: `size × s` · stretch: unchanged |
| Shape: ellipse | centre transformed; `rx × sx`, `ry × sy` | as for strokes |
| Shape: rect, triangle, line | every vertex | as for strokes |
| Arrow | `from` and `to` | as for strokes |
| Text | the top-left `x, y` | uniform: `fontSize × s`, clamped to 4–2000 board px · stretch: unchanged (only its position moves) |

The bbox is recomputed with `bboxOf`. Transformed objects keep their `id`, `createdAt`, pen and colour.

### 2.5 Ending a selection
A selection ends on any of:
- a tap or pen-down **outside** the box and its handles (that pen-down does **not** start a new lasso; it only ends the selection),
- choosing another tool,
- an S Pen side-button tool switch,
- undo or redo,
- leaving the board.

### 2.6 Input rules
- With the lasso tool active, the router's existing contact events drive the selection controller. Handles respond to the pen and to fingers.
- **Fingers:** a finger touching a handle or the inside of the box drags the selection instead of panning. Elsewhere, a one-finger touch pans as today.
- The existing "pen near → fingers inert" rule still applies: while the pen hovers, fingers do nothing, handles included.
- Two-finger pinch zoom still works while a selection is active, and the box follows the view.

## 3. Technical shape

- `src/tools/lasso.ts` — pure functions:
  - `pointInPolygon`
  - `selectInLasso(doc, loopWorld) → ids`
  - `selectionBounds(objs) → BBox`
  - `hitHandle(boxScreen, x, y) → Handle | null`
  - `transformFor(handle, startBox, dragWorld) → { anchor, sx, sy, dx, dy }`
  - `transformObject(o, t, uniform) → BoardObject`
- `src/tools/selectionController.ts` — a gesture state machine: `idle → lassoing → selected ⇄ dragging`. It holds the hidden ids, the start box and the preview objects. It is driven by world/screen samples from `main.ts`, and emits `commit(change)` or `preview(objs, box)`.
- `Renderer` gains `setHidden(ids: Set<string>)`, which skips those ids in `draw`.
- `LiveLayer` gains `drawSelection(objs, boxScreen, handles, loop?)`, reusing `drawObject` in the board transform plus screen-space chrome.
- `Tool` gains `'lasso'`; the toolbar gets the button.
- The router needs a way to let a finger "claim" a touch (a selection drag) instead of panning: the router asks `main.ts`, through a `claimTouch(x, y) → boolean` callback, on finger-down.

## 4. Testing
- **Unit (TDD):** point-in-polygon (concave loops, a self-crossing loop, a point on an edge), the 60 % rule, text by centre, the tiny-loop guard, the handle hit priority and its 44 px areas, the maths for each handle including the clamps and no-flip, `transformObject` for every kind (uniform vs stretch sizes, text clamp, ids preserved), the controller's one-undo commit, cancel committing nothing, and selection ending on an outside tap.
- **Router:** a claimed finger drags instead of panning, and the palm rule still blocks it while the pen hovers.
- **Phone acceptance:**
  - circle some handwriting, then move, corner-resize and side-stretch it;
  - undo each step;
  - close the app mid-drag and reopen: nothing is lost or duplicated.
