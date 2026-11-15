import { SCRIBBLES, strokesFor } from "./scribbles";
import type { Scribble, ScribblePoint } from "./scribbles";

// Doodles as icons: the avatars' ten and a set of things a page might be about, drawn the same way
// (a few wobbly pen strokes in the 100 box, kept within about 28 of the centre) but without the
// paper, in the text colour or one of `DOODLE_COLORS`. Every stroke is a dense line of points
// (about 1.25 apart), which is what the wobble in `strokesFor` expects.

type P = ScribblePoint;

export type Doodle = Scribble & { keywords: string };

const STEP = 1.25;
const rad = (degrees: number) => (degrees * Math.PI) / 180;

// Straight strokes from corner to corner.
function line(...corners: P[]): P[] {
  const out: P[] = [];
  for (let i = 0; i < corners.length - 1; i++) {
    const [a, b] = [corners[i]!, corners[i + 1]!];
    const steps = Math.max(1, Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / STEP));
    for (let k = 0; k < steps; k++) {
      out.push([a[0] + ((b[0] - a[0]) * k) / steps, a[1] + ((b[1] - a[1]) * k) / steps]);
    }
  }
  out.push(corners[corners.length - 1]!);
  return out;
}

const shape = (...corners: P[]) => line(...corners, corners[0]!);

// Part of an ellipse, by angle in degrees (0 is right, 90 is down); `to` may be less than `from`.
function arc(cx: number, cy: number, rx: number, ry: number, from: number, to: number): P[] {
  const steps = Math.max(2, Math.ceil((rad(Math.abs(to - from)) * Math.max(rx, ry)) / STEP));
  return Array.from({ length: steps + 1 }, (_, i): P => {
    const a = rad(from + ((to - from) * i) / steps);
    return [cx + rx * Math.cos(a), cy + ry * Math.sin(a)];
  });
}

const ring = (cx: number, cy: number, rx: number, ry = rx) => arc(cx, cy, rx, ry, 0, 360);

// A dot: the pen set down and lifted.
const dot = (x: number, y: number): P[] => [
  [x, y],
  [x + 0.01, y],
];

const join = (...parts: P[][]): P[] => parts.flat();

// A smooth line through the points (Catmull-Rom), evenly spaced; `closed` joins the ends.
function smooth(points: P[], closed = false): P[] {
  const n = points.length;
  const at = (i: number): P => {
    if (closed) return points[((i % n) + n) % n]!;
    if (i < 0) return [2 * points[0]![0] - points[1]![0], 2 * points[0]![1] - points[1]![1]];
    if (i >= n) {
      const [a, b] = [points[n - 1]!, points[n - 2]!];
      return [2 * a[0] - b[0], 2 * a[1] - b[1]];
    }
    return points[i]!;
  };
  const fine: P[] = [];
  const segments = closed ? n : n - 1;
  for (let i = 0; i < segments; i++) {
    const [p0, p1, p2, p3] = [at(i - 1), at(i), at(i + 1), at(i + 2)];
    for (let s = 0; s < 24; s++) {
      const t = s / 24;
      const f = (k: 0 | 1) =>
        0.5 *
        (2 * p1[k] +
          (p2[k] - p0[k]) * t +
          (2 * p0[k] - 5 * p1[k] + 4 * p2[k] - p3[k]) * t * t +
          (3 * p1[k] - p0[k] - 3 * p2[k] + p3[k]) * t * t * t);
      fine.push([f(0), f(1)]);
    }
  }
  fine.push(closed ? points[0]! : points[n - 1]!);
  // The same line at even steps.
  const out: P[] = [fine[0]!];
  let carried = 0;
  for (let i = 1; i < fine.length; i++) {
    const [a, b] = [fine[i - 1]!, fine[i]!];
    const length = Math.hypot(b[0] - a[0], b[1] - a[1]);
    let along = STEP - carried;
    while (along <= length) {
      out.push([a[0] + ((b[0] - a[0]) * along) / length, a[1] + ((b[1] - a[1]) * along) / length]);
      along += STEP;
    }
    carried = (carried + length) % STEP;
  }
  out.push(fine[fine.length - 1]!);
  return out;
}

