# Deferred minor findings (v1 build, 2026-11-06)

Parked from the per-task and final reviews. None block the phone acceptance test; revisit after it.

- Task 1: minor (deferred): very new major versions (TS 7 / vite 8 / vitest 5); npm audit not triaged; favicon href hard-codes base; update bar role=button not focusable; no .gitattributes (CRLF warnings); RED shown retroactively
- Task 2: minor (deferred): pointerup/pointerdown with p=0 could start a press (device logs show pointerup buttons=0, so unlikely); t vs setTimeout clock domain — T4 must feed event.timeStamp/performance.now ms; no dispose(); untested pointercancel / exact boundaries / third click
- Task 3: minor (deferred): pen pointerdown p=0 emits hover (untested); no tests for mouse path R7 / pen interrupting touchDraw / third finger; 1e6 precision test trivially passes
- Task 3: minor (deferred): fingers that land while the pen is down are never recorded (undocumented, probably intended)
- Task 4: minor (deferred): coalesced samples reuse parent pressure/buttons/t (main.ts:87-89) — carry into T6 dispatch; no setPointerCapture for mouse (desktop drag ending outside board leaves the router stuck); per-segment alpha shows dots in the area preview; side-button tool change mid-stroke is not tied to the stroke (T7/T8 must latch the tool at strokeStart)
- Task 4: minor (deferred): canvas resize only on window resize/orientationchange (a ResizeObserver on the board would be more robust)
- Task 5: minor (deferred, FLAG FOR FINAL): BoardDoc.cells() hangs on a non-finite bbox (empty points) — guard needed; replace-by-id fires no removal event; detach relies on the stored bbox (objects must be immutable); test gaps (re-add id, negative coords, tangent, both-inside, shape bbox); outlineOf(arrow) returns un-copied arrays
- Task 6: minor (deferred, FLAG FOR FINAL — affects A2/A3 perf): live layer repaints and re-runs getStroke per coalesced event; no outline cache per object (getStroke each redraw); createdAt ties fall back to unstable order
- Task 6: minor (deferred): live highlighter preview draws over ink until commit; felt shadowBlur not zoom-scaled (plan-mandated literal); single-tap highlighter invisible; cull box doesn't pad for ink max width/shadow; pan during stroke leaves the live preview stale
- Task 7: minor (deferred): 6/zoom wiring untested; segSegDist missing collinear/touching/zero-length tests; magic pad 64; new strokeStart doesn't end a live eraseSession; cancel path untested
- Task 8: minor (deferred): boundary-start duplicate point → zero-length piece; near-tangent graze replaces stroke with identical copy (pointless undo entry); weak "fragments <2 points" test; cursor redraw per coalesced event and not refreshed on zoom; centerline-only cutting
- Task 9: minor (deferred): triangle/circle/rect tests check no positions/sizes; arrow tests use a single orientation, no negative hook case; letterD (→ rect) unpinned; Math.min(...spread) stack risk on huge strokes; fixed 5-sample smoothing window; weak chevron discrimination (straight line + spur → arrow)
- Task 9: minor (deferred): closure cut search mixes raw start with smoothed points; sparse-closure test only asserts not-'line'
- Task 10: minor (deferred): temp Ctrl+Z/Y only lowercase and is not blocked mid-stroke (Task 13 must disable undo while a stroke is active); held-then-moved lift still snaps (untested); recognizedToObject is called twice; cancel() doesn't notify onPreview
- Task 11: minor (deferred): main.ts dispatch keeps growing one branch per tool session (refactor candidate in T13); zero-height/width box shapes allowed and untested
- Task 12: minor (deferred): overlapping texts pick by query order (not top-most); new-text world point recomputed at finish; no main.ts flow tests; long lines unwrapped
- Task 13: minor (deferred): popover lacks aria-label/Escape/close affordance; toolbar pointerdown doesn't close an open menu; settings is a const with a single onSettingsChange listener (T14 must Object.assign); 34px swatches; hexToHsv has no malformed-hex guard; no wheel boundary tests
- Task 13: minor (deferred): relayout rebuilds the popover mid-drag on resize; max(120) cap can exceed space on tiny viewports; menuitemradio without role=menu
- Task 14: minor (deferred, FLAG FOR FINAL — data-loss anti-goal): ghost resurrection window (persisted ids updated only after the write succeeds); editing an existing text holds a pending delete → a crash/OS kill mid-edit (no visibilitychange) loses the text
- Task 14: minor (deferred): settings-save failure pill never clears; retry reuses a dead connection (no reopen); writeChanges orphans when the meta row is missing + possible unhandled rejection; broad try in main.ts downgrades non-storage errors; settings saving gated on board load; `tx as never` and silent skip of missing migrations
- Task 15: minor (deferred, FLAG FOR FINAL): Android Back exits the PWA (push a history state + handle popstate → home); main.ts is 642 lines (extract a board-session controller); unhandled rejections on showHome / + New board
- Task 15: minor (deferred): input not blocked during board switch; in-progress stroke discarded on leave; deleteBoard failure loses the last edits; failed openBoard falls into noStorage for the whole session; old doc onChange listeners not unsubscribed
- Task 16: minor (deferred): empty check happens after the chooser (check before); silent download fallback needs a "Downloaded" toast; real-device share untested
- Final fix wave: re-review all 12 addressed (commits fdecbd0..385fa85). Residual minors: duplicate lastPen line router.ts:186-187; Back during a busy switch is swallowed (next Back exits); a rejected add can leave a dangling undo entry; Path2D cache branch untested in node; felt/highlighter not outline-cached

