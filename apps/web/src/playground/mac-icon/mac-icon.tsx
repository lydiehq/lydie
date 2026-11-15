import { MARK_PATH as MARK } from "@lydie/ui";
import { useId } from "react";
import type { ReactNode, Ref } from "react";

// macOS app icons are drawn on a 1024 canvas: an 824 body centred with 100 of padding for the
// shadow, corner radius about 22.4% of the body, with continuous ("squircle") corners.
export const CANVAS = 1024;
const BODY = 824;
const INSET = (CANVAS - BODY) / 2;
const RADIUS = 184;

// One corner of UIKit's continuous rounded rect, as multiples of the radius: the first coordinate
// runs back along the incoming edge, the second along the outgoing one.
const CORNER: [number, number][][] = [
  [
    [1.08849323, 0],
    [0.86840689, 0.02229071],
    [0.63149399, 0.074911],
  ],
  [
    [0.37282392, 0.16905899],
    [0.16905899, 0.37282392],
    [0.074911, 0.63149399],
  ],
  [
    [0.02229071, 0.86840689],
    [0, 1.08849323],
    [0, 1.52866483],
  ],
];
const START = 1.52866483;

function squirclePath(x: number, y: number, size: number, r: number): string {
  const right = x + size;
  const bottom = y + size;
  // Corner point, direction back along the incoming edge, direction along the outgoing edge.
  const corners: [number, number, number, number, number, number][] = [
    [right, y, -1, 0, 0, 1],
    [right, bottom, 0, -1, -1, 0],
    [x, bottom, 1, 0, 0, -1],
    [x, y, 0, 1, 1, 0],
  ];
  const fmt = (n: number) => Math.round(n * 100) / 100;
  let d = "";
  for (const [cx, cy, ax, ay, bx, by] of corners) {
    const at = (p: number, q: number) =>
      `${fmt(cx + (p * ax + q * bx) * r)} ${fmt(cy + (p * ay + q * by) * r)}`;
    d += `${d ? "L" : "M"}${at(START, 0)}`;
    for (const curve of CORNER) d += `C${curve.map(([p, q]) => at(p, q)).join(" ")}`;
  }
  return `${d}Z`;
}

const BODY_PATH = squirclePath(INSET, INSET, BODY, RADIUS);

// Colour helpers: everything in a variant derives from the one theme colour.
type Hsl = { h: number; s: number; l: number };

function toHsl(hex: string): Hsl {
  const n = Number.parseInt(hex.slice(1), 16);
  const r = ((n >> 16) & 255) / 255;
  const g = ((n >> 8) & 255) / 255;
  const b = (n & 255) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return { h: 0, s: 0, l };
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  const h =
    max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return { h: h * 60, s, l };
}

function hsl({ h, s, l }: Hsl): string {
  const clamp = (n: number) => Math.min(1, Math.max(0, n));
  return `hsl(${Math.round(h)} ${Math.round(clamp(s) * 100)}% ${Math.round(clamp(l) * 100)}%)`;
}

function shade(hex: string, dl: number, ds = 0, dh = 0): string {
  const c = toHsl(hex);
  return hsl({ h: c.h + dh, s: c.s + ds, l: c.l + dl });
}

export type Variant = {
  id: string;
  name: string;
  description: string;
  round: 1 | 2 | 3;
  // A light background, which takes a dark hairline instead of a lit rim.
  light?: boolean;
};