// A side that bows towards `via` (a quadratic curve).
function bow(a: P, via: P, b: P): P[] {
  return Array.from({ length: 25 }, (_, i): P => {
    const t = i / 24;
    const u = 1 - t;
    return [
      u * u * a[0] + 2 * u * t * via[0] + t * t * b[0],
      u * u * a[1] + 2 * u * t * via[1] + t * t * b[1],
    ];
  });
}

const turned = (points: P[], degrees: number): P[] => {
  const [c, s] = [Math.cos(rad(degrees)), Math.sin(rad(degrees))];
  return points.map(([x, y]) => [
    50 + (x - 50) * c - (y - 50) * s,
    50 + (x - 50) * s + (y - 50) * c,
  ]);
};

const SCRIBBLE_KEYWORDS: Record<string, string> = {
  spiral: "swirl twirl squiggle",
  loops: "handwriting squiggle scribble writing",
  star: "favourite favorite",
  heart: "love like",
  hatch: "lines stripes sketch",
  cloud: "weather sky",
  flower: "plant bloom garden",
  waves: "water sea ocean",
  sun: "day light weather summer",
  coil: "ring squiggle wreath",
};

function doodle(id: string, name: string, keywords: string, strokes: () => P[][]): Doodle {
  return { id, name, keywords, strokes };
}

