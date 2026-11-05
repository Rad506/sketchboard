// Hold-to-snap shape recogniser: whole stroke in, a clean shape (or null) out.
export type Pt = [number, number];
export type Recognized =
  | { shape: 'ellipse'; cx: number; cy: number; rx: number; ry: number }
  | { shape: 'rect' | 'triangle' | 'line'; vertices: [number, number][] }
  | { shape: 'arrow'; from: [number, number]; to: [number, number] };

const RDP_EPS = 0.04; // of bbox diagonal
const CLOSED_GAP = 0.2; // of bbox diagonal
const MIN_DIAG = 10;
const MERGE = 3.5; // vertices closer than this (x eps) are one rounded corner
const POLY_FIT = 1.5; // max point-to-outline gap for a polygon, x eps
const TURN_MIN = 40; // degrees; gentler bends are not corners
const ARROW_LEN: [number, number] = [0.1, 0.4]; // barb length / shaft length
const ARROW_ANGLE: [number, number] = [15, 60]; // degrees to the shaft
const SHAFT_SHARE = 0.5;
const SHAFT_DEV = 1.5; // shaft straightness, x RDP epsilon
const RADIUS_CV = 0.25;
const CIRCLE_ASPECT: [number, number] = [0.85, 1.15];
const AXIS_SNAP = 10; // degrees
const SQUARE_SNAP = 0.1;

const dist = (a: Pt, b: Pt) => Math.hypot(a[0] - b[0], a[1] - b[1]);
const deg = (r: number) => (r * 180) / Math.PI;

function distToSeg(p: Pt, a: Pt, b: Pt): number {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const l2 = dx * dx + dy * dy;
  const t = l2 === 0 ? 0 : Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / l2));
  return Math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dy);
}

/** Ramer-Douglas-Peucker; keeps first and last point. */
function rdp(pts: Pt[], eps: number): Pt[] {
  const keep = new Array<boolean>(pts.length).fill(false);
  keep[0] = keep[pts.length - 1] = true;
  const walk = (lo: number, hi: number) => {
    let worst = -1;
    let at = -1;
    for (let i = lo + 1; i < hi; i++) {
      const d = distToSeg(pts[i], pts[lo], pts[hi]);
      if (d > worst) { worst = d; at = i; }
    }
    if (worst > eps) { keep[at] = true; walk(lo, at); walk(at, hi); }
  };
  walk(0, pts.length - 1);
  return pts.filter((_, i) => keep[i]);
}

/** Moving average (window 5) to tame hand jitter; first and last points stay fixed. */
function smooth(pts: Pt[]): Pt[] {
  return pts.map((p0, i) => {
    if (i === 0 || i === pts.length - 1) return p0; // keep the true endpoints
    const w = pts.slice(Math.max(0, i - 2), i + 3);
    return [w.reduce((a, p) => a + p[0], 0) / w.length, w.reduce((a, p) => a + p[1], 0) / w.length] as Pt;
  });
}

/** Total-least-squares line through pts, oriented first -> last. */
function fitLine(pts: Pt[]): { c: Pt; dir: Pt; dev: number } {
  const n = pts.length;
  const c: Pt = [pts.reduce((a, p) => a + p[0], 0) / n, pts.reduce((a, p) => a + p[1], 0) / n];
  let sxx = 0, syy = 0, sxy = 0;
  for (const p of pts) {
    sxx += (p[0] - c[0]) ** 2; syy += (p[1] - c[1]) ** 2; sxy += (p[0] - c[0]) * (p[1] - c[1]);
  }
  const th = 0.5 * Math.atan2(2 * sxy, sxx - syy);
  let dir: Pt = [Math.cos(th), Math.sin(th)];
  const e = pts[n - 1];
  if (dir[0] * (e[0] - pts[0][0]) + dir[1] * (e[1] - pts[0][1]) < 0) dir = [-dir[0], -dir[1]];
  const dev = Math.max(...pts.map((p) => Math.abs((p[0] - c[0]) * dir[1] - (p[1] - c[1]) * dir[0])));
  return { c, dir, dev };
}

