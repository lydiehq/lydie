// Isometric line drawings for empty states: solid objects in ink on paper. White face, grey
// thickness, a dark silhouette, and everything inside it (the face's own edge, text, marks) in
// light grey. Dashed outlines stand for what is not there yet. No colour; dark mode follows from
// the theme, since every tone is mixed from the surface and the gray ramp.
//
// Every solid is a flat 2D shape on one of three planes, pushed back by its thickness: copies of
// the shape stepping back fill the sides.
import { LazyMotion, m, useReducedMotion } from "motion/react";
import { createContext, useContext, useId } from "react";
import type { ReactNode } from "react";
import { twMerge } from "tailwind-merge";

/** A world point: x, y on the floor, z up. */
export type P3 = readonly [number, number, number];

export const C30 = Math.sqrt(3) / 2;
export const n1 = (n: number) => Math.round(n * 10) / 10;
export const proj = ([x, y, z]: P3) => [(x - y) * C30, (x + y) / 2 - z] as const;

const SURFACE = "var(--color-surface)";
const INK = "var(--color-gray-950)";

/** Paper, then greys stepping darker: a whisper of ink over the surface. */
export const tone = (level: 0 | 1 | 2 | 3) =>
  level === 0 ? SURFACE : `color-mix(in oklab, ${INK} ${[0, 3, 6, 9][level]}%, ${SURFACE})`;

export const SIDE = tone(3);
/** Lines inside a silhouette: lighter, so only the outline reads as ink. */
export const INNER = `color-mix(in oklab, currentColor 40%, ${SURFACE})`;
/**
 * Ink for something further back, keeping `percent` of its strength. Mixed with paper rather than
 * made transparent, so it still hides what lies behind.
 */
export const fadedInk = (percent: number) =>
  `color-mix(in oklab, currentColor ${percent}%, ${SURFACE})`;
/** Text on a face, as soft bars rather than pen strokes. */
export const BAR = tone(3);

/**
 * floor: the top of something lying flat (u along x, v along y).
 * x: a face turned to the right (u to the right, v down).
 * y: a face turned to the left (u to the right, v down).
 */
export type Plane = "floor" | "x" | "y";

export const planeMatrix = (plane: Plane, at: P3) => {
  const [e, f] = proj(at).map(n1);
  if (plane === "floor") return `matrix(${C30} 0.5 ${-C30} 0.5 ${e} ${f})`;
  if (plane === "x") return `matrix(${C30} -0.5 0 1 ${e} ${f})`;
  return `matrix(${C30} 0.5 0 1 ${e} ${f})`;
};

// Where the back of a solid lands on screen, `depth` behind its face.
export const backOffset = (plane: Plane, depth: number): [number, number] => {
  if (plane === "floor") return [0, depth];
  if (plane === "x") return [-depth * C30, -depth / 2];
  return [depth * C30, -depth / 2];
};

/** A point on a plane's face, in world space. */
export const onPlane = (plane: Plane, [x, y, z]: P3, u: number, v: number): P3 =>
  plane === "floor" ? [x + u, y + v, z] : plane === "x" ? [x, y - u, z - v] : [x + u, y, z - v];
/** The same point `depth` behind the face. */
export const behind = (plane: Plane, [x, y, z]: P3, depth: number): P3 =>
  plane === "floor" ? [x, y, z - depth] : plane === "x" ? [x - depth, y, z] : [x, y - depth, z];

/** Every corner of a w × h solid, front and back, so the frame fits it. */
export const reach = (plane: Plane, at: P3, w: number, h: number, depth = 0): P3[] =>
  [
    [0, 0],
    [w, 0],
    [0, h],
    [w, h],
  ].flatMap(([u = 0, v = 0]) => {
    const point = onPlane(plane, at, u, v);
    return [point, behind(plane, point, depth)];
  });

// Strokes keep their width through the planes' skew.
export const ink = { vectorEffect: "non-scaling-stroke" } as const;
export const LINE = 1.4;

