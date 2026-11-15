import {
  Avatar,
  BotAvatar,
  CUT_COLORS,
  cutCenterline,
  cutEdge,
  cutFor,
  cutOutlinePieces,
  cutRotate,
  cutSample,
  fmt,
  MARK_PIECES,
  MARK_SHAPE,
  SpaceIcon,
  SQUIRCLE_PATH,
  squirclePieces,
} from "@lydie/ui";
import type { CutPoint, CutShape } from "@lydie/ui";
import { useId } from "react";
import type { ReactNode } from "react";

export type Kind = "person" | "workspace" | "robot";

export type Variant = {
  id: string;
  name: string;
  description: string;
  render: (seed: string, size: number) => ReactNode;
};

// Ink for machines: near the brand's own ink, a step lighter so it still reads on dark.
const INK = "#26282e";
// A faint light edge on ink, so machines do not vanish on a dark surface; on light it is lost in
// the anti-aliasing.
const RIM = { stroke: "#fff", strokeOpacity: 0.22, strokeWidth: 2.5 } as const;

// Robots' light colours: screen colours, not the people's.
const LIGHTS = ["#5ce1e6", "#c6f432", "#ffd23f", "#7cf5b0", "#8fb8ff", "#ff9ecf"];

function hash(seed: string): number {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}
const pick = <T,>(items: readonly T[], seed: string, salt: string) =>
  items[hash(`${salt}:${seed}`) % items.length]!;

const colorsOf = (seed: string): readonly string[] => cutFor(seed).colors;

function Svg({ size, children }: { size: number; children: ReactNode }) {
  return (
    <svg viewBox="0 0 100 100" width={size} height={size} aria-hidden className="shrink-0">
      {children}
    </svg>
  );
}

// The canonical mark, in one colour per piece, optionally turned.
function Pieces({
  colors,
  turn = 0,
  rim,
}: {
  colors: readonly string[];
  turn?: number;
  rim?: boolean;
}) {
  return (
    <g transform={turn ? `rotate(${turn} 50 50)` : undefined}>
      {MARK_PIECES.map((d, i) => (
        <path key={i} d={d} fill={colors[i % colors.length]} {...(rim ? RIM : {})} />
      ))}
    </g>
  );
}

const scaled = (scale: number) => `translate(50 50) scale(${fmt(scale)}) translate(-50 -50)`;

// The band's centreline where it is at least `inset` inside the circle, as an open path: the
// light strip of a visor.
function stripPath(shape: CutShape, inset: number): string {
  const band = shape.bands[0]!;
  const line = cutCenterline(band);
  const inside = (x: number) => Math.hypot(x - 50, line(x) - 50) < 50 - inset;
  let from = 50;
  let to = 50;
  while (from > -50 && inside(from - 0.5)) from -= 0.5;
  while (to < 150 && inside(to + 0.5)) to += 0.5;
  return cutSample(line, from, to, 32)
    .map((p, i) => {
      const q = cutRotate(p, shape.tilt);
      return `${i ? "L" : "M"}${fmt(q[0])} ${fmt(q[1])}`;
    })
    .join("");
}

// Which piece a point of the 100 box falls in: 0 above the band, 1 below, -1 the gap or outside.
function pieceAt(shape: CutShape, p: CutPoint): number {
  const q = cutRotate(p, -shape.tilt);
  if (Math.hypot(q[0] - 50, q[1] - 50) > 50) return -1;
  const band = shape.bands[0]!;
  if (q[1] < cutEdge(band, shape.taper, -1)(q[0])) return 0;
  if (q[1] > cutEdge(band, shape.taper, 1)(q[0])) return 1;
  return -1;
}

// A hexagon with rounded corners, clockwise from the top, as a polyline.
const HEXAGON: CutPoint[] = (() => {
  const out: CutPoint[] = [];
  const r = 50;
  const round = 12;
  for (let k = 0; k < 6; k++) {
    const a = ((k * 60 - 90) * Math.PI) / 180;
    // The corner's arc centre, pulled in so the rounded hexagon still touches the box.
    const d = r - round / Math.cos(Math.PI / 6);
    const cx = 50 + d * Math.cos(a);
    const cy = 50 + d * Math.sin(a);
    for (let i = 0; i <= 6; i++) {
      const t = a - Math.PI / 6 + (i / 6) * (Math.PI / 3);
      out.push([cx + round * Math.cos(t), cy + round * Math.sin(t)]);
    }
  }
  return out;
})();