const project = (p: Pt, l: { c: Pt; dir: Pt }): Pt => {
  const t = (p[0] - l.c[0]) * l.dir[0] + (p[1] - l.c[1]) * l.dir[1];
  return [l.c[0] + l.dir[0] * t, l.c[1] + l.dir[1] * t];
};

/** Turn angle in degrees at b when walking a -> b -> c. */
function turn(a: Pt, b: Pt, c: Pt): number {
  const ux = b[0] - a[0], uy = b[1] - a[1], vx = c[0] - b[0], vy = c[1] - b[1];
  const m = Math.hypot(ux, uy) * Math.hypot(vx, vy);
  return m === 0 ? 0 : deg(Math.acos(Math.max(-1, Math.min(1, (ux * vx + uy * vy) / m))));
}

/** Corners of a closed outline: cyclic RDP vertices, close ones merged, gentle bends dropped. */
function corners(v: Pt[], eps: number): { pts: Pt[]; turns: number[] } {
  let c = v.slice();
  for (;;) { // collapse the closest cyclic pair (a rounded corner) while nearer than MERGE x eps
    let best = -1, bd = MERGE * eps;
    c.forEach((p, i) => { const d = dist(p, c[(i + 1) % c.length]); if (c.length > 3 && d < bd) { bd = d; best = i; } });
    if (best < 0) break;
    const n = c.length, j = (best + 1) % n;
    const a = c[best], b = c[j];
    const p0 = c[(best + n - 1) % n], p1 = c[(j + 1) % n];
    const d0: Pt = [a[0] - p0[0], a[1] - p0[1]], d1: Pt = [p1[0] - b[0], p1[1] - b[1]];
    const den = d0[0] * d1[1] - d0[1] * d1[0];
    let m: Pt = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
    if (Math.abs(den) > 0.3 * Math.hypot(...d0) * Math.hypot(...d1)) {
      const t = ((b[0] - a[0]) * d1[1] - (b[1] - a[1]) * d1[0]) / den;
      const q: Pt = [a[0] + d0[0] * t, a[1] + d0[1] * t];
      if (dist(q, m) < MERGE * eps) m = q;
    }
    c = c.map((p, i) => (i === best ? m : p)).filter((_, i) => i !== j);
  }
  const turns = () => c.map((p, i) => turn(c[(i + c.length - 1) % c.length], p, c[(i + 1) % c.length]));
  for (;;) {
    const t = turns();
    const m = Math.min(...t);
    if (c.length <= 3 || m >= TURN_MIN) return { pts: c, turns: t };
    c = c.filter((_, i) => i !== t.indexOf(m));
  }
}