// Strokes are in screen pixels whatever the drawing's size, so a small drawing thins them to keep
// the same weight as a large one.
const LineScale = createContext(1);
/** A stroke width (screen pixels at full size) for the drawing being drawn. */
export function useLine() {
  const scale = useContext(LineScale);
  return (width: number) => n1(width * scale);
}

export type ShapeProps = {
  fill: string;
  stroke?: string;
  strokeWidth?: number;
  strokeDasharray?: string;
  vectorEffect: "non-scaling-stroke";
};
export type Shape = (props: ShapeProps) => ReactNode;

export const rect =
  (w: number, h: number, r: number): Shape =>
  (props) => <rect width={w} height={h} rx={r} {...props} />;

export const disc =
  (r: number): Shape =>
  (props) => <circle r={r} {...props} />;

export const path =
  (d: string): Shape =>
  (props) => <path d={d} {...props} />;

/**
 * A flat shape on a plane, given thickness. Children draw on its face.
 *
 * Copies of the shape stepping back fill the side; the face goes on top with a light edge, the
 * one line where it meets the side. The dark outline comes last, masked to outside the whole
 * solid, so it is one even line with no inner edge showing through it.
 */
export function Solid({
  plane,
  at,
  depth,
  shape,
  face = tone(0),
  side = SIDE,
  sideLines,
  children,
}: {
  plane: Plane;
  at: P3;
  depth: number;
  shape: Shape;
  face?: string;
  side?: string;
  /** Lines across the side, in screen space, under the face and the outline. */
  sideLines?: ReactNode;
  children?: ReactNode;
}) {
  const outside = useId();
  const line = useLine();
  const matrix = planeMatrix(plane, at);
  const [dx, dy] = backOffset(plane, depth);
  // Fine steps, unrounded: coarse ones leave bumps along the silhouette.
  const steps = Math.max(4, Math.ceil(depth / 0.25));
  const layers = Array.from({ length: steps + 1 }, (_, step) => {
    const t = 1 - step / steps;
    return `translate(${dx * t} ${dy * t}) ${matrix}`;
  });
  return (
    <g>
      {/* A whole box of margin keeps the outline, which the default 10% region cuts off. */}
      <mask id={outside} maskUnits="objectBoundingBox" x={-1} y={-1} width={3} height={3}>
        <rect x={-1e4} y={-1e4} width={2e4} height={2e4} fill="white" />
        {layers.map((transform, index) => (
          <g key={index} transform={transform}>
            {shape({ ...ink, fill: "black", stroke: "none" })}
          </g>
        ))}
      </mask>
      {layers.slice(0, -1).map((transform, index) => (
        <g key={index} transform={transform}>
          {shape({ ...ink, fill: side, stroke: "none" })}
        </g>
      ))}
      {sideLines}
      <g transform={matrix}>
        {/* Under the face: only the half over the side shows. */}
        {shape({ ...ink, fill: "none", stroke: INNER, strokeWidth: line(2) })}
        {shape({ ...ink, fill: face, stroke: "none" })}
        <g stroke={INNER}>{children}</g>
      </g>
      <g mask={`url(#${outside})`}>
        {layers.map((transform, index) => (
          <g key={index} transform={transform}>
            {shape({ ...ink, fill: "none", strokeWidth: line(LINE * 2) })}
          </g>
        ))}
      </g>
    </g>
  );
}

/** The outline of something that is not there yet, flat on a plane. */
export function Dashed({
  plane,
  at,
  shape,
  strength = 45,
  children,
}: {
  plane: Plane;
  at: P3;
  shape: Shape;
  strength?: number;
  children?: ReactNode;
}) {
  const line = useLine();
  const dashes = `${line(3)} ${line(4)}`;
  return (
    <g transform={planeMatrix(plane, at)} color={fadedInk(strength)}>
      {shape({ ...ink, fill: "none", strokeWidth: line(LINE), strokeDasharray: dashes })}
      <g strokeDasharray={dashes}>{children}</g>
    </g>
  );
}