export const VARIANTS: Variant[] = [
  {
    id: "flat-white",
    round: 3,
    light: true,
    name: "White",
    description: "The mark in the theme colour on white. Flat fills, soft shadow under the mark.",
  },
  {
    id: "flat-petal",
    round: 3,
    name: "Petal",
    description:
      "Round 1's Petal colour (the middle of its gradient: a touch lighter and rosier) as a flat fill, white mark with its shadow.",
  },
  {
    id: "flat-colour",
    round: 3,
    name: "Colour",
    description:
      "Round 1's Petal without gradients: flat theme colour, white mark with its shadow.",
  },
  {
    id: "flat-ink",
    round: 3,
    name: "Ink",
    description:
      "Round 1's Ink without gradients or glow: flat near-black, mark in the theme colour.",
  },
  {
    id: "seal",
    round: 2,
    light: true,
    name: "Seal",
    description:
      "A wax seal in the theme colour with the mark pressed in, on cream paper. A letter, signed.",
  },
  {
    id: "notebook",
    round: 2,
    light: true,
    name: "Notebook",
    description:
      "An object, like Notes or Pages: a cloth notebook with an elastic band, ribbon and a debossed mark.",
  },
  {
    id: "bleed",
    round: 2,
    name: "Bleed",
    description:
      "The mark blown up past the edges: two big cream swooshes. Editorial, bold, no centred logo.",
  },
  {
    id: "aura",
    round: 2,
    name: "Aura",
    description: "A grainy pink, peach and lilac glow with the mark in deep plum. Soft but modern.",
  },
  {
    id: "petal",
    round: 1,
    name: "Petal",
    description:
      "The theme colour as a soft gradient, white mark. Friendly and bright in the Dock.",
  },
  {
    id: "ink",
    round: 1,
    name: "Ink",
    description:
      "Today's dark icon with the mark in the theme colour. Quiet, premium, high contrast.",
  },
  {
    id: "paper",
    round: 1,
    light: true,
    name: "Paper",
    description: "Warm paper with a tinted mark, like a notebook cover. Calm and writerly.",
  },
  {
    id: "glass",
    round: 1,
    name: "Glass",
    description: "Tahoe-style: deep tint, specular sheen and a frosted mark with a lit edge.",
  },
];

type Props = {
  variant: string;
  color: string;
  // Share of the body taken by the mark (0–1).
  markScale: number;
  size?: number;
  className?: string;
  ref?: Ref<SVGSVGElement>;
};

export function MacIcon({ variant, color, markScale, size = 256, className, ref }: Props) {
  // useId returns characters that are not safe in url(#…) references.
  const uid = `i${useId().replace(/[^a-zA-Z0-9]/g, "")}`;
  const id = (name: string) => `${uid}-${name}`;
  const url = (name: string) => `url(#${id(name)})`;
  const markSize = BODY * markScale;
  const markOffset = INSET + (BODY - markSize) / 2;
  const markTransform = `translate(${markOffset} ${markOffset}) scale(${markSize / 100})`;
  const Art = ART[variant];
  const light = VARIANTS.find((v) => v.id === variant)?.light;

  return (
    <svg
      ref={ref}
      xmlns="http://www.w3.org/2000/svg"
      viewBox={`0 0 ${CANVAS} ${CANVAS}`}
      width={size}
      height={size}
      className={className}
      aria-hidden
    >
      <defs>
        <clipPath id={id("body")}>
          <path d={BODY_PATH} />
        </clipPath>
        {/* The macOS template shadow, a touch softer. */}
        <filter id={id("shadow")} x="-20%" y="-20%" width="140%" height="140%">
          <feDropShadow dx="0" dy="10" stdDeviation="12" floodColor="#000" floodOpacity="0.28" />
        </filter>
        <filter id={id("markShadow")} x="-30%" y="-30%" width="160%" height="160%">
          <feDropShadow
            dx="0"
            dy="1.6"
            stdDeviation="2"
            floodColor={shade(color, -0.35, 0.1)}
            floodOpacity="0.35"
          />
        </filter>
        {/* A faint hairline that catches light along the top edge. */}
        <linearGradient id={id("rim")} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#fff" stopOpacity="0.55" />
          <stop offset="0.25" stopColor="#fff" stopOpacity="0.08" />
          <stop offset="0.8" stopColor="#fff" stopOpacity="0" />
          <stop offset="1" stopColor="#fff" stopOpacity="0.12" />
        </linearGradient>
        {!Art && <VariantDefs variant={variant} color={color} id={id} />}
      </defs>
      <g filter={url("shadow")}>
        <path d={BODY_PATH} fill={url("bg")} />
      </g>
      {Art ? (
        <g clipPath={url("body")}>
          <Art color={color} markScale={markScale} id={id} url={url} />
        </g>
      ) : (
        <>
          <g clipPath={url("body")}>
            {variant === "glass" && (
              <>
                <ellipse cx="300" cy="180" rx="620" ry="440" fill={url("sheen")} />
                <ellipse cx="760" cy="980" rx="520" ry="320" fill={url("bounce")} />
              </>
            )}
            {variant === "paper" && <rect width={CANVAS} height={CANVAS} fill={url("grain")} />}
          </g>
          <Mark variant={variant} transform={markTransform} url={url} />
        </>
      )}
      <path
        d={BODY_PATH}
        fill="none"
        stroke={light ? shade(color, -0.3, -0.2) : url("rim")}
        strokeOpacity={light ? 0.14 : 1}
        strokeWidth="3"
        clipPath={url("body")}
      />
    </svg>
  );
}