function arrow(pts: Pt[], eps: number, raw: Pt[]): Recognized | null {
  const s = pts[0];
  let runMax = 0;
  let tip = 0;
  for (let i = 1; i < pts.length; i++) {
    const d = dist(s, pts[i]);
    if (d > runMax) { runMax = d; tip = i; } else if (d < runMax - eps) break;
  }
  if (tip === 0 || tip >= pts.length - 2) return null;
  const shaft = fitLine(pts.slice(0, tip + 1));
  if (shaft.dev > SHAFT_DEV * eps) return null; // shaft must be straight
  const dir = shaft.dir;
  const from = project(raw[0], shaft);
  let far = raw[tip];
  for (let i = Math.max(0, tip - 2); i <= Math.min(raw.length - 1, tip + 2); i++) {
    if ((raw[i][0] - s[0]) * dir[0] + (raw[i][1] - s[1]) * dir[1] > (far[0] - s[0]) * dir[0] + (far[1] - s[1]) * dir[1]) far = raw[i];
  }
  const t = project(far, shaft);
  const L = dist(from, t);
  const head = rdp(pts.slice(tip), eps);
  if (head.length !== 3 && head.length !== 4) return null;
  const segs = head.slice(1).map((p, i) => [p[0] - head[i][0], p[1] - head[i][1]] as Pt);
  const sideOf = (v: Pt) => Math.sign(dir[0] * v[1] - dir[1] * v[0]);
  const ok = (v: Pt) => {
    const len = Math.hypot(v[0], v[1]) / L;
    const ang = deg(Math.acos(Math.min(1, Math.abs(dir[0] * v[0] + dir[1] * v[1]) / Math.hypot(v[0], v[1]))));
    return len >= ARROW_LEN[0] && len <= ARROW_LEN[1] && ang >= ARROW_ANGLE[0] && ang <= ARROW_ANGLE[1];
  };
  const first = segs[0];
  const last = segs[segs.length - 1];
  if (!segs.every(ok) || sideOf(first) === sideOf(last) || sideOf(first) === 0) return null;
  const headLen = segs.reduce((a, v) => a + Math.hypot(v[0], v[1]), 0);
  if (L < SHAFT_SHARE * (L + headLen)) return null;
  return { shape: 'arrow', from, to: t };
}

/** Re-place each corner at the intersection of the best-fit lines of its two edges. */
function refine(c: Pt[], lap: Pt[], eps: number): Pt[] {
  const n = c.length;
  const groups: Pt[][] = c.map(() => []);
  for (const p of lap) {
    let b = 0, bd = Infinity;
    c.forEach((q, i) => { const d = distToSeg(p, q, c[(i + 1) % n]); if (d < bd) { bd = d; b = i; } });
    groups[b].push(p);
  }
  const lines = groups.map((g) => (g.length >= 3 ? fitLine(g) : null));
  return c.map((p, i) => {
    const a = lines[(i + n - 1) % n], b = lines[i];
    if (!a || !b) return p;
    const den = a.dir[0] * b.dir[1] - a.dir[1] * b.dir[0];
    if (Math.abs(den) < 0.3) return p;
    const t = ((b.c[0] - a.c[0]) * b.dir[1] - (b.c[1] - a.c[1]) * b.dir[0]) / den;
    const q: Pt = [a.c[0] + a.dir[0] * t, a.c[1] + a.dir[1] * t];
    return dist(q, p) < 3 * eps ? q : p;
  });
}

/** Axis-snap and squaring of a 4-corner outline into a clean rectangle. */
function rectOf(c: Pt[]): Recognized {
  const mx = c.reduce((a, p) => a + p[0], 0) / 4;
  const my = c.reduce((a, p) => a + p[1], 0) / 4;
  let sx = 0, sy = 0;
  c.forEach((p, i) => {
    const q = c[(i + 1) % 4];
    const a = 4 * Math.atan2(q[1] - p[1], q[0] - p[0]);
    sx += Math.cos(a); sy += Math.sin(a);
  });
  let theta = deg(Math.atan2(sy, sx) / 4); // (-45, 45]
  if (Math.abs(theta) <= AXIS_SNAP) theta = 0;
  const th = (theta * Math.PI) / 180;
  const u: Pt = [Math.cos(th), Math.sin(th)];
  const v: Pt = [-Math.sin(th), Math.cos(th)];
  let w = 0, h = 0;
  c.forEach((p, i) => {
    const q = c[(i + 1) % 4];
    const dx = q[0] - p[0], dy = q[1] - p[1];
    w += Math.abs(dx * u[0] + dy * u[1]);
    h += Math.abs(dx * v[0] + dy * v[1]);
  });
  w /= 2; h /= 2; // each axis is covered by two opposite sides
  if (Math.abs(w - h) <= SQUARE_SNAP * Math.max(w, h)) w = h = (w + h) / 2;
  const at = (a: number, b: number): Pt => [mx + u[0] * a * w / 2 + v[0] * b * h / 2, my + u[1] * a * w / 2 + v[1] * b * h / 2];
  const vs = [at(-1, -1), at(1, -1), at(1, 1), at(-1, 1)];
  let tl = 0;
  vs.forEach((p, i) => { if (p[0] + p[1] < vs[tl][0] + vs[tl][1]) tl = i; });
  return { shape: 'rect', vertices: [...vs.slice(tl), ...vs.slice(0, tl)] };
}

