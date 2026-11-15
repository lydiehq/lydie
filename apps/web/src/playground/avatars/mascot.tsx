import { useEffect, useState } from "react";
import type { ReactNode } from "react";

// Lydie's own presence (the agent, sync, empty pages): a character of its own, not the logo. Every
// candidate shares one face (dot eyes, a small mouth) and goes through the same states.

export type MascotState = "idle" | "thinking" | "working" | "happy" | "oops" | "asleep";

export const MASCOT_STATES: { id: MascotState; label: string; use: string }[] = [
  { id: "idle", label: "Idle", use: "Waiting, empty pages" },
  { id: "thinking", label: "Thinking", use: "The agent before it writes" },
  { id: "working", label: "Working", use: "Writing, syncing, importing" },
  { id: "happy", label: "Happy", use: "Done, all synced" },
  { id: "oops", label: "Oops", use: "Something failed" },
  { id: "asleep", label: "Asleep", use: "Offline, paused" },
];

export type Concept = {
  id: string;
  name: string;
  kind: string;
  description: string;
  draw: (state: MascotState, t: number) => ReactNode;
};

const INK = "#1d2330";
const BLUSH = "#ff8fb8";
const sin = Math.sin;
const cos = Math.cos;
const cycle = (t: number, seconds: number) => (t / seconds) % 1;
// 0 → 1 → 0 over a cycle, as a jump's height.
const arc01 = (p: number) => 4 * p * (1 - p);
const ease = (p: number) => (p < 0.5 ? 2 * p * p : 1 - (-2 * p + 2) ** 2 / 2);
const n = (v: number) => Math.round(v * 100) / 100;

// Squash and stretch around a point on the ground: wide on landing, tall in the air.
function squash(p: number, x: number, y: number): string {
  const near = Math.min(p, 1 - p);
  const k = near < 0.08 ? 0.12 * (1 - near / 0.08) : -0.05 * arc01(p);
  return `translate(${x} ${y}) scale(${n(1 + k)} ${n(1 - k)}) translate(${-x} ${-y})`;
}

type FaceProps = {
  x: number;
  y: number;
  s?: number;
  state: MascotState;
  t: number;
  ink?: string;
  blush?: boolean;
};

