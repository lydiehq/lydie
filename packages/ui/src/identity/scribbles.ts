import { fmt, SQUIRCLE_PATH } from "./cut";

// Doodles a pen might leave in a margin, one per workspace: a single stroke of one of six pens on
// beige paper, picked from a seed. The line wobbles a little (two slow sines, phases from the
// seed), so no two look machine-made the same.

export type ScribblePoint = [number, number];
type P = ScribblePoint;
type Rng = () => number;

export type Scribble = { id: string; name: string; strokes: () => P[][] };

const TAU = Math.PI * 2;
const C = 50;

function random(seed: string): Rng {
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

// `count` points of a parametric curve for u in [from, to].
function curve(count: number, from: number, to: number, f: (u: number) => P): P[] {
  return Array.from({ length: count + 1 }, (_, i) => f(from + ((to - from) * i) / count));
}

// A polygon's edges as dense points, so the wobble bends them.
function polygon(corners: P[], perEdge = 16): P[] {
  const out: P[] = [];
  corners.forEach((a, i) => {
    const b = corners[(i + 1) % corners.length]!;
    for (let k = 0; k < perEdge; k++) {
      const t = k / perEdge;
      out.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]);
    }
  });
  out.push(corners[0]!);
  return out;
}

// A chord of the circle of radius r around the centre: `offset` from it, at `angle`.
function chord(r: number, offset: number, angle: number): P[] {
  const half = Math.sqrt(Math.max(0, r * r - offset * offset));
  const dx = Math.cos(angle);
  const dy = Math.sin(angle);
  return curve(14, -half, half, (u) => [C - dy * offset + dx * u, C + dx * offset + dy * u]);
}

export const SCRIBBLES: Scribble[] = [
  {
    id: "spiral",
    name: "Spiral",
    strokes: () => [
      curve(160, 0, 1, (u) => {
        const a = u * 2.2 * TAU;
        const r = 4 + 24 * u;
        return [C + r * Math.cos(a), C + r * Math.sin(a)];
      }),
    ],
  },
  {
    id: "loops",
    name: "Loops",
    // A prolate cycloid: the loops of joined-up handwriting.
    strokes: () => {
      const loops = 3;
      const a = 50 / (loops * TAU);
      const b = 12;
      return [
        curve(200, 0, loops * TAU, (t) => [25 + a * t - b * Math.sin(t), 52 - b * Math.cos(t)]),
      ];
    },
  },
  {
    id: "star",
    name: "Star",
    strokes: () => [
      polygon(
        Array.from({ length: 5 }, (_, k): P => {
          const a = ((-90 + k * 144) * Math.PI) / 180;
          return [C + 28 * Math.cos(a), C + 2 + 28 * Math.sin(a)];
        }),
      ),
    ],
  },
  {
    id: "heart",
    name: "Heart",
    strokes: () => [
      curve(140, 0, TAU, (t) => {
        const x = 16 * Math.sin(t) ** 3;
        const y = 13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t);
        return [C + 1.7 * x, C - 1.7 * y - 2];
      }),
    ],
  },
  {
    id: "hatch",
    name: "Hatching",
    strokes: () => [-2, -1, 0, 1, 2].map((k) => chord(26, k * 9, Math.PI / 4)),
  },
  {
    id: "cloud",
    name: "Cloud",
    strokes: () => [
      curve(200, 0, TAU, (t) => {
        const r = 22 + 7 * Math.abs(Math.sin(2.5 * t));
        return [C + r * 1.15 * Math.cos(t), C + 2 + r * 0.8 * Math.sin(t)];
      }),
    ],
  },
  {
    id: "flower",
    name: "Flower",
    strokes: () => [
      curve(240, 0, TAU, (t) => {
        const r = 28 * Math.abs(Math.cos(2.5 * t));
        return [C + r * Math.cos(t - Math.PI / 2), C + r * Math.sin(t - Math.PI / 2)];
      }),
    ],
  },
  {
    id: "waves",
    name: "Waves",
    strokes: () => [40, 60].map((y) => curve(80, 20, 80, (x) => [x, y + 5 * Math.sin(x * 0.27)])),
  },
  {
    id: "sun",
    name: "Sun",
    strokes: () => [
      curve(80, 0, TAU, (t) => [C + 11 * Math.cos(t), C + 11 * Math.sin(t)]),
      ...Array.from({ length: 8 }, (_, k): P[] => {
        const a = (k / 8) * TAU;
        return curve(6, 18, 27, (r) => [C + r * Math.cos(a), C + r * Math.sin(a)]);
      }),
    ],
  },
  {
    id: "coil",
    name: "Coil",
    // A ring of small loops, like a pen circling while you think.
    strokes: () => [
      curve(260, 0, TAU, (t) => [
        C + 19 * Math.cos(t) + 7 * Math.cos(7 * t),
        C + 19 * Math.sin(t) + 7 * Math.sin(7 * t),
      ]),
    ],
  },
];

// A four-pointed sparkle, the sign people already read as "AI": an astroid, pinched further.
function sparkle(cx: number, cy: number, r: number): P[] {
  const pinch = (v: number) => Math.sign(v) * Math.abs(v) ** 3.4;
  return curve(120, 0, TAU, (t) => [cx + r * pinch(Math.cos(t)), cy + r * pinch(Math.sin(t))]);
}