function ellipseOf(pts: Pt[], v: Pt[], minX: number, maxX: number, minY: number, maxY: number): Recognized | null {
  const cx = (minX + maxX) / 2, cy = (minY + maxY) / 2;
  let rx = (maxX - minX) / 2, ry = (maxY - minY) / 2;
  if (rx === 0 || ry === 0) return null;
  // One lap round the centre, no back-and-forth.
  let wind = 0, swept = 0;
  for (let i = 1; i < v.length; i++) {
    let d = Math.atan2(v[i][1] - cy, v[i][0] - cx) - Math.atan2(v[i - 1][1] - cy, v[i - 1][0] - cx);
    d = Math.atan2(Math.sin(d), Math.cos(d));
    wind += d; swept += Math.abs(d);
  }
  if (Math.abs(wind) < 0.85 * 2 * Math.PI || Math.abs(wind) > 1.3 * 2 * Math.PI || Math.abs(wind) < 0.9 * swept) return null;
  const radii = pts.map((p) => Math.hypot((p[0] - cx) / rx, (p[1] - cy) / ry));
  const mean = radii.reduce((a, r) => a + r, 0) / radii.length;
  const sd = Math.sqrt(radii.reduce((a, r) => a + (r - mean) ** 2, 0) / radii.length);
  if (sd / mean >= RADIUS_CV) return null;
  const aspect = rx / ry;
  if (aspect >= CIRCLE_ASPECT[0] && aspect <= CIRCLE_ASPECT[1]) rx = ry = (rx + ry) / 2;
  return { shape: 'ellipse', cx, cy, rx, ry };
}

export function recognize(raw: Pt[]): Recognized | null {
  if (raw.length < 3) return null;
  const pts = smooth(raw);
  const xs = pts.map((p) => p[0]);
  const ys = pts.map((p) => p[1]);
  const [minX, maxX, minY, maxY] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
  const diag = Math.hypot(maxX - minX, maxY - minY);
  if (diag < MIN_DIAG) return null;
  const eps = RDP_EPS * diag;

  const arr = arrow(pts, eps, raw);
  if (arr) return arr;

  const first = raw[0];
  const last = raw[raw.length - 1];
  if (dist(first, last) < CLOSED_GAP * diag) {
    // Cut an overshoot where the pen came back closest to the start.
    let cut = pts.length - 1;
    for (let i = Math.floor(pts.length / 2); i < pts.length; i++) if (dist(first, pts[i]) < dist(first, pts[cut])) cut = i;
    const lap = pts.slice(0, cut + 1);
    const v = rdp(lap, eps);
    const { pts: c, turns } = corners(v, eps);
    const poly = (k: number, lo: number, hi: number) => {
      if (c.length !== k || !turns.every((t) => t >= lo && t <= hi)) return null;
      const r = refine(c, lap, eps);
      const fit = Math.max(...lap.map((p) => Math.min(...r.map((q, i) => distToSeg(p, q, r[(i + 1) % k])))));
      return fit <= POLY_FIT * eps ? r : null; // an ellipse squeezed into 3-4 corners does not hug its edges
    };
    const tri = poly(3, 50, 160);
    if (tri) return { shape: 'triangle', vertices: tri };
    const quad = poly(4, 60, 120);
    if (quad) return rectOf(quad);
    return ellipseOf(lap, v, minX, maxX, minY, maxY);
  }
  const line = fitLine(pts);
  if (line.dev <= eps) return { shape: 'line', vertices: [project(first, line), project(last, line)] };
  return null;
}
