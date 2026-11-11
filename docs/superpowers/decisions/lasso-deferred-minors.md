# Lasso — deferred review findings and rulings (2026-11-11)

Parked from the per-task and final reviews; none block the phone test.

- Task 1: minor (deferred): 60 % boundary not pinned (add 6/10 and 59/100 cases); no horizontal-edge/vertex-on-ray test; no fully-inside arrow test; O(points × loop) without early exit
- Task 2: minor (deferred): bbox assertions tautological against bboxOf; no inside/zero-size/shape-size-under-uniform tests (partly folded into fix round 1)
- Task 3: minor (deferred): down() while dragging restarts the drag with mismatched bounds (router allows one pen pointer, so edge-only); resize test doesn't assert scaling; stale-id during drag untested (undo blocked by busy in T6); stale 'selected' state not normalized
- Task 4: minor (deferred): loop drawn open (no closePath) — spec says it closes on lift (visual only); 1 px box slightly blurry at dpr 1; filter allocates when hidden is empty; no transform assertions in drawSelection tests
- Task 5: minor (deferred): no claimed-finger-with-pen-down test; loose pinch assertion; missing blank line
- Task 6: minor (deferred): after a mid-drag side-button tool switch the router's in-flight gesture strokeEnd goes through the new tool's branch (pre-existing pattern)
- Fix wave residual: tap slop uses net displacement; a box under 88 px in one dimension moves from inside (corners from outside)

## Rulings made during the build
- Ruling R1: drawSelection's box is the padded screen box — removes ambiguity between T4 and T6 — cost if wrong: trivial refactor.
- Ruling R2: SelectionController adds `get busy()` — T6 needs it for sessionActive — cost if wrong: none.
- Ruling R3: no commit trailers; never push — user's global CLAUDE.md — cost if wrong: attribution missing.
- Ruling R4: pen pointercancel arrives as strokeEnd so a cancelled drag commits where it stopped (spec says cancel commits nothing) — kept as is: rare, one undoable step, no data loss — cost if wrong: an unwanted move the user can undo.
- Ruling R5: a one-finger tap outside the box pans instead of deselecting — parked for phone feedback (needs a router tap action) — cost if wrong: user deselects via tool change or pen tap.
- Ruling R6: side button from lasso goes to the eraser and back to the last PEN, not back to lasso — plan-tested; flag to Enrico — cost if wrong: one extra tap on the Lasso button.