// The one face: where the eyes look and what shape they and the mouth take follow the state.
function Face({ x, y, s = 1, state, t, ink = INK, blush = true }: FaceProps) {
  const lx = x - 9 * s;
  const rx = x + 9 * s;
  const my = y + 9 * s;
  const line = {
    fill: "none",
    stroke: ink,
    strokeWidth: 3.2 * s,
    strokeLinecap: "round",
    strokeLinejoin: "round",
  } as const;
  const blink = (state === "idle" || state === "working") && t % 3.7 > 3.55;
  const look: [number, number] =
    state === "thinking"
      ? [2.4 * s * (0.6 + 0.4 * sin(t * 1.3)), -2.6 * s]
      : state === "working"
        ? [1.2 * s * sin(t * 2.5), 1.6 * s]
        : [0, 0];

  let eyes: ReactNode;
  if (blink) {
    eyes = (
      <>
        <path d={`M${lx - 3 * s} ${y}H${lx + 3 * s}`} {...line} />
        <path d={`M${rx - 3 * s} ${y}H${rx + 3 * s}`} {...line} />
      </>
    );
  } else if (state === "happy") {
    const arc = (cx: number) =>
      `M${cx - 4 * s} ${y + 1.5 * s}Q${cx} ${y - 4 * s} ${cx + 4 * s} ${y + 1.5 * s}`;
    eyes = (
      <>
        <path d={arc(lx)} {...line} />
        <path d={arc(rx)} {...line} />
      </>
    );
  } else if (state === "asleep") {
    const arc = (cx: number) =>
      `M${cx - 4 * s} ${y - 1 * s}Q${cx} ${y + 3.5 * s} ${cx + 4 * s} ${y - 1 * s}`;
    eyes = (
      <>
        <path d={arc(lx)} {...line} />
        <path d={arc(rx)} {...line} />
      </>
    );
  } else if (state === "oops") {
    eyes = (
      <>
        <path
          d={`M${lx - 3 * s} ${y - 3 * s}L${lx + 2 * s} ${y}L${lx - 3 * s} ${y + 3 * s}`}
          {...line}
        />
        <path
          d={`M${rx + 3 * s} ${y - 3 * s}L${rx - 2 * s} ${y}L${rx + 3 * s} ${y + 3 * s}`}
          {...line}
        />
      </>
    );
  } else {
    eyes = (
      <>
        <circle cx={lx + look[0]} cy={y + look[1]} r={3.1 * s} fill={ink} />
        <circle cx={rx + look[0]} cy={y + look[1]} r={3.1 * s} fill={ink} />
      </>
    );
  }

  let mouth: ReactNode;
  switch (state) {
    case "idle":
      mouth = (
        <path d={`M${x - 4.5 * s} ${my}Q${x} ${my + 4 * s} ${x + 4.5 * s} ${my}`} {...line} />
      );
      break;
    case "thinking":
      mouth = <path d={`M${x - 1 * s} ${my + 1 * s}L${x + 4.5 * s} ${my - 0.5 * s}`} {...line} />;
      break;
    case "working":
      mouth = <ellipse cx={x} cy={my + 1 * s} rx={2 * s} ry={2.4 * s} fill={ink} />;
      break;
    case "happy":
      mouth = (
        <path
          d={`M${x - 6.5 * s} ${my - 1 * s}Q${x} ${my + 10 * s} ${x + 6.5 * s} ${my - 1 * s}Z`}
          fill={ink}
        />
      );
      break;
    case "oops":
      mouth = (
        <path
          d={`M${x - 6 * s} ${my + 1.5 * s}q${1.5 * s} ${-2.5 * s} ${3 * s} 0t${3 * s} 0t${3 * s} 0t${3 * s} 0`}
          {...line}
        />
      );
      break;
    case "asleep":
      mouth = <circle cx={x} cy={my + 1.5 * s} r={1.7 * s} fill={ink} />;
      break;
  }

  return (
    <g>
      {blush && (state === "happy" || state === "idle") && (
        <>
          <ellipse
            cx={lx - 3 * s}
            cy={y + 6 * s}
            rx={3.6 * s}
            ry={2.2 * s}
            fill={BLUSH}
            opacity={0.55}
          />
          <ellipse
            cx={rx + 3 * s}
            cy={y + 6 * s}
            rx={3.6 * s}
            ry={2.2 * s}
            fill={BLUSH}
            opacity={0.55}
          />
        </>
      )}
      {eyes}
      {mouth}
    </g>
  );
}

// Three dots appearing one after another above the head: thinking.
function ThinkingDots({
  x,
  y,
  t,
  color = INK,
}: {
  x: number;
  y: number;
  t: number;
  color?: string;
}) {
  const p = cycle(t, 1.5);
  return (
    <g fill={color}>
      {[0, 1, 2].map((i) => (
        <circle key={i} cx={x + i * 7} cy={y - i * 3} r={2.4} opacity={p * 3 > i ? 0.75 : 0.12} />
      ))}
    </g>
  );
}

// Floating z's: asleep.
function Zs({ x, y, t, color = INK }: { x: number; y: number; t: number; color?: string }) {
  return (
    <g fill="none" stroke={color} strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round">
      {[0, 1].map((i) => {
        const p = cycle(t + i * 1.1, 2.2);
        const size = 4 + i * 1.5 + p * 2;
        return (
          <path
            key={i}
            opacity={p < 0.15 ? p / 0.15 : 1 - (p - 0.15) / 0.85}
            d={`M${x + i * 8 + p * 6} ${y - i * 8 - p * 12}h${size}l${-size} ${size}h${size}`}
          />
        );
      })}
    </g>
  );
}

function Shadow({
  x = 50,
  y = 98,
  w = 30,
  k = 1,
}: {
  x?: number;
  y?: number;
  w?: number;
  k?: number;
}) {
  return <ellipse cx={x} cy={y} rx={w * k} ry={4 * k} fill="#000" opacity={0.08} />;
}

