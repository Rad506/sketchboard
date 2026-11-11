# Sketchboard — decisions log

Infinite-board drawing app for Galaxy S25 Ultra + S Pen.
🟢 auto-decided · 🟡 auto-decided, sanity-check · ✅ decided by Enrico

| # | Question | Chosen | Rationale | Tag |
|---|---|---|---|---|
| 0 | Target device | Galaxy S25 Ultra + built-in S Pen (no Bluetooth; side button only reads while touching/hovering) | Only S25 model with S Pen | ✅ |
| 1 | Platform | Installable web app (PWA) — Chrome → "Add to Home screen", full-screen, offline | No Play Store / Android Studio; instant updates | 🟢 |
| 2 | Hosting | GitHub Pages from https://github.com/Rad506/sketchboard → `rad506.github.io/sketchboard/` | PWA install requires HTTPS | ✅ |
| 3 | Navigation | Pen draws; two fingers pan / pinch-zoom; palm ignored; "draw with finger" toggle | Matches Samsung Notes / Miro feel | 🟡 |
| 4 | Data model | Every stroke is a vector object (point list + pen settings) | Enables whole-stroke delete, crisp at any zoom | 🟢 |
| 5 | Pens | Ink (pressure width), felt (even soft line), highlighter (translucent, under ink); each with own px size slider + colour wheel, remembered | Criteria 2 & 5 | 🟢 |
| 6 | Side button held + tip | Stroke eraser — deletes whole strokes touched | Criterion 3 | 🟡 |
| 7 | Double-click side button, then hold | Pixel-style eraser; circle cursor; cuts vector strokes where it passes | Criterion 4; keeps vector model | 🟡 |
| 8 | Side-button risk | Spike page first to confirm how Chrome reports the button; toolbar eraser buttons as fallback | Unverified browser behaviour | 🟡 |
| 8a | Spike finding (v2, 2026-11-05, Claude-app WebView, Chromium 156) | Side button is only visible while **hovering**: the hover pointer reports `buttons=1` with `pressure=0`. During tip contact it is invisible (`buttons` stays 1). `contextmenu` fires on any ~0.6 s touch, so it is useless. → Gestures become "press button in the air, keep holding, then touch". The erase mode is latched at tip-down | Measured on device | 🟡 |
| 8b | Spike finding (v3/v4) | With the button held, a touching tip is **indistinguishable** from hovering (no pointerdown, pressure stays 0, no mouse events). → Erasers run **wherever the pen is while the button is held**, on the glass or hovering just above it. Single press-and-hold = stroke eraser; double-click-and-hold = area eraser following the cursor icon | Only signal the browser gives; matches "erase where the icon is" | 🟡 (superseded by 8c) |
| 8c | Eraser gesture (replaces 6 & 7) | **Click to switch**: single side-button click in the air → stroke eraser; double-click → area eraser; same click again → back to pen. Erasing only with the tip on the glass. On-screen badge shows the active tool | Hold-to-erase would also erase while hovering; Enrico had no preference | 🟡 |
| 9 | Shape snapping trigger | **Hold to snap**: pause pen ~0.5 s at end of stroke → clean circle/triangle/rectangle/arrow. Normal lift stays hand-drawn. Undo restores raw stroke | Avoids handwriting "O"/"D" turning into shapes | ✅ |
| 10 | Add-ons | Manual shape + arrow tools; Text tool (tap to place, keyboard, colour/size) | Criterion 6 | 🟢 |
| 11 | Boards ("environments") | Multiple named boards: create, rename, switch, delete from a board list; each has its own content and remembers its last view position | Enrico asked for named environments | 🟡 |
| 12 | Saving | Auto-save on device (IndexedDB), undo/redo per board | — | 🟡 |
| 14 | Share to Claude | ⋮ → Share → Whole board / Current view → PNG (2×, max 4096 px, white background) → Android share sheet → Claude app; download fallback | Enrico wants Claude to view and discuss his boards; an image is what Claude reads best | ✅ / details 🟡 |
| 13 | Location & method | `C:\DIY Software\SH\sketchboard\`, TDD (Vitest) for geometry/recognition/eraser logic | Global CLAUDE.md | 🟡 |
| 15 | One-finger pan | With the pen away, one finger pans; while the pen hovers or touches, fingers are inert; the pen counts as gone after pointerleave or 1 s without pen events | Enrico asked (palm protection while writing) | ✅ |
| 16 | Low-contrast outline | Lines and text with WCAG contrast < 2 against the board get a thin black (light board) / white (dark board) outline; highlighters never | Enrico asked | ✅ |
| 17 | Zoom out | Practically unlimited zoom-out; huge objects/queries bypass the spatial grid | Enrico asked | ✅ |
| 18 | Line size vs zoom | Pen/text sizes are fixed board px (8 px stays 8 px on the board at any zoom); the brief screen-px-÷-zoom experiment was reverted | Enrico asked | ✅ |
| 19 | Handwriting → text | Not doing it (parked) | Enrico: "leave the writing to text" | ✅ |

## Lasso select & transform (2026-11-11) — approved by Enrico

| # | Question | Chosen | Rationale | Tag |
|---|---|---|---|---|
| L1 | How to start a selection | New **Lasso** button in the toolbar (next to Text). Draw a free loop around what you want; lifting the pen closes the loop automatically (straight line back to the start) | Matches OneNote; no need to land exactly on the start point | 🟡 |
| L2 | What counts as "inside" | An object is selected when **most of it (≥ 60 % of its points)** is inside the loop; text when its centre is inside. A loop smaller than ~20 px selects nothing | Forgiving for loops that clip a stroke's tail, like OneNote | 🟢 |
| L3 | What can be selected | Everything: ink, felt, highlighter, shapes, arrows, text | "Drawn lines" plus the rest behave the same | 🟢 |
| L4 | Selection look | Dashed box around the selection, a round **move** button in the centre, **4 corner** squares, **4 side-centre** squares; handles are ≥ 44 px touch targets, same size at any zoom | Your description | 🟢 |
| L5 | Corners | Resize with the **aspect ratio locked**, anchored at the opposite corner | You asked | ✅ |
| L6 | Side-centre handles | **Stretch in one direction** (left/right handles change width, top/bottom change height), anchored at the opposite side | Enrico confirmed | ✅ |
| L7 | Moving | Drag the centre move button **or anywhere inside the box** | Bigger target, fewer misses | 🟡 |
| L8 | Line thickness when resizing | Corner (uniform) resize scales line width and text size with it; one-way stretch keeps line width as is and moves text without stretching the letters | Lines look natural; stretched text would look broken | 🟡 |
| L9 | Live feedback | While dragging, the selection redraws live at its new position/size; the originals are hidden, not deleted, until you let go | No flicker, and nothing can be lost if the app is closed mid-drag | 🟢 |
| L10 | Undo | One move/resize = one undo step; drawing the loop itself is not an undo step | Same as erasers | 🟢 |
| L11 | Ending a selection | Tap outside the box, pick another tool, or use the S Pen side button. The selection stays active between drags so you can move, then resize, then move again | Like OneNote | 🟢 |
| L12 | Fingers | Pen or finger can use the handles; with the pen hovering, fingers stay inert (existing palm rule) | Consistent with one-finger pan rule | 🟢 |
| L13 | Out of scope (v1) | Rotate, copy/duplicate, delete-selection button, recolour selection | Not asked; delete is covered by the erasers | 🟡 |
| L14 | Code layout | New `src/tools/lasso.ts` (pure selection + transform maths) and `src/tools/selectionController.ts` (gesture state), so `main.ts` (762 lines) doesn't grow much | Keeps files focused and testable | 🟢 |
