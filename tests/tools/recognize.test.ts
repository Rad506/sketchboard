import { describe, it, expect } from 'vitest';
import { recognize } from '../../src/tools/recognize';
import {
  ARROW_FROM, ARROW_TO, arrowBarbs, arrowChevron, letterA, noisyCircle, noisyEllipse, noisyLine,
  noisyRect, noisyTriangle, openU, scribble, zigzag,
} from './fixtures';
import type { P } from './fixtures';

const SEEDS = [1, 2, 3, 4, 5];

/** A4: at least 4 of 5 seeds must pass. */
function fourOfFive(gen: (seed: number) => P[], ok: (r: ReturnType<typeof recognize>) => boolean): void {
  const results = SEEDS.map((s) => ok(recognize(gen(s))));
  expect(results.filter(Boolean).length).toBeGreaterThanOrEqual(4);
}

const near = (a: P, b: P, tol: number) => Math.hypot(a[0] - b[0], a[1] - b[1]) <= tol;
const shaftTol = 0.05 * Math.hypot(ARROW_TO[0] - ARROW_FROM[0], ARROW_TO[1] - ARROW_FROM[1]);
const edgeAngle = (a: P, b: P) => (Math.atan2(b[1] - a[1], b[0] - a[0]) * 180) / Math.PI;
const side = (a: P, b: P) => Math.hypot(b[0] - a[0], b[1] - a[1]);

describe('recognize', () => {
  it('recognizes circle -> ellipse with rx===ry', () => {
    fourOfFive(noisyCircle, (r) => r?.shape === 'ellipse' && r.rx === r.ry);
  });

  it('recognizes 2:1 ellipse', () => {
    fourOfFive(noisyEllipse, (r) => r?.shape === 'ellipse' && r.rx / r.ry > 1.7 && r.rx / r.ry < 2.3);
  });

  it('triangle -> 3 vertices', () => {
    fourOfFive(noisyTriangle, (r) => r?.shape === 'triangle' && r.vertices.length === 3);
  });

  it('rect at 5 degrees -> axis-aligned 4 vertices', () => {
    fourOfFive((s) => noisyRect(s, 5), (r) => {
      if (r?.shape !== 'rect' || r.vertices.length !== 4) return false;
      const v = r.vertices;
      return v[0][1] === v[1][1] && v[1][0] === v[2][0] && v[2][1] === v[3][1] && v[3][0] === v[0][0]
        && v[1][0] > v[0][0] && v[2][1] > v[1][1];
    });
  });

  it('rect at 30 degrees stays rotated', () => {
    fourOfFive((s) => noisyRect(s, 30), (r) => {
      if (r?.shape !== 'rect' || r.vertices.length !== 4) return false;
      const a = Math.abs(edgeAngle(r.vertices[0], r.vertices[1])) % 90;
      return a > 22 && a < 38 && side(r.vertices[0], r.vertices[1]) !== side(r.vertices[1], r.vertices[2]);
    });
  });

  it('near-square -> equal sides', () => {
    fourOfFive((s) => noisyRect(s, 0, 200, 190), (r) => {
      if (r?.shape !== 'rect') return false;
      const v = r.vertices;
      return Math.abs(side(v[0], v[1]) - side(v[1], v[2])) < 1e-6;
    });
  });

  it('chevron arrow -> from/to within 5 % of the true shaft ends', () => {
    fourOfFive(arrowChevron, (r) => r?.shape === 'arrow' && near(r.from, ARROW_FROM, shaftTol) && near(r.to, ARROW_TO, shaftTol));
  });

  it('barb-back-barb arrow -> same', () => {
    fourOfFive(arrowBarbs, (r) => r?.shape === 'arrow' && near(r.from, ARROW_FROM, shaftTol) && near(r.to, ARROW_TO, shaftTol));
  });

  it('straight line -> line', () => {
    fourOfFive(noisyLine, (r) => r?.shape === 'line' && r.vertices.length === 2);
  });

  it.each([
    ['letterA', letterA],
    ['zigzag', zigzag],
    ['scribble', scribble],
    ['openU', openU],
  ])('%s -> null', (_name, pts) => {
    expect(recognize(pts)).toBeNull();
  });

  it('1-point and 2-point input -> null', () => {
    expect(recognize([])).toBeNull();
    expect(recognize([[5, 5]])).toBeNull();
    expect(recognize([[0, 0], [200, 100]])).toBeNull();
  });

  it('tiny strokes (bbox diagonal under 10) -> null', () => {
    expect(recognize([[0, 0], [3, 1], [6, 2], [7, 3]])).toBeNull();
  });
});