const bookworm: Concept = {
  id: "bookworm",
  name: "Bookworm",
  kind: "Creature",
  description:
    "A worm of coloured beads in round reading glasses. It inches along while it works, hops when it is done and rests its head to sleep.",
  draw(state, t) {
    const colors = ["#ffc845", "#ff8fb8", "#5cb8e6", "#9b7be0"];
    const segments = 4;
    let lift = 0;
    let head: [number, number, number] = [80, 56, 0];
    let segment = (i: number): [number, number] => [18 + i * 13, 74];
    let face: MascotState = state;
    switch (state) {
      case "idle":
        segment = (i) => [18 + i * 13, 74 + 2.4 * sin(t * 2.2 + i * 0.9)];
        head = [80, 56 + 2 * sin(t * 2.2 + 4 * 0.9), 0];
        break;
      case "thinking":
        segment = (i) => [18 + i * 13, 74 + 1.2 * sin(t * 1.5 + i)];
        head = [80, 54, -12 + 4 * sin(t * 1.3)];
        break;
      case "working": {
        // An inchworm: the middle humps up while the ends close in, then it stretches out.
        const k = 0.5 + 0.5 * sin(t * 5);
        segment = (i) => {
          const u = i / (segments - 1);
          return [22 + i * (13 - 4 * k), 74 - 16 * k * sin(Math.PI * (0.15 + 0.7 * u))];
        };
        head = [80 - 6 * k, 58, 6 * k];
        break;
      }
      case "happy": {
        const p = cycle(t, 0.8);
        lift = -14 * arc01(p);
        segment = (i) => [18 + i * 13, 74 + 3 * sin(t * 9 + i)];
        head = [80, 54, -6];
        break;
      }
      case "oops":
        segment = (i) => [18 + i * 13, 76];
        head = [80, 66 + 2 * sin(t * 20) * Math.max(0, 1 - cycle(t, 2) * 3), 22];
        break;
      case "asleep":
        segment = (i) => [22 + i * 12, 79 + 0.8 * sin(t * 1.1 + i)];
        head = [76, 76, 8];
        face = "asleep";
        break;
    }
    const [hx, hy, ha] = head;
    return (
      <>
        <Shadow x={52} y={96} w={40} k={1 + lift / 60} />
        <g transform={`translate(50 92) scale(1.14) translate(-50 -92) translate(0 ${lift})`}>
          {Array.from({ length: segments }, (_, i) => {
            const [x, y] = segment(i);
            return <circle key={i} cx={x} cy={y} r={11} fill={colors[i]} />;
          })}
          <g transform={`rotate(${ha} ${hx} ${hy})`}>
            <circle cx={hx} cy={hy} r={17} fill="#2fbf9f" />
            <Face x={hx} y={hy - 2} s={0.8} state={face} t={t} />
            {/* Reading glasses. */}
            <g fill="none" stroke={INK} strokeWidth={1.8} opacity={0.85}>
              <circle cx={hx - 7.2} cy={hy - 2} r={5.4} />
              <circle cx={hx + 7.2} cy={hy - 2} r={5.4} />
              <path d={`M${hx - 1.8} ${hy - 2.6}H${hx + 1.8}`} />
            </g>
          </g>
        </g>
        {state === "thinking" && <ThinkingDots x={88} y={30} t={t} />}
        {state === "asleep" && <Zs x={84} y={56} t={t} />}
      </>
    );
  },
};

// A wing as an ellipse turned around its root on the body.
function Wing({
  cx,
  cy,
  rx,
  ry,
  angle,
  color,
}: {
  cx: number;
  cy: number;
  rx: number;
  ry: number;
  angle: number;
  color: string;
}) {
  return (
    <ellipse
      cx={cx}
      cy={cy}
      rx={rx}
      ry={ry}
      transform={`rotate(${angle} ${cx} ${cy})`}
      fill={color}
    />
  );
}