function VariantDefs({
  variant,
  color,
  id,
}: {
  variant: string;
  color: string;
  id: (name: string) => string;
}) {
  switch (variant) {
    case "petal":
      return (
        <>
          <linearGradient id={id("bg")} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor={shade(color, 0.1, 0.04, -4)} />
            <stop offset="1" stopColor={shade(color, -0.06, 0.02, 4)} />
          </linearGradient>
          <linearGradient id={id("mark")} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#fff" />
            <stop offset="1" stopColor={shade(color, 0.36, 0.1)} />
          </linearGradient>
        </>
      );
    case "ink":
      return (
        <>
          <linearGradient id={id("bg")} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#2a2b30" />
            <stop offset="1" stopColor="#141518" />
          </linearGradient>
          <linearGradient id={id("mark")} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor={shade(color, 0.14, 0.08)} />
            <stop offset="1" stopColor={shade(color, -0.02, 0.06)} />
          </linearGradient>
          <radialGradient id={id("glow")} cx="0.5" cy="0.5" r="0.5">
            <stop offset="0" stopColor={color} stopOpacity="0.35" />
            <stop offset="1" stopColor={color} stopOpacity="0" />
          </radialGradient>
        </>
      );
    case "paper":
      return (
        <>
          <linearGradient id={id("bg")} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor={hsl({ h: toHsl(color).h + 20, s: 0.45, l: 0.975 })} />
            <stop offset="1" stopColor={hsl({ h: toHsl(color).h + 20, s: 0.3, l: 0.915 })} />
          </linearGradient>
          <linearGradient id={id("grain")} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#fff" stopOpacity="0.5" />
            <stop offset="0.5" stopColor="#fff" stopOpacity="0" />
            <stop offset="1" stopColor={color} stopOpacity="0.08" />
          </linearGradient>
          <linearGradient id={id("mark")} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor={shade(color, 0.02, 0.04)} />
            <stop offset="1" stopColor={shade(color, -0.1, 0.06)} />
          </linearGradient>
        </>
      );
    default:
      return (
        <>
          <linearGradient id={id("bg")} x1="0.2" y1="0" x2="0.8" y2="1">
            <stop offset="0" stopColor={shade(color, 0.04, 0.08, -6)} />
            <stop offset="0.55" stopColor={shade(color, -0.1, 0.08)} />
            <stop offset="1" stopColor={shade(color, -0.26, 0.04, 8)} />
          </linearGradient>
          <radialGradient id={id("sheen")} cx="0.5" cy="0.5" r="0.5">
            <stop offset="0" stopColor="#fff" stopOpacity="0.42" />
            <stop offset="1" stopColor="#fff" stopOpacity="0" />
          </radialGradient>
          <radialGradient id={id("bounce")} cx="0.5" cy="0.5" r="0.5">
            <stop offset="0" stopColor={shade(color, 0.2, 0.1, 10)} stopOpacity="0.5" />
            <stop offset="1" stopColor={shade(color, 0.2, 0.1, 10)} stopOpacity="0" />
          </radialGradient>
          <linearGradient id={id("mark")} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#fff" stopOpacity="0.96" />
            <stop offset="1" stopColor="#fff" stopOpacity="0.7" />
          </linearGradient>
          <linearGradient id={id("markEdge")} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#fff" stopOpacity="1" />
            <stop offset="1" stopColor="#fff" stopOpacity="0.2" />
          </linearGradient>
        </>
      );
  }
}