export const PEOPLE_VARIANTS: Variant[] = [
  {
    id: "scribble",
    name: "Scribbles",
    description:
      "What the app has now: a doodle in pen on a round scrap of beige paper (a photo when they have one).",
    render: (seed, size) => <Avatar seed={seed} size={size} />,
  },
  {
    id: "mark",
    name: "The mark, turned",
    description: "The mark in one of eight turns, in two colours.",
    render: (seed, size) => (
      <Svg size={size}>
        <Pieces colors={colorsOf(seed)} turn={cutFor(seed).turn} />
      </Svg>
    ),
  },
  {
    id: "upright",
    name: "The mark, upright",
    description: "Always the logo's own angle; only the colours change. Most like the brand.",
    render: (seed, size) => (
      <Svg size={size}>
        <Pieces colors={colorsOf(seed)} />
      </Svg>
    ),
  },
  {
    id: "disc",
    name: "On a disc",
    description:
      "The upright mark on a pale disc of a third colour: a softer, framed profile picture.",
    render: (seed, size) => (
      <Svg size={size}>
        <circle
          cx={50}
          cy={50}
          r={50}
          style={{
            fill: `color-mix(in oklab, ${pick(CUT_COLORS, seed, "disc")} 24%, transparent)`,
          }}
        />
        <g transform={scaled(0.72)}>
          <Pieces colors={colorsOf(seed)} />
        </g>
      </Svg>
    ),
  },
];

const fourTurns = (seed: string) => pick([0, 90, 180, 270], seed, "turn");

export const WORKSPACE_VARIANTS: Variant[] = [
  {
    id: "scribble",
    name: "Scribbled tile",
    description: "What the app has now: the same doodles on a beige squircle.",
    render: (seed, size) => <SpaceIcon seed={seed} size={size} />,
  },
  {
    id: "band",
    name: "Band across a squircle",
    description: "The mark's band across a squircle, eight turns.",
    render: (seed, size) => {
      const { turn, colors } = cutFor(seed);
      const [top, bottom] = squirclePieces(turn);
      return (
        <Svg size={size}>
          {top && <path d={top} fill={colors[0]} />}
          {bottom && <path d={bottom} fill={colors[1]} />}
        </Svg>
      );
    },
  },
  {
    id: "band-four",
    name: "Band, four turns",
    description: "The same, but only the four square turns: the band never clips a corner.",
    render: (seed, size) => {
      const [top, bottom] = squirclePieces(fourTurns(seed));
      const colors = cutFor(seed).colors;
      return (
        <Svg size={size}>
          {top && <path d={top} fill={colors[0]} />}
          {bottom && <path d={bottom} fill={colors[1]} />}
        </Svg>
      );
    },
  },
  {
    id: "app-icon",
    name: "Its own app icon",
    description:
      "A solid squircle with the white mark, like Lydie's app icon: every workspace gets one in its colour.",
    render: (seed, size) => {
      return (
        <Svg size={size}>
          <path d={SQUIRCLE_PATH} fill={cutFor(seed).colors[0]} />
          <g transform={scaled(0.66)}>
            <Pieces colors={["#fff"]} />
          </g>
        </Svg>
      );
    },
  },
  {
    id: "tile",
    name: "Mark on a tile",
    description: "The person's mark on a pale squircle: places and people share one look.",
    render: (seed, size) => {
      return (
        <Svg size={size}>
          <path
            d={SQUIRCLE_PATH}
            style={{
              fill: `color-mix(in oklab, ${pick(CUT_COLORS, seed, "tile")} 26%, transparent)`,
            }}
          />
          <g transform={scaled(0.68)}>
            <Pieces colors={colorsOf(seed)} />
          </g>
        </Svg>
      );
    },
  },
];

function Visor({ seed, size }: { seed: string; size: number }) {
  const shape = MARK_SHAPE;
  const light = pick(LIGHTS, seed, "light");
  const thick = shape.bands[0]!.thick;
  return (
    <Svg size={size}>
      <Pieces colors={[INK]} rim />
      <path
        d={stripPath(shape, thick * 0.35)}
        fill="none"
        stroke={light}
        strokeWidth={thick * 0.55}
        strokeLinecap="round"
      />
    </Svg>
  );
}

