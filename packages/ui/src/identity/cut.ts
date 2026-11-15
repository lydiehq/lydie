// The Lydie mark: a circle cut by one curved band. MARK_PATH is the canonical drawing (the brand's
// build script writes it, with true fillets at every tip); avatars draw it as it is, only turned.
// Other outlines (the squircle of a space icon) are cut by the same band here, with the same
// fillets, from the band's numbers in MARK_SHAPE.

export type CutPoint = [number, number];
export type CutBand = { offset: number; thick: number; sag: number };
export type CutShape = { tilt: number; taper: number; fillet: number; bands: CutBand[] };

// The mark in a 100 × 100 box: the large piece, then the crescent. Do not edit by hand.
export const MARK_PIECES = [
  "M8.946 75.084Q62.26 72.096 92.265 27.057A3.4 3.4 0 0 0 92.313 23.361A50 50 0 0 0 5.746 73.272A3.4 3.4 0 0 0 8.946 75.084Z",
  "M29.876 88.866Q68.13 83.889 93.41 55.503A3.4 3.4 0 0 1 99.301 58.331A50 50 0 0 1 28.878 95.32A3.4 3.4 0 0 1 29.876 88.866Z",
] as const;
export const MARK_PATH = MARK_PIECES.join("");

// The numbers MARK_PATH was built from: the band's position, curve and thickness before the tilt.
export const MARK_SHAPE: CutShape = {
  tilt: 29,
  taper: 0.09,
  fillet: 3.4,
  bands: [{ offset: 22.5, thick: 18.5, sag: 13 }],
};

const C = 50;

type Edge = (x: number) => number;

export function cutCenterline(band: CutBand): Edge {
  return (x) => {
    const u = (x - C) / 50;
    return C + band.offset - band.sag * u * u;
  };
}

// A band's upper (-1) or lower (+1) edge in the unrotated frame.
export function cutEdge(band: CutBand, taper: number, side: -1 | 1): Edge {
  const line = cutCenterline(band);
  return (x) => line(x) + (side * band.thick * (1 + (taper * (x - C)) / 50)) / 2;
}

export function cutSample(e: Edge, from: number, to: number, count = 48): CutPoint[] {
  const out: CutPoint[] = [];
  for (let i = 0; i <= count; i++) {
    const x = from + ((to - from) * i) / count;
    out.push([x, e(x)]);
  }
  return out;
}

export function cutRotate(p: CutPoint, tilt: number): CutPoint {
  const a = (-tilt * Math.PI) / 180;
  const dx = p[0] - C;
  const dy = p[1] - C;
  return [C + dx * Math.cos(a) - dy * Math.sin(a), C + dx * Math.sin(a) + dy * Math.cos(a)];
}

export const fmt = (n: number) => String(Math.round(n * 1000) / 1000);
const sub = (a: CutPoint, b: CutPoint): CutPoint => [a[0] - b[0], a[1] - b[1]];
const len = (a: CutPoint) => Math.hypot(a[0], a[1]);
const cross = (a: CutPoint, b: CutPoint) => a[0] * b[1] - a[1] * b[0];
const lerp = (a: CutPoint, b: CutPoint, t: number): CutPoint => [
  a[0] + (b[0] - a[0]) * t,
  a[1] + (b[1] - a[1]) * t,
];

function closestOnSegment(p: CutPoint, a: CutPoint, b: CutPoint): CutPoint {
  const ab = sub(b, a);
  const t = Math.max(
    0,
    Math.min(1, ((p[0] - a[0]) * ab[0] + (p[1] - a[1]) * ab[1]) / (ab[0] ** 2 + ab[1] ** 2)),
  );
  return lerp(a, b, t);
}

// SVG sweep flag for the short arc from a to b around o (y points down).
const sweep = (o: CutPoint, a: CutPoint, b: CutPoint) => (cross(sub(a, o), sub(b, o)) > 0 ? 1 : 0);

// One corner of UIKit's continuous rounded rect in multiples of the radius (back along the
// incoming edge, along the outgoing one), as the app icon uses.
const CORNER: CutPoint[][] = [
  [
    [1.52866483, 0],
    [1.08849323, 0],
    [0.86840689, 0.02229071],
    [0.63149399, 0.074911],
  ],
  [
    [0.63149399, 0.074911],
    [0.37282392, 0.16905899],
    [0.16905899, 0.37282392],
    [0.074911, 0.63149399],
  ],
  [
    [0.074911, 0.63149399],
    [0.02229071, 0.86840689],
    [0, 1.08849323],
    [0, 1.52866483],
  ],
];