function Mark({
  variant,
  transform,
  url,
}: {
  variant: string;
  transform: string;
  url: (name: string) => string;
}) {
  if (variant === "ink") {
    return (
      <>
        <circle cx={CANVAS / 2} cy={CANVAS / 2} r={BODY * 0.42} fill={url("glow")} />
        <path d={MARK} transform={transform} fill={url("mark")} />
      </>
    );
  }
  if (variant === "glass") {
    return (
      <g transform={transform} filter={url("markShadow")}>
        <path d={MARK} fill={url("mark")} />
        <path d={MARK} fill="none" stroke={url("markEdge")} strokeWidth="0.5" />
      </g>
    );
  }
  if (variant === "paper") {
    // A pressed-in mark: a light edge below, the colour on top.
    return (
      <g transform={transform}>
        <path d={MARK} fill="#fff" opacity="0.9" transform="translate(0 0.5)" />
        <path d={MARK} fill={url("mark")} />
      </g>
    );
  }
  return (
    <g transform={transform} filter={url("markShadow")}>
      <path d={MARK} fill={url("mark")} />
    </g>
  );
}

// Round 2: each variant draws its own background (as `bg`) and art inside the body.
type ArtProps = {
  color: string;
  markScale: number;
  id: (name: string) => string;
  url: (name: string) => string;
};

const CENTER = CANVAS / 2;

function placeMark(cx: number, cy: number, size: number): string {
  return `translate(${cx - size / 2} ${cy - size / 2}) scale(${size / 100})`;
}

// Warm paper and desk tones that sit with the theme colour.
function paper(color: string, l: number, s = 0.4): string {
  return hsl({ h: toHsl(color).h + 20, s, l });
}

// Fine noise over the whole canvas; only visible at large sizes, where flat fills look plastic.
function Grain({
  id,
  url,
  opacity,
}: {
  id: ArtProps["id"];
  url: ArtProps["url"];
  opacity: number;
}) {
  return (
    <>
      <filter
        id={id("grain")}
        filterUnits="userSpaceOnUse"
        x="0"
        y="0"
        width={CANVAS}
        height={CANVAS}
      >
        <feTurbulence type="fractalNoise" baseFrequency="0.7" numOctaves="2" stitchTiles="stitch" />
        <feColorMatrix
          type="matrix"
          values={`0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  ${opacity * 3} 0 0 0 ${-opacity}`}
        />
      </filter>
      <rect width={CANVAS} height={CANVAS} filter={url("grain")} />
    </>
  );
}

// The mark pressed into a surface: shadow along its top edges, light along the bottom ones.
function Debossed({ transform, face, dark }: { transform: string; face: string; dark: string }) {
  return (
    <g transform={transform}>
      <path d={MARK} fill="#fff" fillOpacity="0.4" transform="translate(0 1.1)" />
      <path d={MARK} fill={dark} fillOpacity="0.6" transform="translate(0 -1)" />
      <path d={MARK} fill={face} />
    </g>
  );
}

const SEAL_R = 300;

// A hand-poured outline: a circle with a few slow ripples.
const SEAL_PATH = (() => {
  const points: string[] = [];
  for (let i = 0; i < 240; i++) {
    const t = (i / 240) * Math.PI * 2;
    const k =
      1 +
      0.024 * Math.sin(5 * t + 0.3) +
      0.016 * Math.sin(8 * t + 1.7) +
      0.01 * Math.sin(13 * t + 0.5);
    const x = CENTER + Math.cos(t) * SEAL_R * k;
    const y = CENTER + Math.sin(t) * SEAL_R * k;
    points.push(`${x.toFixed(1)} ${y.toFixed(1)}`);
  }
  return `M${points.join("L")}Z`;
})();