// What agents draw instead: one sparkle, or a big one and a small one, so it reads as a machine
// at 16 px and never passes for a person.
export const AGENT_SCRIBBLES: Scribble[] = [
  { id: "sparkle", name: "Sparkle", strokes: () => [sparkle(C, C, 31)] },
  {
    id: "sparkles",
    name: "Sparkles",
    strokes: () => [sparkle(C - 5, C + 5, 27), sparkle(C + 19, C - 19, 11)],
  },
];

// Pens: literal colours on purpose, like the paper; a doodle is a picture in both themes.
export const SCRIBBLE_PENS = ["#2747c9", "#20232b", "#d93a3a", "#1f8a5b", "#6a4bd1", "#7a4a2a"];
export const SCRIBBLE_PAPER = "#faf9f6";
// Machines draw on a screen: the same doodles in a light colour on dark ink.
export const SCRIBBLE_LIGHTS = ["#5ce1e6", "#c6f432", "#ffd23f", "#7cf5b0", "#8fb8ff", "#ff9ecf"];
export const SCRIBBLE_SCREEN = "#23252b";

export type ScribbleChoice = { scribble: Scribble; pen: string; seed: string };

export function scribbleFor(seed: string): ScribbleChoice {
  const r = random(`scribble:${seed}`);
  return {
    scribble: SCRIBBLES[Math.floor(r() * SCRIBBLES.length)]!,
    pen: SCRIBBLE_PENS[Math.floor(r() * SCRIBBLE_PENS.length)]!,
    seed,
  };
}

// An agent's sparkle and pen, from its seed (its app).
export function agentScribbleFor(seed: string): ScribbleChoice {
  const r = random(`agent:${seed}`);
  return {
    scribble: AGENT_SCRIBBLES[Math.floor(r() * AGENT_SCRIBBLES.length)]!,
    pen: SCRIBBLE_PENS[Math.floor(r() * SCRIBBLE_PENS.length)]!,
    seed,
  };
}

const pathOf = (points: P[]) =>
  points.map(([x, y], i) => `${i ? "L" : "M"}${fmt(x)} ${fmt(y)}`).join("");

// The doodle's strokes as paths, with the seed's wobble, tilt and size.
export function strokesFor({ scribble, seed }: ScribbleChoice): {
  paths: string[];
  transform: string;
} {
  const r = random(`hand:${seed}:${scribble.id}`);
  const tilt = (r() - 0.5) * 14;
  const scale = 0.95 + r() * 0.08;
  const paths = scribble.strokes().map((points) => {
    const [a, b, c, d] = [r() * TAU, r() * TAU, 0.05 + r() * 0.04, 0.04 + r() * 0.04];
    return pathOf(
      points.map(([x, y], i) => [x + 1.1 * Math.sin(i * c + a), y + 1.1 * Math.cos(i * d + b)]),
    );
  });
  return {
    paths,
    transform: `translate(50 50) rotate(${fmt(tilt)}) scale(${fmt(scale)}) translate(-50 -50)`,
  };
}

const CIRCLE_PATH = "M0 50A50 50 0 1 1 100 50A50 50 0 1 1 0 50Z";

// Round for a person, a squircle for a place.
export type ScribbleShape = "circle" | "squircle";
export const scribbleOutline = (shape: ScribbleShape) =>
  shape === "circle" ? CIRCLE_PATH : SQUIRCLE_PATH;

// A picture as an SVG data: URL, for saving as someone's image. The line is a fixed 5.5 units:
// the picture is shown at any size, from 16 px in a list to 96 px in settings.
function imageOf(paths: string[], pen: string, transform: string, shape: ScribbleShape): string {
  const strokes = paths.map((d) => `<path d="${d}"/>`).join("");
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">` +
    `<path d="${scribbleOutline(shape)}" fill="${SCRIBBLE_PAPER}"/>` +
    `<g fill="none" stroke="${pen}" stroke-width="5.5" stroke-linecap="round" stroke-linejoin="round"${
      transform ? ` transform="${transform}"` : ""
    }>${strokes}</g></svg>`;
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}

// A picked doodle and pen as a picture, round unless a squircle is asked for.
export function scribbleImage(choice: ScribbleChoice, shape: ScribbleShape = "circle"): string {
  const { paths, transform } = strokesFor(choice);
  return imageOf(paths, choice.pen, transform, shape);
}

// A stroke through drawn points, smoothed by running quadratics through the midpoints.
export function drawnStrokePath(points: readonly P[]): string {
  const [first, ...rest] = points;
  if (!first) return "";
  if (rest.length === 0) return `M${fmt(first[0])} ${fmt(first[1])}l0.01 0`;
  let d = `M${fmt(first[0])} ${fmt(first[1])}`;
  for (let i = 0; i < rest.length - 1; i++) {
    const [x, y] = rest[i]!;
    const [nx, ny] = rest[i + 1]!;
    d += `Q${fmt(x)} ${fmt(y)} ${fmt((x + nx) / 2)} ${fmt((y + ny) / 2)}`;
  }
  const last = rest[rest.length - 1]!;
  return `${d}L${fmt(last[0])} ${fmt(last[1])}`;
}

// Someone's own drawing (strokes in the 100 box) as a picture, round unless a squircle is asked for.
export function drawnScribbleImage(
  strokes: readonly (readonly P[])[],
  pen: string,
  shape: ScribbleShape = "circle",
): string {
  return imageOf(strokes.map(drawnStrokePath), pen, "", shape);
}

// A doodle and pen picked at random, as a picture: what a new account or workspace starts with.
export function randomScribbleImage(shape: ScribbleShape = "circle"): string {
  return scribbleImage(scribbleFor(crypto.randomUUID()), shape);
}