const moth: Concept = {
  id: "moth",
  name: "Moth",
  kind: "Creature",
  description:
    "A soft moth drawn to the light of the page. Its wings say everything: a slow flap at rest, a blur while working, folded to sleep.",
  draw(state, t) {
    let flap = 0.75 + 0.25 * cos(t * 2.4);
    let x = 0;
    let y = 0;
    let tilt = 0;
    let antenna = 0;
    let folded = false;
    switch (state) {
      case "idle":
        y = 2 * sin(t * 2.4);
        break;
      case "thinking":
        flap = 0.92;
        antenna = 10 * sin(t * 6) * (cycle(t, 1.6) < 0.4 ? 1 : 0);
        tilt = -6;
        break;
      case "working":
        flap = 0.45 + 0.55 * Math.abs(cos(t * 18));
        y = -4 + 2 * sin(t * 6);
        break;
      case "happy":
        flap = 0.55 + 0.45 * Math.abs(cos(t * 10));
        x = 6 * cos(t * 3);
        y = -6 + 6 * sin(t * 3);
        tilt = 10 * cos(t * 3);
        break;
      case "oops":
        flap = 0.6;
        tilt = 24;
        y = 6;
        x = 2 * sin(t * 25) * Math.max(0, 1 - cycle(t, 2) * 3);
        break;
      case "asleep":
        folded = true;
        y = 6;
        break;
    }
    const wings = (side: -1 | 1) => {
      const k = folded ? 0.42 : flap;
      return (
        <g transform={`translate(50 0) scale(${n(side * k)} 1) translate(-50 0)`}>
          <Wing cx={30} cy={46} rx={21} ry={15} angle={-28} color="#9b7be0" />
          <Wing cx={33} cy={70} rx={14} ry={10} angle={24} color="#ff8fb8" />
          <circle cx={28} cy={44} r={5} fill="#fff" opacity={0.35} />
        </g>
      );
    };
    return (
      <>
        <Shadow w={24} k={state === "asleep" ? 1.1 : 0.8} />
        <g transform={`translate(${n(x)} ${n(y)}) rotate(${n(tilt)} 50 60)`}>
          {wings(1)}
          {wings(-1)}
          {/* Antennae. */}
          <g fill="none" stroke={INK} strokeWidth={2.2} strokeLinecap="round">
            <path d="M46 36Q40 24 34 20" transform={`rotate(${-antenna} 46 36)`} />
            <path d="M54 36Q60 24 66 20" transform={`rotate(${antenna} 54 36)`} />
          </g>
          <circle cx={34} cy={20} r={2.8} fill={INK} transform={`rotate(${-antenna} 46 36)`} />
          <circle cx={66} cy={20} r={2.8} fill={INK} transform={`rotate(${antenna} 54 36)`} />
          <ellipse cx={50} cy={60} rx={14} ry={23} fill="#ffe08a" />
          <path
            d="M38 70Q50 76 62 70M39 78Q50 84 61 78"
            fill="none"
            stroke="#f2c14e"
            strokeWidth={2.4}
            strokeLinecap="round"
          />
          <Face x={50} y={52} s={0.72} state={state} t={t} />
        </g>
        {state === "thinking" && <ThinkingDots x={74} y={20} t={t} />}
        {state === "asleep" && <Zs x={70} y={40} t={t} />}
      </>
    );
  },
};

const DROP = "M50 10C50 10 80 46 80 66A30 30 0 0 1 20 66C20 46 50 10 50 10Z";