/** Strokes drawn on a face. */
export function Marks({ d, width = 1 }: { d: string; width?: number }) {
  const line = useLine();
  return <path d={d} strokeWidth={line(width)} {...ink} />;
}

/** Lines of text on a face, as short strokes. */
export function TextLines({
  u,
  v,
  widths,
  gap = 6,
}: {
  u: number;
  v: number;
  widths: number[];
  gap?: number;
}) {
  const line = useLine();
  return (
    <path
      d={widths.map((w, i) => `M${u} ${v + i * gap} h${w}`).join(" ")}
      stroke={BAR}
      strokeWidth={line(3)}
      {...ink}
    />
  );
}

/** A thick bar on a face, for a heading or anything that matters. */
export function Total({ u, v, w }: { u: number; v: number; w: number }) {
  const line = useLine();
  return <path d={`M${u} ${v} h${w}`} stroke={BAR} strokeWidth={line(5)} {...ink} />;
}

export const DURATION = 3.2;
// Every drawing's delays and durations at once; 1 is the pace each one was tuned at, so their
// timings stay in proportion.
const TIME_SCALE = 0.49;
// Moving off at once, then a short soft settle, as if set down. Ease-out quart: quint's long
// creep at the end read as lingering.
const move = (delay: number, duration = DURATION) => ({
  delay: delay * TIME_SCALE,
  duration: duration * TIME_SCALE,
  ease: [0.25, 1, 0.5, 1] as const,
});
// Each part fades over the first half of its own movement, so a part that falls further also
// fades in for longer. Ease-in-out sine: a fixed short fade made every part pop in at once.
const fadeIn = (delay: number, duration = DURATION) => ({
  delay: delay * TIME_SCALE,
  duration: duration * 0.5 * TIME_SCALE,
  ease: [0.37, 0, 0.63, 1] as const,
});

/** Drops (or slides) a part into place. Reduced motion keeps the fade and drops the rest. */
export function Enter({
  delay,
  drop = 10,
  from = [0, -drop],
  duration,
  children,
}: {
  delay: number;
  /** How far above its place it starts, in drawing units. */
  drop?: number;
  /** Where it starts instead, relative to its place on screen. */
  from?: readonly [number, number];
  duration?: number;
  children: ReactNode;
}) {
  const reduce = useReducedMotion();
  return (
    <m.g
      initial={reduce ? { opacity: 0 } : { opacity: 0, x: from[0], y: from[1] }}
      animate={{ opacity: 1, x: 0, y: 0 }}
      transition={{ ...move(delay, duration), opacity: fadeIn(reduce ? 0 : delay, duration) }}
    >
      {children}
    </m.g>
  );
}

/**
 * A box lying on the floor growing up out of it to its height. It rises from sunk below the
 * floor, masked to above it, which draws the same as a box getting taller without redrawing its
 * sides every frame. `at` is the top face, as for the Solid it wraps.
 */
export function Rise({
  at,
  w,
  h,
  depth,
  shape = rect(w, h, 5),
  delay,
  duration = DURATION,
  children,
}: {
  at: P3;
  w: number;
  h: number;
  depth: number;
  shape?: Shape;
  delay: number;
  duration?: number;
  children: ReactNode;
}) {
  const id = useId();
  const line = useLine();
  const reduce = useReducedMotion();
  if (reduce) {
    return (
      <m.g initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={fadeIn(0, duration)}>
        {children}
      </m.g>
    );
  }
  const floor = behind("floor", at, depth);
  const matrix = planeMatrix("floor", floor);
  // Above the line between the footprint's left and right ends, widened so the box's side
  // outlines stay; below it, only the footprint itself.
  const [lx, ly] = proj(onPlane("floor", floor, 0, h)).map(n1) as [number, number];
  const [rx, ry] = proj(onPlane("floor", floor, w, 0)).map(n1) as [number, number];
  const pad = LINE * 2;
  return (
    <m.g initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={fadeIn(delay, duration)}>
      {/* The outline along the floor, which the sunk box has none of. */}
      <g transform={matrix}>{shape({ ...ink, fill: "none", strokeWidth: line(LINE * 2) })}</g>
      <mask id={id} maskUnits="objectBoundingBox" x={-1} y={-1} width={3} height={3}>
        <path
          d={`M${lx - pad} ${ly - 1000} H${rx + pad} V${ry} L${lx - pad} ${ly} Z`}
          fill="white"
          stroke="none"
        />
        <g transform={matrix}>{shape({ ...ink, fill: "white", stroke: "none" })}</g>
      </mask>
      <g mask={`url(#${id})`}>
        <m.g initial={{ y: depth }} animate={{ y: 0 }} transition={move(delay, duration)}>
          {children}
        </m.g>
      </g>
    </m.g>
  );
}