export const ROBOT_VARIANTS: Variant[] = [
  {
    id: "screen",
    name: "On a screen",
    description:
      "What the app has now: the same doodles in a light colour on a dark screen (the app's logo when it has one), with the person it worked for as a badge.",
    render: (seed, size) => (
      <BotAvatar seed={seed} size={size} behalf={size >= 20 ? { seed: "Maya Lindqvist" } : null} />
    ),
  },
  {
    id: "visor",
    name: "Visor",
    description:
      "The mark in ink with its band lit up: where a person has a gap, a machine has a screen. One light colour each.",
    render: (seed, size) => <Visor seed={seed} size={size} />,
  },
  {
    id: "moon",
    name: "A moon",
    description:
      "Only the crescent, lit, on an ink disc: machines are the small things that go round your work. The mascot's moon, too.",
    render: (seed, size) => (
      <Svg size={size}>
        <circle cx={50} cy={50} r={48.75} fill={INK} {...RIM} />
        <g transform="translate(50 50) scale(0.95) translate(-64 -77)">
          <path d={MARK_PIECES[1]} fill={pick(LIGHTS, seed, "light")} />
        </g>
      </Svg>
    ),
  },
  {
    id: "hexagon",
    name: "Hexagon",
    description:
      "The band across a hexagon in ink, the light in the gap: a nut or a chip, never a person or a place.",
    render: (seed, size) => {
      const shape = { ...MARK_SHAPE, fillet: 2.4 };
      const [top, bottom] = cutOutlinePieces(HEXAGON, shape);
      const light = pick(LIGHTS, seed, "light");
      const thick = shape.bands[0]!.thick;
      return (
        <Svg size={size}>
          {top && <path d={top} fill={INK} {...RIM} />}
          {bottom && <path d={bottom} fill={INK} {...RIM} />}
          <path
            d={stripPath(shape, 10)}
            fill="none"
            stroke={light}
            strokeWidth={thick * 0.45}
            strokeLinecap="round"
          />
        </Svg>
      );
    },
  },
  {
    id: "pixel",
    name: "Pixels",
    description:
      "The mark sampled onto a 12 × 12 grid: the same shape, rendered by a machine. Colours from the light set.",
    render: (seed, size) => {
      const shape = MARK_SHAPE;
      const light = pick(LIGHTS, seed, "light");
      const cells: ReactNode[] = [];
      const n = 12;
      const cell = 100 / n;
      for (let j = 0; j < n; j++) {
        for (let i = 0; i < n; i++) {
          const piece = pieceAt(shape, [(i + 0.5) * cell, (j + 0.5) * cell]);
          if (piece < 0) continue;
          cells.push(
            <rect
              key={`${i}:${j}`}
              x={i * cell + 0.7}
              y={j * cell + 0.7}
              width={cell - 1.4}
              height={cell - 1.4}
              rx={1.4}
              fill={piece === 0 ? INK : light}
            />,
          );
        }
      }
      return <Svg size={size}>{cells}</Svg>;
    },
  },
  {
    id: "wire",
    name: "Wireframe",
    description: "The mark as an outline in its light colour on ink: a drawing, not a body.",
    render: (seed, size) => (
      <Svg size={size}>
        <circle cx={50} cy={50} r={48.75} fill={INK} {...RIM} />
        <g transform={scaled(0.74)}>
          {MARK_PIECES.map((d, i) => (
            <path
              key={i}
              d={d}
              fill="none"
              stroke={pick(LIGHTS, seed, "light")}
              strokeWidth={7}
              strokeLinejoin="round"
            />
          ))}
        </g>
      </Svg>
    ),
  },
  {
    id: "badge",
    name: "Mark with a plug",
    description:
      "A person's mark with a small ink badge: the app acts for someone, so it borrows their look.",
    render: (seed, size) => <Badged seed={seed} size={size} />,
  },
];

function Badged({ seed, size }: { seed: string; size: number }) {
  const id = useId().replace(/[^a-zA-Z0-9]/g, "");
  return (
    <Svg size={size}>
      <mask id={id} maskUnits="userSpaceOnUse" x={0} y={0} width={100} height={100}>
        <rect width={100} height={100} fill="#fff" />
        <rect x={52} y={52} width={56} height={56} rx={18} fill="#000" />
      </mask>
      <g mask={`url(#${id})`}>
        <Pieces colors={colorsOf(seed)} />
      </g>
      <rect x={60} y={60} width={40} height={40} rx={13} fill={INK} {...RIM} />
      {/* A plug: two prongs over a body. */}
      <g fill={pick(LIGHTS, seed, "light")}>
        <rect x={72} y={67} width={4} height={8} rx={2} />
        <rect x={84} y={67} width={4} height={8} rx={2} />
        <rect x={69} y={74} width={22} height={11} rx={4} />
        <rect x={78} y={84} width={4} height={8} rx={2} />
      </g>
    </Svg>
  );
}

export const VARIANTS: Record<Kind, Variant[]> = {
  person: PEOPLE_VARIANTS,
  workspace: WORKSPACE_VARIANTS,
  robot: ROBOT_VARIANTS,
};