function SealArt({ color, markScale, id, url }: ArtProps) {
  const ring = SEAL_R * 0.8;
  return (
    <>
      <defs>
        <linearGradient id={id("bg")} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={paper(color, 0.97)} />
          <stop offset="1" stopColor={paper(color, 0.91, 0.3)} />
        </linearGradient>
        <radialGradient id={id("wax")} cx="0.38" cy="0.3" r="0.8">
          <stop offset="0" stopColor={shade(color, 0.12, 0.06)} />
          <stop offset="0.55" stopColor={color} />
          <stop offset="1" stopColor={shade(color, -0.18, 0.06)} />
        </radialGradient>
        <filter id={id("sealShadow")} x="-20%" y="-20%" width="140%" height="150%">
          <feDropShadow
            dx="0"
            dy="16"
            stdDeviation="18"
            floodColor={shade(color, -0.45)}
            floodOpacity="0.35"
          />
        </filter>
      </defs>
      <rect width={CANVAS} height={CANVAS} fill={url("bg")} />
      <Grain id={id} url={url} opacity={0.05} />
      <path d={SEAL_PATH} fill={url("wax")} filter={url("sealShadow")} />
      {/* The raised rim of the stamp: dark inside, lit just below. */}
      <circle
        cx={CENTER}
        cy={CENTER + 4}
        r={ring}
        fill="none"
        stroke="#fff"
        strokeOpacity="0.3"
        strokeWidth="5"
      />
      <circle
        cx={CENTER}
        cy={CENTER}
        r={ring}
        fill="none"
        stroke={shade(color, -0.2, 0.04)}
        strokeOpacity="0.7"
        strokeWidth="6"
      />
      <Debossed
        transform={placeMark(CENTER, CENTER + 6, ring * 1.4 * (markScale / 0.56))}
        face={shade(color, -0.05, 0.04)}
        dark={shade(color, -0.35, 0.06)}
      />
    </>
  );
}

function NotebookArt({ color, markScale, id, url }: ArtProps) {
  return (
    <>
      <defs>
        <linearGradient id={id("bg")} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={paper(color, 0.95, 0.28)} />
          <stop offset="1" stopColor={paper(color, 0.88, 0.22)} />
        </linearGradient>
        <linearGradient id={id("cover")} x1="0" y1="0" x2="0.3" y2="1">
          <stop offset="0" stopColor={shade(color, 0.07, 0.03)} />
          <stop offset="1" stopColor={shade(color, -0.06, 0.04)} />
        </linearGradient>
        <linearGradient id={id("spine")} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor={shade(color, -0.3)} stopOpacity="0.45" />
          <stop offset="0.75" stopColor={shade(color, -0.3)} stopOpacity="0.08" />
          <stop offset="0.85" stopColor="#fff" stopOpacity="0.18" />
          <stop offset="1" stopColor="#fff" stopOpacity="0" />
        </linearGradient>
        <linearGradient id={id("band")} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor={shade(color, -0.36, 0.05)} />
          <stop offset="0.45" stopColor={shade(color, -0.24, 0.05)} />
          <stop offset="1" stopColor={shade(color, -0.4, 0.05)} />
        </linearGradient>
        <filter id={id("bookShadow")} x="-25%" y="-20%" width="150%" height="150%">
          <feDropShadow
            dx="6"
            dy="20"
            stdDeviation="22"
            floodColor={shade(color, -0.5, -0.1)}
            floodOpacity="0.32"
          />
        </filter>
      </defs>
      <rect width={CANVAS} height={CANVAS} fill={url("bg")} />
      <Grain id={id} url={url} opacity={0.04} />
      <g transform={`rotate(-7 ${CENTER} ${CENTER})`} filter={url("bookShadow")}>
        {/* The ribbon and the page block, peeking out under the cover. */}
        <path d="M566 770V884L586 864L606 884V770Z" fill={shade(color, -0.3, 0.06)} />
        <rect x="290" y="214" width="466" height="598" rx="26" fill="#f7f2ed" />
        {[0, 7, 14].map((d) => (
          <path
            key={d}
            d={`M${744 - d} 236V${790 - d / 2}`}
            stroke="#d8cdc4"
            strokeWidth="2"
            fill="none"
          />
        ))}
        <rect x="272" y="200" width="474" height="604" rx="28" fill={url("cover")} />
        <rect x="272" y="200" width="62" height="604" rx="28" fill={url("spine")} />
        <rect x="672" y="200" width="26" height="604" fill={url("band")} />
        <Debossed
          transform={placeMark(500, 492, 300 * (markScale / 0.56))}
          face={shade(color, -0.03, 0.02)}
          dark={shade(color, -0.32, 0.04)}
        />
      </g>
    </>
  );
}