/**
 * The vertical edge at a floor box's nearest corner, which a single grey side otherwise hides.
 * It runs through the middle of the corner's rounding, where the outline's lowest point sits.
 */
export function BoxEdge({
  at,
  w,
  h,
  depth,
  r,
}: {
  at: P3;
  w: number;
  h: number;
  depth: number;
  r: number;
}) {
  const line = useLine();
  const inset = r * (1 - Math.SQRT1_2);
  const [x, y, z] = onPlane("floor", at, w - inset, h - inset);
  const [x1, y1] = proj([x, y, z]).map(n1);
  const [x2, y2] = proj([x, y, z - depth]).map(n1);
  return <path d={`M${x1} ${y1} L${x2} ${y2}`} stroke={INNER} strokeWidth={line(1)} {...ink} />;
}

const viewBoxOf = (points: readonly P3[], pad = 6) => {
  const ps = points.map(proj);
  const xs = ps.map((p) => p[0]);
  const ys = ps.map((p) => p[1]);
  const [x0, y0] = [Math.min(...xs) - pad, Math.min(...ys) - pad];
  return `${n1(x0)} ${n1(y0)} ${n1(Math.max(...xs) + pad - x0)} ${n1(Math.max(...ys) + pad - y0)}`;
};

const loadFeatures = () => import("./motion-features").then((module) => module.default);

export type IllustrationSize = "xs" | "sm" | "md";
export type IllustrationProps = {
  /** md for a page, sm for a side panel, xs beside a label in a menu. */
  size?: IllustrationSize;
  className?: string;
};

const SIZES: Record<IllustrationSize, string> = { xs: "h-9", sm: "h-24", md: "h-32" };
const LINE_SCALES: Record<IllustrationSize, number> = { xs: 0.6, sm: 1, md: 1 };

export function Drawing({
  size = "md",
  className,
  top,
  children,
}: IllustrationProps & {
  /** World points the object reaches, so the frame fits it. */
  top: P3[];
  children: ReactNode;
}) {
  return (
    <svg
      aria-hidden="true"
      viewBox={viewBoxOf(top)}
      className={twMerge(
        "w-auto shrink-0 overflow-visible text-gray-950/75",
        SIZES[size],
        className,
      )}
      fill="none"
      stroke="currentColor"
      strokeWidth={LINE * LINE_SCALES[size]}
      strokeLinejoin="round"
      strokeLinecap="round"
    >
      {/* Only the features the entrances use, fetched on first use: until then each part waits
          hidden in its initial state. */}
      <LazyMotion features={loadFeatures} strict>
        <LineScale value={LINE_SCALES[size]}>{children}</LineScale>
      </LazyMotion>
    </svg>
  );
}

// A sheet of paper, w × h, with its top right corner folded over.
export const sheet = (w: number, h: number) =>
  `M4 0 H${w - 9} L${w} 9 V${h - 4} Q${w} ${h} ${w - 4} ${h} H4 Q0 ${h} 0 ${h - 4} V4 Q0 0 4 0 Z`;
export const FOLD = (w: number) => `M${w - 9} 0 V7 Q${w - 9} 9 ${w - 7} 9 H${w}`;
