import { SCRIBBLE_PAPER, SQUIRCLE_PATH } from "@lydie/plugin-api/ui";

// v2: flourishes like the ones under a good signature, in black. Each is one smooth line (a
// centripetal Catmull-Rom spline through a few points, or a parametric curve), resampled evenly and
// drawn as a filled outline of an almost even width with round ends.

export type P = [number, number];

const INK = "#1b1c1f";
const TAU = Math.PI * 2;

const sub = (a: P, b: P): P => [a[0] - b[0], a[1] - b[1]];
const len = (a: P) => Math.hypot(a[0], a[1]);

// Points of a parametric curve.
const curve = (count: number, from: number, to: number, f: (t: number) => P): P[] =>
  Array.from({ length: count + 1 }, (_, i) => f(from + ((to - from) * i) / count));

// Centripetal Catmull-Rom through the points (no cusps or overshoot at tight turns).
export function catmullRom(points: P[], perSegment = 24): P[] {
  const out: P[] = [];
  const at = (i: number): P => {
    if (i < 0) return [2 * points[0]![0] - points[1]![0], 2 * points[0]![1] - points[1]![1]];
    if (i >= points.length) {
      const a = points[points.length - 1]!;
      const b = points[points.length - 2]!;
      return [2 * a[0] - b[0], 2 * a[1] - b[1]];
    }
    return points[i]!;
  };
  for (let i = 0; i < points.length - 1; i++) {
    const [p0, p1, p2, p3] = [at(i - 1), at(i), at(i + 1), at(i + 2)];
    const t0 = 0;
    const t1 = t0 + Math.sqrt(len(sub(p1, p0))) || t0 + 1e-3;
    const t2 = t1 + Math.sqrt(len(sub(p2, p1))) || t1 + 1e-3;
    const t3 = t2 + Math.sqrt(len(sub(p3, p2))) || t2 + 1e-3;
    const mix = (a: P, b: P, ta: number, tb: number, t: number): P => {
      const k = (t - ta) / (tb - ta);
      return [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k];
    };
    for (let s = 0; s < perSegment; s++) {
      const t = t1 + ((t2 - t1) * s) / perSegment;
      const a1 = mix(p0, p1, t0, t1, t);
      const a2 = mix(p1, p2, t1, t2, t);
      const a3 = mix(p2, p3, t2, t3, t);
      const b1 = mix(a1, a2, t0, t2, t);
      const b2 = mix(a2, a3, t1, t3, t);
      out.push(mix(b1, b2, t1, t2, t));
    }
  }
  out.push(points[points.length - 1]!);
  return out;
}

// The same line as `count` points evenly spaced along it.
function resample(points: P[], count: number): P[] {
  const lengths = [0];
  for (let i = 1; i < points.length; i++) {
    lengths.push(lengths[i - 1]! + len(sub(points[i]!, points[i - 1]!)));
  }
  const total = lengths[lengths.length - 1]!;
  const out: P[] = [];
  let j = 1;
  for (let k = 0; k <= count; k++) {
    const target = (total * k) / count;
    while (j < points.length - 1 && lengths[j]! < target) j++;
    const a = points[j - 1]!;
    const b = points[j]!;
    const span = lengths[j]! - lengths[j - 1]! || 1;
    const t = Math.min(1, Math.max(0, (target - lengths[j - 1]!) / span));
    out.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]);
  }
  return out;
}

