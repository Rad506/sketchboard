// Seeded stroke generators for the shape recogniser tests.
// Noise is +-3 % of the shape size; every stroke starts somewhere on the
// outline and ends with a slight overshoot or gap (up to 10 % of the diagonal).
export type P = [number, number];

export function mulberry32(seed: number): () => number {
  let a = seed | 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const NOISE = 0.03;

function jitter(rng: () => number, size: number): P {
  const amp = NOISE * size;
  return [(rng() * 2 - 1) * amp, (rng() * 2 - 1) * amp];
}

function pointOnClosed(poly: P[], lens: number[], total: number, s: number): P {
  let d = ((s % total) + total) % total;
  for (let i = 0; i < poly.length; i++) {
    if (d <= lens[i]) {
      const a = poly[i];
      const b = poly[(i + 1) % poly.length];
      const t = lens[i] === 0 ? 0 : d / lens[i];
      return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
    }
    d -= lens[i];
  }
  return poly[0];
}

/** A hand-drawn lap round a polygon: random start, overshoot/gap, jitter. */
function lap(poly: P[], seed: number, n = 90): P[] {
  const rng = mulberry32(seed);
  const lens = poly.map((p, i) => Math.hypot(poly[(i + 1) % poly.length][0] - p[0], poly[(i + 1) % poly.length][1] - p[1]));
  const total = lens.reduce((a, b) => a + b, 0);
  const xs = poly.map((p) => p[0]);
  const ys = poly.map((p) => p[1]);
  const w = Math.max(...xs) - Math.min(...xs);
  const h = Math.max(...ys) - Math.min(...ys);
  const diag = Math.hypot(w, h);
  const size = Math.max(w, h);
  const start = rng() * total;
  const travel = total + (rng() * 2 - 1) * 0.1 * diag;
  const out: P[] = [];
  for (let i = 0; i < n; i++) {
    const p = pointOnClosed(poly, lens, total, start + (travel * i) / (n - 1));
    const j = jitter(rng, size);
    out.push([p[0] + j[0], p[1] + j[1]]);
  }
  return out;
}

function arc(cx: number, cy: number, rx: number, ry: number, seed: number, n = 90): P[] {
  const rng = mulberry32(seed);
  const size = 2 * Math.max(rx, ry);
  const start = rng() * Math.PI * 2;
  const sweep = Math.PI * 2 + ((rng() * 2 - 1) * 0.1 * Math.hypot(2 * rx, 2 * ry)) / Math.max(rx, ry);
  const out: P[] = [];
  for (let i = 0; i < n; i++) {
    const a = start + (sweep * i) / (n - 1);
    const j = jitter(rng, size);
    out.push([cx + rx * Math.cos(a) + j[0], cy + ry * Math.sin(a) + j[1]]);
  }
  return out;
}

export function noisyCircle(seed: number): P[] {
  return arc(300, 250, 100, 100, seed);
}

export function noisyEllipse(seed: number): P[] {
  return arc(300, 250, 140, 70, seed);
}

export function noisyTriangle(seed: number): P[] {
  return lap([[300, 100], [420, 300], [180, 300]], seed);
}

export function noisyRect(seed: number, angleDeg = 0, w = 240, h = 160): P[] {
  const a = (angleDeg * Math.PI) / 180;
  const c = Math.cos(a);
  const s = Math.sin(a);
  const corners: P[] = [[-w / 2, -h / 2], [w / 2, -h / 2], [w / 2, h / 2], [-w / 2, h / 2]];
  return lap(corners.map(([x, y]) => [300 + x * c - y * s, 250 + x * s + y * c] as P), seed);
}

/** Shaft of the two arrow fixtures (true ends). */
export const ARROW_FROM: P = [50, 300];
export const ARROW_TO: P = [250, 200];

function shaftAndHead(seed: number, barbs: boolean): P[] {
  const rng = mulberry32(seed);
  const [fx, fy] = ARROW_FROM;
  const [tx, ty] = ARROW_TO;
  const L = Math.hypot(tx - fx, ty - fy);
  const dir = Math.atan2(ty - fy, tx - fx);
  const back = dir + Math.PI;
  const barb = 0.25 * L;
  const spread = (30 * Math.PI) / 180;
  const A: P = [tx + barb * Math.cos(back + spread), ty + barb * Math.sin(back + spread)];
  const B: P = [tx + barb * Math.cos(back - spread), ty + barb * Math.sin(back - spread)];
  const path: P[] = [ARROW_FROM, ARROW_TO, A, ARROW_TO];
  if (barbs) path.push(B);
  const out: P[] = [];
  const perSeg = barbs ? [34, 8, 8, 8] : [40, 10, 10];
  for (let k = 0; k < path.length - 1; k++) {
    const [a, b] = [path[k], path[k + 1]];
    const n = perSeg[k];
    for (let i = k === 0 ? 0 : 1; i <= n; i++) {
      const t = i / n;
      const j = jitter(rng, L);
      out.push([a[0] + (b[0] - a[0]) * t + j[0], a[1] + (b[1] - a[1]) * t + j[1]]);
    }
  }
  return out;
}

/** Shaft, then one barb out and back to the tip. */
export function arrowChevron(seed: number): P[] {
  return shaftAndHead(seed, false);
}

/** Shaft, then barb -> back to the tip -> second barb. */
export function arrowBarbs(seed: number): P[] {
  return shaftAndHead(seed, true);
}

export function noisyLine(seed: number): P[] {
  const rng = mulberry32(seed);
  const out: P[] = [];
  for (let i = 0; i < 70; i++) {
    const t = i / 69;
    const j = jitter(rng, 260);
    out.push([40 + 260 * t + j[0], 80 + 120 * t + j[1]]);
  }
  return out;
}

/** Subdivide a polyline so handwriting literals have realistic density. */
export function densify(v: P[], step = 6): P[] {
  const out: P[] = [v[0]];
  for (let i = 1; i < v.length; i++) {
    const [a, b] = [v[i - 1], v[i]];
    const n = Math.max(1, Math.round(Math.hypot(b[0] - a[0], b[1] - a[1]) / step));
    for (let k = 1; k <= n; k++) out.push([a[0] + ((b[0] - a[0]) * k) / n, a[1] + ((b[1] - a[1]) * k) / n]);
  }
  return out;
}

// Handwriting samples: vertices written as literals.
export const letterA: P[] = densify([[0, 160], [50, 0], [100, 160], [80, 100], [20, 100]]);
export const letterD: P[] = densify([
  [0, 0], [0, 160], [40, 158], [80, 140], [105, 110], [112, 80], [105, 50], [80, 20], [40, 2], [0, 0], [4, 6],
]);
export const scribble: P[] = densify([
  [0, 40], [60, 0], [20, 70], [90, 30], [40, 90], [100, 60], [10, 20], [80, 80], [30, 10], [70, 50],
]);
export const zigzag: P[] = densify([[0, 0], [40, 80], [80, 0], [120, 80], [160, 0], [200, 80]]);
export const openU: P[] = densify([
  [0, 0], [2, 50], [10, 90], [40, 110], [70, 90], [78, 50], [80, 0],
]);