const THINGS: Doodle[] = [
  doodle("page", "Page", "document file note paper", () => [
    shape([32, 23], [57, 23], [70, 36], [70, 77], [32, 77]),
    line([57, 23], [57, 36], [70, 36]),
    line([42, 52], [60, 52]),
    line([42, 64], [60, 64]),
  ]),
  doodle("book", "Book", "read library docs guide", () => [
    line([50, 36], [25, 29], [25, 68], [50, 75], [75, 68], [75, 29], [50, 36], [50, 75]),
  ]),
  doodle("pencil", "Pencil", "write edit draft pen", () => [
    shape([26, 74], [30, 58], [62, 26], [74, 38], [42, 70]),
    line([30, 58], [42, 70]),
  ]),
  doodle("bulb", "Light bulb", "idea thought insight", () => [
    join(
      line([42, 68], [42, 60]),
      arc(50, 42, 19, 19, 115, 425),
      line([58, 60], [58, 68], [42, 68]),
    ),
    line([45, 77], [55, 77]),
  ]),
  doodle("flag", "Flag", "milestone goal mark", () => [
    line([29, 23], [29, 78]),
    join(
      smooth([
        [29, 27],
        [43, 23],
        [57, 31],
        [73, 27],
      ]),
      line([73, 27], [73, 52]),
      smooth([
        [73, 52],
        [57, 56],
        [43, 48],
        [29, 52],
      ]),
    ),
  ]),
  doodle("house", "House", "home building", () => [
    line([21, 50], [50, 24], [79, 50]),
    line([30, 44], [30, 77], [70, 77], [70, 44]),
    line([44, 77], [44, 60], [56, 60], [56, 77]),
  ]),
  doodle("check", "Check", "done tick task todo complete", () => [
    line([23, 52], [42, 71], [78, 29]),
  ]),
  doodle("target", "Target", "goal aim focus bullseye", () => [
    ring(50, 50, 27),
    ring(50, 50, 13),
    dot(50, 50),
  ]),
  doodle("calendar", "Calendar", "date schedule plan day", () => [
    shape([23, 32], [77, 32], [77, 77], [23, 77]),
    line([23, 47], [77, 47]),
    line([38, 23], [38, 37]),
    line([62, 23], [62, 37]),
  ]),
  doodle("clock", "Clock", "time hour schedule", () => [
    ring(50, 50, 27),
    line([50, 32], [50, 50], [63, 58]),
  ]),
  doodle("mail", "Envelope", "mail email letter message inbox", () => [
    shape([21, 31], [79, 31], [79, 71], [21, 71]),
    line([21, 33], [50, 55], [79, 33]),
  ]),
  doodle("chat", "Speech bubble", "chat comment talk message discussion", () => [
    shape([23, 27], [77, 27], [77, 62], [51, 62], [36, 77], [36, 62], [23, 62]),
  ]),
  doodle("bell", "Bell", "notification alert reminder", () => [
    join(
      smooth([
        [25, 66],
        [33, 58],
        [35, 42],
        [41, 30],
        [50, 26],
        [59, 30],
        [65, 42],
        [67, 58],
        [75, 66],
      ]),
      line([75, 66], [25, 66]),
    ),
    arc(50, 70, 6, 7, 0, 180),
  ]),
  doodle("key", "Key", "password access secret", () => [
    ring(35, 50, 13),
    line([48, 50], [80, 50]),
    line([67, 50], [67, 62]),
    line([77, 50], [77, 60]),
  ]),
  doodle("lock", "Lock", "private secure security", () => [
    shape([27, 46], [73, 46], [73, 78], [27, 78]),
    join(line([36, 46], [36, 36]), arc(50, 36, 14, 14, 180, 360), line([64, 36], [64, 46])),
    line([50, 58], [50, 66]),
  ]),
  doodle("folder", "Folder", "files project directory", () => [
    shape([21, 29], [42, 29], [49, 39], [79, 39], [79, 73], [21, 73]),
  ]),
  doodle("bookmark", "Bookmark", "save read later", () => [
    shape([32, 22], [68, 22], [68, 78], [50, 62], [32, 78]),
  ]),
  doodle("pin", "Map pin", "place location map where", () => [
    join(arc(50, 41, 20, 20, 140, 400), line([65.3, 53.9], [50, 80], [34.7, 53.9])),
    ring(50, 41, 6),
  ]),
  doodle("globe", "Globe", "world earth web travel international", () => [
    ring(50, 50, 27),
    ring(50, 50, 12, 27),
    line([23, 50], [77, 50]),
  ]),
  doodle("mountain", "Mountain", "hike outdoors peak nature", () => [
    line([19, 73], [40, 29], [52, 54], [61, 42], [81, 73], [19, 73]),
  ]),
  doodle("tree", "Tree", "nature forest pine", () => [
    shape([50, 20], [74, 62], [26, 62]),
    line([50, 62], [50, 80]),
  ]),
  doodle("leaf", "Leaf", "nature plant green eco", () => [
    smooth(
      [
        [26, 74],
        [28, 46],
        [46, 27],
        [75, 25],
        [73, 53],
        [55, 71],
      ],
      true,
    ),
    line([26, 74], [60, 40]),
  ]),
  doodle("sprout", "Sprout", "plant grow seedling new", () => [
    smooth([
      [50, 80],
      [49, 64],
      [50, 47],
    ]),
    smooth([
      [50, 60],
      [38, 59],
      [26, 47],
      [25, 36],
      [38, 38],
      [48, 49],
      [50, 60],
    ]),
    smooth([
      [50, 47],
      [52, 34],
      [62, 24],
      [75, 21],
      [73, 34],
      [63, 44],
      [50, 47],
    ]),
  ]),
  doodle("moon", "Moon", "night sleep dark", () => [
    join(arc(48, 50, 27, 27, 40, 320), arc(65, 50, 17.6, 17.6, 279.6, 80.4)),
  ]),
  doodle("bolt", "Lightning", "energy fast power electric", () => [
    shape([57, 20], [29, 54], [47, 54], [42, 80], [71, 45], [53, 45]),
  ]),
  doodle("drop", "Drop", "water ink rain", () => [
    join(arc(50, 57, 21, 21, -55, 235), line([38, 39.8], [50, 20], [62, 39.8])),
  ]),
  doodle("flame", "Flame", "fire hot streak", () => [
    smooth(
      [
        [50, 20],
        [60, 36],
        [71, 54],
        [65, 72],
        [50, 79],
        [35, 72],
        [29, 56],
        [34, 43],
        [42, 50],
        [45, 35],
      ],
      true,
    ),
  ]),
  doodle("rainbow", "Rainbow", "colour color weather", () => [
    arc(50, 66, 29, 29, 180, 360),
    arc(50, 66, 18, 18, 180, 360),
    arc(50, 66, 7, 7, 180, 360),
  ]),
  doodle("planet", "Planet", "space saturn science", () => [
    ring(50, 50, 16),
    turned(ring(50, 50, 31, 9), -20),
  ]),
  doodle("rocket", "Rocket", "launch ship space release", () =>
    [
      join(
        smooth([
          [39, 62],
          [38, 40],
          [50, 17],
          [62, 40],
          [61, 62],
        ]),
        line([61, 62], [39, 62]),
      ),
      line([38, 48], [26, 66], [39, 62]),
      line([62, 48], [74, 66], [61, 62]),
      line([50, 70], [50, 82]),
      dot(50, 42),
    ].map((stroke) => turned(stroke, 40)),
  ),
  doodle("plane", "Paper plane", "send travel flight", () => [
    shape([19, 46], [81, 21], [60, 79], [46, 58]),
    line([46, 58], [81, 21]),
  ]),
  doodle("boat", "Boat", "sail sea ship travel", () => [
    shape([19, 59], [81, 59], [68, 77], [32, 77]),
    line([47, 59], [47, 21], [71, 50], [47, 50]),
  ]),
  doodle("balloon", "Balloon", "party celebrate birthday", () => [
    ring(50, 40, 18, 20),
    smooth([
      [50, 60],
      [46, 67],
      [54, 73],
      [50, 80],
    ]),
  ]),
  doodle("gift", "Gift", "present birthday surprise", () => [
    shape([25, 46], [75, 46], [75, 78], [25, 78]),
    line([50, 46], [50, 78]),
    smooth([
      [50, 46],
      [38, 40],
      [31, 29],
      [41, 25],
      [50, 46],
      [59, 25],
      [69, 29],
      [62, 40],
      [50, 46],
    ]),
  ]),
  doodle("trophy", "Trophy", "win award prize cup", () => [
    join(
      line([33, 23], [67, 23]),
      smooth([
        [67, 23],
        [65, 43],
        [50, 55],
        [35, 43],
        [33, 23],
      ]),
    ),
    line([50, 55], [50, 70]),
    line([36, 78], [64, 78]),
    arc(33, 33, 9, 8, 270, 90),
    arc(67, 33, 9, 8, -90, 90),
  ]),
  doodle("crown", "Crown", "king queen best top", () => [
    shape([25, 73], [21, 33], [38, 52], [50, 26], [62, 52], [79, 33], [75, 73]),
  ]),
  doodle("gem", "Gem", "diamond value precious", () => [
    shape([35, 27], [65, 27], [80, 44], [50, 78], [20, 44]),
    line([20, 44], [80, 44]),
  ]),
  doodle("sparkle", "Sparkle", "new magic shine ai", () => {
    const tips: P[] = [
      [50, 20],
      [80, 50],
      [50, 80],
      [20, 50],
    ];
    return [
      join(
        ...tips.map((tip, i) => {
          const next = tips[(i + 1) % 4]!;
          return bow(
            tip,
            [50 + (tip[0] + next[0] - 100) * 0.12, 50 + (tip[1] + next[1] - 100) * 0.12],
            next,
          );
        }),
      ),
    ];
  }),
  doodle("note", "Music", "note song sound audio", () => [
    ring(34, 69, 9, 7),
    ring(65, 63, 9, 7),
    line([43, 69], [43, 30], [74, 23], [74, 63]),
  ]),
  doodle("camera", "Camera", "photo picture image", () => [
    shape([21, 36], [37, 36], [42, 26], [58, 26], [63, 36], [79, 36], [79, 74], [21, 74]),
    ring(50, 54, 10),
  ]),
  doodle("eye", "Eye", "see look watch view", () => [
    join(
      smooth([
        [20, 50],
        [35, 35],
        [50, 31],
        [65, 35],
        [80, 50],
      ]),
      smooth([
        [80, 50],
        [65, 65],
        [50, 69],
        [35, 65],
        [20, 50],
      ]),
    ),
    ring(50, 50, 8),
  ]),
  doodle("smile", "Smile", "face happy", () => [
    ring(50, 50, 27),
    line([41, 39], [41, 46]),
    line([59, 39], [59, 46]),
    arc(50, 51, 15, 15, 25, 155),
  ]),
  doodle("person", "Person", "people user profile team", () => [
    ring(50, 34, 12),
    smooth([
      [26, 78],
      [29, 62],
      [50, 54],
      [71, 62],
      [74, 78],
    ]),
  ]),
  doodle("cat", "Cat", "pet animal", () => [
    shape([26, 24], [41, 35], [59, 35], [74, 24], [76, 56], [63, 75], [37, 75], [24, 56]),
    dot(41, 54),
    dot(59, 54),
  ]),
  doodle("fish", "Fish", "sea animal", () => [
    join(
      line([81, 34], [66, 50]),
      smooth([
        [66, 50],
        [54, 37],
        [37, 35],
        [20, 50],
        [37, 65],
        [54, 63],
        [66, 50],
      ]),
      line([66, 50], [81, 66], [81, 34]),
    ),
    dot(35, 47),
  ]),
  doodle("apple", "Apple", "fruit food health", () => [
    smooth(
      [
        [50, 39],
        [60, 34],
        [72, 41],
        [73, 57],
        [63, 76],
        [50, 73],
        [37, 76],
        [27, 57],
        [28, 41],
        [40, 34],
      ],
      true,
    ),
    smooth([
      [50, 39],
      [52, 28],
      [59, 21],
    ]),
  ]),
  doodle("cup", "Cup", "coffee tea drink break", () => [
    shape([25, 33], [65, 33], [61, 74], [29, 74]),
    arc(63, 51, 14, 12, -70, 70),
  ]),
  doodle("umbrella", "Umbrella", "rain weather cover", () => [
    join(arc(50, 50, 29, 29, 180, 360), line([79, 50], [21, 50])),
    join(line([50, 50], [50, 72]), arc(44, 72, 6, 7, 0, 180)),
  ]),
  doodle("search", "Magnifier", "search find research look", () => [
    ring(43, 43, 19),
    line([57, 57], [79, 79]),
  ]),
  doodle("gear", "Gear", "settings cog config tools", () => [
    Array.from({ length: 241 }, (_, i): P => {
      const t = (i / 240) * Math.PI * 2;
      const r = 24 + 4.5 * Math.max(-1, Math.min(1, 2.2 * Math.sin(8 * t)));
      return [50 + r * Math.cos(t), 50 + r * Math.sin(t)];
    }),
    ring(50, 50, 8),
  ]),
  doodle("chart", "Chart", "graph growth data stats analytics", () => [
    line([22, 22], [22, 78], [79, 78]),
    line([34, 63], [46, 48], [56, 57], [75, 31]),
  ]),
  doodle("code", "Code", "developer programming engineering", () => [
    line([36, 31], [19, 50], [36, 69]),
    line([64, 31], [81, 50], [64, 69]),
    line([56, 25], [44, 75]),
  ]),
  doodle("cube", "Cube", "box package product 3d", () => {
    const corner = (k: number): P => [
      50 + 29 * Math.cos(rad(-90 + 60 * k)),
      50 + 29 * Math.sin(rad(-90 + 60 * k)),
    ];
    return [
      shape(...Array.from({ length: 6 }, (_, k) => corner(k))),
      line(corner(5), [50, 50], corner(1)),
      line([50, 50], corner(3)),
    ];
  }),
  doodle("arrow", "Arrow", "next direction forward", () => [
    line([21, 50], [79, 50]),
    line([58, 29], [79, 50], [58, 71]),
  ]),
];

