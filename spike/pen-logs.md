# S Pen raw logs (Galaxy S25 Ultra, Claude-app WebView, Chromium 156) — test fixtures

UA: `Mozilla/5.0 (Linux; Android 10; K; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/156.0.0.0 Mobile Safari/537.36 Claude/1.261030.19`

## v2 — raw pointer trace (hover pointer id=2; each contact gets a new id)
Steps: draw normally; hold button + draw (×2); hover double-click.
```
9.70  pointerup  pen  button=0 buttons=0 p=0.000 w=1.0 id=7
9.70  pointerleave  pen  button=0 buttons=0 p=0.000 w=1.0 id=7
9.73  pointermove  pen  button=-1 buttons=0 p=0.000 w=1.0 id=2
9.80  pointerover  pen  button=0 buttons=1 p=0.027 w=0.0 id=9
9.81  pointerdown  pen  button=0 buttons=1 p=0.027 w=0.0 id=9
9.81  pointermove  pen  button=-1 buttons=1 p=0.040 w=0.0 id=9
10.40  EVENT contextmenu button=-1          <- ~0.6 s into ANY touch
11.03  pointerup  pen  button=0 buttons=0 p=0.000 w=1.0 id=9
11.03  pointerleave  pen  button=0 buttons=0 p=0.000 w=1.0 id=9
11.04  pointermove  pen  button=-1 buttons=0 p=0.000 w=1.0 id=2
11.53  pointerdown  pen  button=0 buttons=1 p=0.089 w=0.0 id=12
12.12  EVENT contextmenu button=-1
12.59  pointerup  pen  button=0 buttons=0 p=0.000 w=1.0 id=12
13.34  pointermove  pen  button=-1 buttons=1 p=0.000 w=1.0 id=2   <- side button down in air
13.54  pointermove  pen  button=-1 buttons=0 p=0.000 w=1.0 id=2   <- up
13.64  pointermove  pen  button=-1 buttons=1 p=0.000 w=1.0 id=2   <- down (double)
13.82  pointermove  pen  button=-1 buttons=0 p=0.000 w=1.0 id=2   <- up
14.64  pointerleave  pen  button=-1 buttons=0 p=0.000 w=1.0 id=2
14.64  pointerleave  mouse  button=-1 buttons=0 p=0.000 w=1.0 id=1
```

## v3/v4 — button held then tip put down: NO contact events arrive
```
23.17  button DOWN in air
26.83  button UP in air          <- tip touched & dragged during this, nothing reported
28.66  button DOWN in air  (double-click)
44.42  button UP in air          <- 16 s held incl. drawing, nothing reported
```

## v6 — click-to-switch (final design) — all checks passed
Press/release intervals: single clicks ≈ 150–300 ms; double-click second press ≈ 100–250 ms after first release.
Presses > 600 ms ("long press ignored") happened 5× out of habit and must not change the tool.
```
5.27  line drawn with pen
8.63  long press ignored
11.15  long press ignored
17.12  long press ignored
17.82  single click → stroke
20.08  line drawn with stroke
28.71  double-click → area
32.36  line drawn with area
44.74  long press ignored
45.91  single click → stroke
48.63  double-click → area
50.15  double-click → pen
51.06  line drawn with pen
```
v5 timings of the same presses: 5.48↓ 5.78↑ (300 ms) · 15.25↓ 15.50↑ 15.50↓(double) · 20.06↓ 20.31↑ (250 ms).