const inkDrop: Concept = {
  id: "ink-drop",
  name: "Ink drop",
  kind: "Writing object",
  description:
    "A drop of ink with a white face. It squiggles a line while it writes, splashes when it lands a jump and goes splat when something breaks.",
  draw(state, t) {
    let transform = "";
    let face: MascotState = state;
    let extra: ReactNode = null;
    switch (state) {
      case "idle": {
        const k = 0.03 * sin(t * 2.6);
        transform = `translate(50 96) scale(${n(1 + k)} ${n(1 - k)}) translate(-50 -96)`;
        break;
      }
      case "thinking":
        transform = `translate(50 96) skewX(${n(-7 + 3 * sin(t * 1.4))}) translate(-50 -96)`;
        break;
      case "working": {
        const x = 8 * sin(t * 3);
        transform = `translate(${n(x)} 0) rotate(${n(x * 0.8)} 50 96)`;
        // The line it writes, drawn on as it goes.
        const p = cycle(t, 2.2);
        extra = (
          <path
            d="M8 100q6 -6 12 0t12 0t12 0t12 0t12 0t12 0t12 0"
            fill="none"
            stroke="#3b5bdb"
            strokeWidth={2.6}
            strokeLinecap="round"
            pathLength={1}
            strokeDasharray="1 1"
            strokeDashoffset={1 - p}
          />
        );
        break;
      }
      case "happy": {
        const p = cycle(t, 0.9);
        transform = `translate(0 ${n(-18 * arc01(p))}) ${squash(p, 50, 96)}`;
        if (Math.min(p, 1 - p) < 0.12) {
          extra = (
            <g fill="#3b5bdb">
              <circle cx={22} cy={90} r={3} />
              <circle cx={78} cy={90} r={3} />
              <circle cx={14} cy={82} r={2} />
              <circle cx={86} cy={82} r={2} />
            </g>
          );
        }
        break;
      }
      case "oops": {
        const p = cycle(t, 2.2);
        const k = p < 0.15 ? ease(p / 0.15) : p < 0.7 ? 1 : 1 - ease((p - 0.7) / 0.3);
        transform = `translate(50 96) scale(${n(1 + 0.4 * k)} ${n(1 - 0.42 * k)}) translate(-50 -96)`;
        extra = k > 0.5 && (
          <g fill="#3b5bdb">
            <circle cx={12} cy={94} r={3.4} />
            <circle cx={90} cy={92} r={2.6} />
          </g>
        );
        break;
      }
      case "asleep":
        transform = `translate(50 96) scale(${n(1.1 + 0.02 * sin(t * 1.1))} ${n(0.82 - 0.02 * sin(t * 1.1))}) translate(-50 -96)`;
        face = "asleep";
        break;
    }
    return (
      <>
        <Shadow w={26} />
        {extra}
        <g transform={transform}>
          <path d={DROP} fill="#3b5bdb" />
          <ellipse
            cx={37}
            cy={52}
            rx={5}
            ry={9}
            transform="rotate(28 37 52)"
            fill="#fff"
            opacity={0.3}
          />
          <Face x={50} y={66} s={0.85} state={face} t={t} ink="#fff" blush={false} />
        </g>
        {state === "thinking" && <ThinkingDots x={70} y={20} t={t} color="#3b5bdb" />}
        {state === "asleep" && <Zs x={72} y={52} t={t} />}
      </>
    );
  },
};

const stickyNote: Concept = {
  id: "sticky-note",
  name: "Sticky note",
  kind: "Writing object",
  description:
    "A yellow note with a curled corner. Lines appear on it as it writes, its corner lifts while it thinks and it crumples when something fails.",
  draw(state, t) {
    let transform = "";
    let curl = 0;
    let lines = 0;
    let crumpled = false;
    switch (state) {
      case "idle":
        transform = `rotate(${n(-4 + 3 * sin(t * 1.8))} 50 92)`;
        break;
      case "thinking":
        transform = "rotate(-6 50 92)";
        curl = 0.5 + 0.5 * sin(t * 2.4);
        break;
      case "working":
        transform = `rotate(${n(-3 + 1.5 * sin(t * 6))} 50 92)`;
        lines = cycle(t, 2.4);
        break;
      case "happy": {
        const p = cycle(t, 0.9);
        transform = `translate(0 ${n(-16 * arc01(p))}) rotate(${n(-4 + 14 * arc01(p))} 50 60) ${squash(p, 50, 92)}`;
        break;
      }
      case "oops":
        crumpled = cycle(t, 2.2) < 0.75;
        transform = `rotate(${crumpled ? 8 : -4} 50 92)`;
        break;
      case "asleep":
        transform = `rotate(${n(-14 + 1.5 * sin(t * 1.1))} 50 92)`;
        break;
    }
    // The note: a square whose bottom-right corner folds up by `curl`.
    const fold = 14 + 10 * curl;
    const body = crumpled
      ? "M20 24L36 20L52 25L68 19L82 26L79 42L84 58L77 74L82 90L64 85L48 91L32 86L18 90L22 72L16 56L22 40Z"
      : `M18 20H82V${90 - fold}L${82 - fold} 90H18Z`;
    return (
      <>
        <Shadow w={30} />
        <g transform={transform}>
          <path d={body} fill="#ffd75e" />
          {!crumpled && (
            <path
              d={`M${82 - fold} 90L82 ${90 - fold}Q${82 - fold * 0.9} ${90 - fold * 0.4} ${82 - fold} 90Z`}
              fill="#f2b84b"
            />
          )}
          {crumpled && (
            <path
              d="M30 34L46 46L40 64M60 30L58 50L72 62"
              fill="none"
              stroke="#e6b23a"
              strokeWidth={1.6}
              strokeLinejoin="round"
            />
          )}
          {lines > 0 && (
            <g stroke="#c9952a" strokeWidth={2.4} strokeLinecap="round">
              {[0, 1, 2].map((i) => {
                const k = Math.max(0, Math.min(1, lines * 3 - i));
                return k > 0 ? <path key={i} d={`M28 ${70 + i * 6}H${28 + 36 * k}`} /> : null;
              })}
            </g>
          )}
          <Face x={50} y={46} s={0.95} state={state} t={t} />
        </g>
        {state === "thinking" && <ThinkingDots x={76} y={12} t={t} />}
        {state === "asleep" && <Zs x={76} y={26} t={t} />}
      </>
    );
  },
};