// The avatars' doodles first: they are the squiggles Lydie is known by.
export const DOODLES: Doodle[] = [
  ...SCRIBBLES.map((scribble) => ({ ...scribble, keywords: SCRIBBLE_KEYWORDS[scribble.id] ?? "" })),
  ...THINGS,
];

const BY_ID = new Map(DOODLES.map((d) => [d.id, d]));

// Colours a doodle can be drawn in, by the name kept in the file; the classes follow the theme.
// Gray, the default, is the text's own colour.
export const DOODLE_COLORS = {
  gray: "text-gray-600",
  brown: "text-[#9a6b43]",
  orange: "text-orange-500",
  yellow: "text-amber-500",
  green: "text-green-600",
  blue: "text-blue-600",
  purple: "text-purple-600",
  pink: "text-pink-500",
  red: "text-red-500",
} as const;
export type DoodleColor = keyof typeof DOODLE_COLORS;

// A doodle as an icon is the text `doodle:star`, or `doodle:star:blue` in a colour, so it can be
// kept wherever an emoji can (a page's `icon` property).
const PREFIX = "doodle:";

export type DoodleRef = { doodle: Doodle; color: DoodleColor };

export function doodleIcon(id: string, color: DoodleColor = "gray"): string {
  return color === "gray" ? `${PREFIX}${id}` : `${PREFIX}${id}:${color}`;
}