## Rulings made during the build
- | T2 → T5 | PenKind/Tool (toolState.ts) → types.ts uses PenKind | types.ts must import PenKind from toolState.ts → Ruling R1 |
- | T5 → T6/T7/T8 | outlineOf, segCircle, distPointSeg, BoardDoc, History | outlineOf(text) is not defined → Ruling R2 |
- | T12 → T13 | text defaults needed before Settings exists | → Ruling R3 |
- | T1 self | step 3 runs `npm create vite` in a non-empty dir (interactive prompt) | → Ruling R4 |
- | T1 self | step 9 uses `gh`, which is not installed; push needs credentials | → Ruling R5 |
- | T4/T16/T17 self | steps say "push" | → Ruling R5 |
- | Global | plan says no Co-Authored trailers; harness reminder says add one | Enrico's CLAUDE.md wins → Ruling R6 |
- Ruling R1: `PenKind` and `Tool` are exported from `src/core/toolState.ts`; `types.ts` imports them — avoids a cycle and keeps the plan's T2 location — cost if wrong: a trivial move later.
- Ruling R2: `outlineOf(text)` returns its bbox rectangle as one closed polyline; the stroke eraser uses bbox containment for text as the plan says — cost if wrong: minor hit-test difference.
- Ruling R3: T12 uses local constants for text defaults (fontSize 24, colour `#000000`) until T13 wires `Settings` — the spec gives no default text colour, so black — cost if wrong: one default colour.
- Ruling R4: T1 scaffolds the Vite vanilla-ts files by hand (or in a temp dir, then copies them in) instead of running the interactive `npm create` in place; docs/ and spike/ must be kept — cost if wrong: none.
- Ruling R5: implementers commit only. The controller pushes at milestones, and the deploy is verified by fetching https://rad506.github.io/sketchboard/ instead of `gh` — cost if wrong: slower deploy verification.
- Ruling R6: commits carry no Co-Authored-By / Generated-with trailers (Enrico's global CLAUDE.md overrides the harness default) — cost if wrong: attribution missing.
- Ruling R7 (T3): router treats a mouse with the left button down as a drawing pointer (pressure 0.5), so desktop smoke tests work; a two-finger gesture ends when one finger lifts and the remaining finger is inert until all fingers lift — cost if wrong: small router tweak.
- Ruling R8 (T5): History gains `record(c)` (records without mutating the doc) for the erasers, which remove objects live for feedback; bbox rules for text = 0.6·fontSize·chars × 1.2·fontSize·lines — cost if wrong: small API addition.
- Ruling R9 (T15): startup opens the most recently edited board directly (home via ← Boards); viewport-only saves don't bump updatedAt; rename/delete live in the board's ⋮ menu, not on the cards — cost if wrong: small UX change.
- Ruling R10: the final fix wave bundles T17 step 2 (stress flag) and 6 cheap hardening items with the 5 Importants in ONE dispatch (skill: a single fix wave) — cost if wrong: a slightly larger diff to re-review.