// The 100 × 100 squircle as a closed polyline, clockwise on screen from the top edge.
function squircle(r: number): CutPoint[] {
  const out: CutPoint[] = [];
  // Corner point, direction back along the incoming edge, direction along the outgoing one.
  const corners: [number, number, number, number, number, number][] = [
    [100, 0, -1, 0, 0, 1],
    [100, 100, 0, -1, -1, 0],
    [0, 100, 1, 0, 0, -1],
    [0, 0, 0, 1, 1, 0],
  ];
  for (const [cx, cy, ax, ay, bx, by] of corners) {
    const at = ([p, q]: CutPoint): CutPoint => [
      cx + (p * ax + q * bx) * r,
      cy + (p * ay + q * by) * r,
    ];
    for (const curve of CORNER) {
      const [p0, p1, p2, p3] = curve.map(at) as [CutPoint, CutPoint, CutPoint, CutPoint];
      for (let i = 0; i < 12; i++) {
        const t = i / 12;
        const s = 1 - t;
        out.push([
          s ** 3 * p0[0] + 3 * s * s * t * p1[0] + 3 * s * t * t * p2[0] + t ** 3 * p3[0],
          s ** 3 * p0[1] + 3 * s * s * t * p1[1] + 3 * s * t * t * p2[1] + t ** 3 * p3[1],
        ]);
      }
    }
    // The straight edge to the next corner is the segment between the two samples.
    out.push(at(CORNER[2]![3]!));
  }
  return out;
}

const SQUIRCLE = squircle(24);

const polyline = (points: CutPoint[]) =>
  `${points.map((p, i) => `${i ? "L" : "M"}${fmt(p[0])} ${fmt(p[1])}`).join("")}Z`;

// The part of a closed outline (unrotated frame) on one side of an edge curve, with a true fillet
// of radius `r` at both places the curve meets the outline, as build-logo does for the circle: the
// fillet's centre sits `r` from the curve (along its normal, into the piece) and `r` from the
// outline. `side` -1 keeps what is above the curve, +1 what is below.
function outlinePiece(outline: CutPoint[], e: Edge, side: -1 | 1, tilt: number, r: number): string {
  const n = outline.length;
  const g = (p: CutPoint) => side * (p[1] - e(p[0]));
  const at = (x: number): CutPoint => [x, e(x)];

  // The kept run of the outline, as the segments walked from the curve's way in to its way out.
  let enter = -1;
  for (let i = 0; i < n; i++) {
    if (g(outline[i]!) <= 0 && g(outline[(i + 1) % n]!) > 0) {
      enter = i;
      break;
    }
  }
  if (enter < 0) return "";
  const segments = [enter];
  for (let i = (enter + 1) % n; g(outline[i]!) > 0; i = (i + 1) % n) segments.push(i);
  const seg = (k: number): [CutPoint, CutPoint] => [outline[k]!, outline[(k + 1) % n]!];

  // Where the curve crosses a segment, as an x on the curve.
  const crossingX = (k: number) => {
    const [a, b] = seg(k);
    let lo = 0;
    let hi = 1;
    for (let it = 0; it < 50; it++) {
      const m = (lo + hi) / 2;
      if (Math.sign(g(lerp(a, b, m))) === Math.sign(g(a))) lo = m;
      else hi = m;
    }
    return lerp(a, b, (lo + hi) / 2)[0];
  };
  const xIn = crossingX(segments[0]!);
  const xOut = crossingX(segments[segments.length - 1]!);

  const closest = (p: CutPoint) => {
    let best = { q: outline[0]!, d: Infinity, pos: 0 };
    segments.forEach((k, pos) => {
      const [a, b] = seg(k);
      const q = closestOnSegment(p, a, b);
      const d = len(sub(p, q));
      if (d < best.d) best = { q, d, pos };
    });
    return best;
  };
  const centreAt = (x: number): CutPoint => {
    const h = 1e-4;
    const slope = (e(x + h) - e(x - h)) / (2 * h);
    const norm = Math.hypot(slope, 1);
    // Up (smaller y) for the piece above the curve, down for the one below.
    const normal: CutPoint = side === -1 ? [slope / norm, -1 / norm] : [-slope / norm, 1 / norm];
    const p = at(x);
    return [p[0] + normal[0] * r, p[1] + normal[1] * r];
  };
  // Walk from the crossing towards the other one until the centre is `r` from the outline.
  const fillet = (from: number, towards: number) => {
    const f = (x: number) => closest(centreAt(x)).d - r;
    const steps = 400;
    let a = from;
    let fa = f(a);
    for (let i = 1; i <= steps; i++) {
      const b = from + ((towards - from) * i) / steps;
      const fb = f(b);
      if (fa < 0 && fb >= 0) {
        let lo = a;
        let hi = b;
        for (let it = 0; it < 50; it++) {
          const m = (lo + hi) / 2;
          if (f(m) < 0) lo = m;
          else hi = m;
        }
        const x = (lo + hi) / 2;
        const centre = centreAt(x);
        const hit = closest(centre);
        return { x, onCurve: at(x), onOutline: hit.q, pos: hit.pos, centre };
      }
      a = b;
      fa = fb;
    }
    const p = at(from);
    return {
      x: from,
      onCurve: p,
      onOutline: p,
      pos: from === xIn ? 0 : segments.length - 1,
      centre: p,
    };
  };
  const mid = (xIn + xOut) / 2;
  const fin = fillet(xIn, mid);
  const fout = fillet(xOut, mid);

  const turn = (p: CutPoint) => cutRotate(p, tilt);
  const pt = (p: CutPoint) => {
    const q = turn(p);
    return `${fmt(q[0])} ${fmt(q[1])}`;
  };
  const arcTo = (f: typeof fin, from: CutPoint, to: CutPoint) =>
    `A${fmt(r)} ${fmt(r)} 0 0 ${sweep(turn(f.centre), turn(from), turn(to))} ${pt(to)}`;

  let d = `M${pt(fin.onOutline)}`;
  for (let pos = fin.pos; pos < fout.pos; pos++) d += `L${pt(seg(segments[pos]!)[1])}`;
  d += `L${pt(fout.onOutline)}`;
  d += arcTo(fout, fout.onOutline, fout.onCurve);
  for (const p of cutSample(e, fout.x, fin.x, 48).slice(1, -1)) d += `L${pt(p)}`;
  d += `L${pt(fin.onCurve)}`;
  d += arcTo(fin, fin.onCurve, fin.onOutline);
  return `${d}Z`;
}