// null when the icon is not a doodle (an emoji), or names one we do not have.
export function parseDoodleIcon(icon: string | null | undefined): DoodleRef | null {
  if (!icon?.startsWith(PREFIX)) return null;
  const [id = "", color = "gray"] = icon.slice(PREFIX.length).toLowerCase().split(":");
  const found = BY_ID.get(id);
  if (!found) return null;
  return {
    doodle: found,
    color: Object.hasOwn(DOODLE_COLORS, color) ? (color as DoodleColor) : "gray",
  };
}

// The box a doodle is drawn in: the 100 box without the margin the paper had.
export const DOODLE_VIEW_BOX = "12 12 76 76";

// The line's width in the box's units: about 1.5 px when small, a little lighter when large.
export const doodleStrokeWidth = (size: number) => Math.max(4.4, (1.5 * 76) / size);

const drawn = new Map<string, { paths: string[]; transform: string }>();

// The doodle's strokes as paths, each with its own steady wobble and tilt.
export function doodlePaths(doodle: Doodle): { paths: string[]; transform: string } {
  let made = drawn.get(doodle.id);
  if (!made) {
    made = strokesFor({ scribble: doodle, pen: "", seed: doodle.id });
    drawn.set(doodle.id, made);
  }
  return made;
}

// A doodle as SVG markup in the current text colour, 1em square and sitting on the line of text:
// for places React does not draw (an editor decoration).
export function doodleMarkup(doodle: Doodle, size = 16): string {
  const { paths, transform } = doodlePaths(doodle);
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${DOODLE_VIEW_BOX}" width="1em" height="1em" style="display:inline-block;vertical-align:-0.15em" aria-hidden="true">` +
    `<g transform="${transform}" fill="none" stroke="currentColor" stroke-width="${doodleStrokeWidth(size).toFixed(2)}" stroke-linecap="round" stroke-linejoin="round">` +
    paths.map((d) => `<path d="${d}"/>`).join("") +
    `</g></svg>`
  );
}