export const GESTURES: P[][] = [
  // Three leaning loops on a rising line, entering and leaving with long strokes.
  curve(220, -1.2, 3 * TAU + 1.4, (t) => {
    const x = 18 + 2.9 * t - 7.5 * Math.sin(t);
    const y = 60 - 0.9 * t - 13 * Math.cos(t);
    return [x + 0.32 * (55 - y), y];
  }),
  // One tall loop with a long swash out to the right.
  catmullRom([
    [14, 74],
    [34, 68],
    [52, 50],
    [60, 28],
    [52, 18],
    [44, 28],
    [48, 52],
    [62, 66],
    [86, 58],
  ]),
  // A lazy figure eight with a tail.
  catmullRom([
    [16, 62],
    [30, 44],
    [46, 46],
    [56, 58],
    [70, 64],
    [80, 52],
    [72, 40],
    [56, 44],
    [44, 58],
    [32, 70],
    [22, 66],
  ]),
  // A swash that curls into a round loop at the top, then flicks away.
  catmullRom([
    [18, 78],
    [28, 60],
    [42, 42],
    [58, 30],
    [72, 28],
    [76, 38],
    [68, 46],
    [57, 40],
    [60, 29],
    [74, 22],
    [88, 24],
  ]),
  // A spiral opening out into a long baseline stroke, as one spline.
  catmullRom([
    ...curve(14, 0, 1.55 * TAU, (t) => {
      const r = 4 + 3.4 * t;
      return [46 + r * Math.cos(t + Math.PI), 46 + r * Math.sin(t + Math.PI)];
    }),
    [62, 70],
    [86, 66],
  ]),
  // A wave that grows, like the tail of a long name.
  curve(200, 0, 1, (u) => [16 + 68 * u, 54 + (4 + 12 * u) * Math.sin(u * 2.1 * TAU) - 8 * u]),
  // An oval drawn once and a bit, leaving through itself, as one spline.
  catmullRom([
    ...curve(12, 0.3, TAU + 0.8, (t) => [
      50 + 26 * Math.cos(t),
      48 + 16 * Math.sin(t) - 4 * Math.cos(t),
    ]),
    [72, 70],
    [88, 68],
  ]),
  // Two small loops low on the line, then up and away.
  catmullRom([
    [14, 64],
    [28, 62],
    [36, 52],
    [30, 46],
    [28, 58],
    [42, 64],
    [52, 54],
    [46, 48],
    [44, 60],
    [60, 64],
    [76, 46],
    [86, 30],
  ]),
  // The classic paraph: a hooked start, a long loop down and a sweep back underneath.
  catmullRom([
    [24, 30],
    [34, 25],
    [38, 36],
    [33, 52],
    [38, 66],
    [52, 70],
    [62, 60],
    [56, 50],
    [42, 56],
    [30, 70],
    [44, 76],
    [70, 72],
    [88, 62],
  ]),
  // A ribbon: three wide arcs that cross back over each other.
  curve(220, 0, 1, (u) => {
    const t = u * 2.6 * TAU;
    return [18 + 64 * u + 10 * Math.sin(t), 50 + 16 * Math.sin(t * 0.5 + 0.6) * Math.cos(t * 0.5)];
  }),
];

const r1 = (v: number) => Math.round(v * 100) / 100;

// Softens the line: a few passes of a small [1 2 1] blur, the ends held in place.
function smooth(points: P[], passes: number): P[] {
  let out = points;
  for (let k = 0; k < passes; k++) {
    out = out.map((p, i) => {
      const a = out[i - 1];
      const b = out[i + 1];
      if (!a || !b) return p;
      return [(a[0] + 2 * p[0] + b[0]) / 4, (a[1] + 2 * p[1] + b[1]) / 4];
    });
  }
  return out;
}

// The line as a filled outline with round ends. The width barely changes: a touch heavier going
// down the page than going up, eased in over a long stretch, so the line reads as one even stroke.
export function inkPath(line: P[], width: number): string {
  const points = smooth(resample(line, 300), 8);
  const count = points.length;
  const tangent = (i: number): P => {
    const a = points[Math.max(0, i - 3)]!;
    const b = points[Math.min(count - 1, i + 3)]!;
    const d = sub(b, a);
    const l = len(d) || 1;
    return [d[0] / l, d[1] / l];
  };
  const raw = points.map((_, i) => 0.86 + 0.14 * (0.5 + 0.5 * tangent(i)[1]));
  const pressure = raw.map((_, i) => {
    let sum = 0;
    let n = 0;
    for (let k = -24; k <= 24; k++) {
      const v = raw[i + k];
      if (v !== undefined) {
        sum += v;
        n++;
      }
    }
    return sum / n;
  });
  const half = (i: number) => {
    const u = i / (count - 1);
    // Only a slight easing at the ends; the round caps finish them.
    const ends = Math.min(1, u / 0.1, (1 - u) / 0.1);
    return (width * pressure[i]! * (0.9 + 0.1 * Math.sin((Math.PI / 2) * ends))) / 2;
  };
  const left: string[] = [];
  const right: string[] = [];
  points.forEach((p, i) => {
    const w = half(i);
    const [tx, ty] = tangent(i);
    left.push(`${r1(p[0] - ty * w)} ${r1(p[1] + tx * w)}`);
    right.push(`${r1(p[0] + ty * w)} ${r1(p[1] - tx * w)}`);
  });
  const cap = (p: P, r: number) =>
    `M${r1(p[0] - r)} ${r1(p[1])}a${r1(r)} ${r1(r)} 0 1 0 ${r1(2 * r)} 0a${r1(r)} ${r1(r)} 0 1 0 ${r1(-2 * r)} 0Z`;
  return `M${left.join("L")}L${right.reverse().join("L")}Z${cap(points[0]!, half(0))}${cap(points[count - 1]!, half(count - 1))}`;
}

export function GestureIcon({ points, size }: { points: P[]; size: number }) {
  // About 2.2 px wide when small.
  const width = Math.max(6.5, (2.2 * 100) / size);
  return (
    <svg viewBox="0 0 100 100" width={size} height={size} aria-hidden className="shrink-0">
      <path d={SQUIRCLE_PATH} fill={SCRIBBLE_PAPER} />
      <path d={inkPath(points, width)} fill={INK} />
    </svg>
  );
}