// Any closed outline (clockwise, in the 100 box) cut by the shape's first band: the piece above
// the band, then the piece below.
export function cutOutlinePieces(points: CutPoint[], shape: CutShape): string[] {
  const band = shape.bands[0];
  if (!band) return [polyline(points)];
  const outline = points.map((p) => cutRotate(p, -shape.tilt));
  return [
    outlinePiece(outline, cutEdge(band, shape.taper, -1), -1, shape.tilt, shape.fillet),
    outlinePiece(outline, cutEdge(band, shape.taper, 1), 1, shape.tilt, shape.fillet),
  ];
}

const squircleCache = new Map<number, string[]>();

// A squircle tile cut by the mark's band, turned by `turn` degrees (one of eight, so cached).
export function squirclePieces(turn = 0): string[] {
  let pieces = squircleCache.get(turn);
  if (!pieces) {
    pieces = cutOutlinePieces(SQUIRCLE, { ...MARK_SHAPE, tilt: MARK_SHAPE.tilt + turn });
    squircleCache.set(turn, pieces);
  }
  return pieces;
}

export const SQUIRCLE_PATH = polyline(SQUIRCLE);

// Avatar colours (the playground's "Sunday"). Literal hex on purpose: an avatar is someone's
// picture and keeps its colours in both themes; its cuts show the surface behind it.
export const CUT_COLORS = [
  "#4c9e80",
  "#ff7a59",
  "#ffc845",
  "#5cb8e6",
  "#9b7be0",
  "#ff8fb8",
  "#2fbf9f",
  "#f25c54",
];

// FNV-1a into mulberry32: the same seed always draws the same cut.
function random(seed: string) {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  let a = h >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// The mark turned to one of eight positions: only the turn and the colours vary.
const TURNS = [0, 45, 90, 135, 180, 225, 270, 315];

export type Cut = { turn: number; colors: [string, string] };

const cache = new Map<string, Cut>();

// The cut for a seed (a user id, a teamspace id): a turn and two colours.
export function cutFor(seed: string): Cut {
  const hit = cache.get(seed);
  if (hit) return hit;
  const next = random(`cut:${seed}`);
  const turn = TURNS[Math.floor(next() * TURNS.length)]!;
  const colors = [...CUT_COLORS];
  for (let i = colors.length - 1; i > 0; i--) {
    const j = Math.floor(next() * (i + 1));
    [colors[i], colors[j]] = [colors[j]!, colors[i]!];
  }
  const cut: Cut = { turn, colors: [colors[0]!, colors[1]!] };
  cache.set(seed, cut);
  return cut;
}