function BleedArt({ color, markScale, id, url }: ArtProps) {
  const size = BODY * 1.6 * (markScale / 0.56);
  return (
    <>
      <defs>
        <linearGradient id={id("bg")} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={shade(color, 0.03)} />
          <stop offset="1" stopColor={shade(color, -0.05, 0.03)} />
        </linearGradient>
      </defs>
      <rect width={CANVAS} height={CANVAS} fill={url("bg")} />
      {/* The slit between the two shapes (around 60, 66 in the mark's box) crosses the centre. */}
      <path
        d={MARK}
        fill={paper(color, 0.96, 0.5)}
        transform={placeMark(CENTER - (10 * size) / 100, CENTER - (16 * size) / 100, size)}
      />
      <Grain id={id} url={url} opacity={0.06} />
    </>
  );
}

function AuraArt({ color, markScale, id, url }: ArtProps) {
  const base = toHsl(color);
  const glow = (name: string, c: string) => (
    <radialGradient id={id(name)} cx="0.5" cy="0.5" r="0.5">
      <stop offset="0" stopColor={c} />
      <stop offset="1" stopColor={c} stopOpacity="0" />
    </radialGradient>
  );
  return (
    <>
      <defs>
        <linearGradient id={id("bg")} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={color} />
          <stop offset="1" stopColor={color} />
        </linearGradient>
        {glow("peach", hsl({ h: base.h + 28, s: base.s + 0.25, l: base.l + 0.12 }))}
        {glow("lilac", hsl({ h: base.h - 50, s: base.s, l: base.l + 0.04 }))}
        {glow("light", hsl({ h: base.h + 10, s: base.s + 0.2, l: 0.93 }))}
      </defs>
      <rect width={CANVAS} height={CANVAS} fill={url("bg")} />
      <ellipse cx="200" cy="230" rx="620" ry="520" fill={url("peach")} />
      <ellipse cx="900" cy="880" rx="640" ry="560" fill={url("lilac")} />
      <ellipse cx="740" cy="250" rx="420" ry="360" fill={url("light")} />
      <path
        d={MARK}
        fill={hsl({ h: base.h - 10, s: base.s * 0.6, l: 0.2 })}
        transform={placeMark(CENTER, CENTER, BODY * markScale)}
      />
      <Grain id={id} url={url} opacity={0.09} />
    </>
  );
}

// Round 3: flat background, flat mark, and round 1's mark shadow (defined by MacIcon).
function flat(background: (color: string) => string, mark: (color: string) => string) {
  return function FlatArt({ color, markScale, id, url }: ArtProps) {
    return (
      <>
        <defs>
          <linearGradient id={id("bg")}>
            <stop stopColor={background(color)} />
          </linearGradient>
        </defs>
        <rect width={CANVAS} height={CANVAS} fill={background(color)} />
        <g transform={placeMark(CENTER, CENTER, BODY * markScale)} filter={url("markShadow")}>
          <path d={MARK} fill={mark(color)} />
        </g>
      </>
    );
  };
}

const ART: Record<string, (props: ArtProps) => ReactNode> = {
  "flat-white": flat(
    () => "#fff",
    (color) => color,
  ),
  "flat-petal": flat(
    (color) => shade(color, 0.02, 0.03),
    () => "#fff",
  ),
  "flat-colour": flat(
    (color) => color,
    () => "#fff",
  ),
  "flat-ink": flat(
    () => "#1b1c1f",
    (color) => color,
  ),
  seal: SealArt,
  notebook: NotebookArt,
  bleed: BleedArt,
  aura: AuraArt,
};

// Standalone SVG text for an exported icon (the rendered element serialised as is).
export function serialize(svg: SVGSVGElement): string {
  const copy = svg.cloneNode(true) as SVGSVGElement;
  copy.setAttribute("width", String(CANVAS));
  copy.setAttribute("height", String(CANVAS));
  copy.removeAttribute("class");
  return `<?xml version="1.0" encoding="UTF-8"?>\n${new XMLSerializer().serializeToString(copy)}`;
}