// A soft blob: a circle whose radius ripples with a few slow waves.
function blobPath(cx: number, cy: number, r: number, t: number, wobble: number): string {
  const points: string[] = [];
  const steps = 56;
  for (let i = 0; i <= steps; i++) {
    const a = (i / steps) * Math.PI * 2;
    const rr = r + wobble * (2.6 * sin(3 * a + t * 2) + 1.6 * sin(5 * a - t * 1.4));
    points.push(`${i ? "L" : "M"}${n(cx + rr * cos(a))} ${n(cy + rr * sin(a))}`);
  }
  return `${points.join("")}Z`;
}

const blob: Concept = {
  id: "blob",
  name: "Blob",
  kind: "Abstract",
  description:
    "No species, just a soft coral blob that ripples. It stretches up to think, spins its wobble while working, bounces when happy and deflates when sad.",
  draw(state, t) {
    let transform = "";
    let wobble = 1;
    let speed = 1;
    switch (state) {
      case "idle":
        break;
      case "thinking":
        transform = `translate(50 92) scale(${n(0.96)} ${n(1.05 + 0.02 * sin(t * 2))}) translate(-50 -92)`;
        break;
      case "working":
        wobble = 1.4;
        speed = 3;
        break;
      case "happy": {
        const p = cycle(t, 0.85);
        transform = `translate(0 ${n(-16 * arc01(p))}) ${squash(p, 50, 92)}`;
        break;
      }
      case "oops":
        wobble = 0.6 + 0.6 * Math.max(0, 1 - cycle(t, 2) * 2);
        transform = "translate(50 92) scale(1.1 0.84) translate(-50 -92)";
        break;
      case "asleep":
        wobble = 0.5;
        speed = 0.4;
        transform = `translate(50 92) scale(1.16 ${n(0.76 + 0.02 * sin(t * 1.1))}) translate(-50 -92)`;
        break;
    }
    return (
      <>
        <Shadow w={28} />
        <g transform={transform}>
          <path d={blobPath(50, 60, 32, t * speed, wobble)} fill="#ff7a59" />
          <ellipse
            cx={38}
            cy={44}
            rx={7}
            ry={4.5}
            transform="rotate(-30 38 44)"
            fill="#fff"
            opacity={0.35}
          />
          <Face x={50} y={58} s={1} state={state} t={t} />
        </g>
        {state === "thinking" && <ThinkingDots x={76} y={18} t={t} />}
        {state === "asleep" && <Zs x={76} y={44} t={t} />}
      </>
    );
  },
};

export const CONCEPTS: Concept[] = [bookworm, moth, inkDrop, stickyNote, blob];

export function useTime(): number {
  const [t, setT] = useState(0);
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    let frame = 0;
    const start = performance.now();
    const tick = (now: number) => {
      setT((now - start) / 1000);
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, []);
  return t;
}

type Props = { concept: Concept; state: MascotState; t: number; size: number };

// Drawn with room around the character, so a jump or a flap is not clipped.
export function Mascot({ concept, state, t, size }: Props) {
  return (
    <svg viewBox="-8 -8 116 116" width={size} height={size} aria-hidden className="shrink-0">
      {concept.draw(state, t)}
    </svg>
  );
}
