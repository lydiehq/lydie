import {
  AriaDialog,
  Avatar,
  BotAvatar,
  Button,
  DialogTrigger,
  fmt,
  HistoryAnticlockwiseRegular,
  More1Regular,
  Popover,
  SCRIBBLE_PAPER,
  SCRIBBLE_PENS,
  scribbleFor,
  ScribbleIcon,
  scribbleOutline,
  strokesFor,
} from "@lydie/ui";
import type { Scribble, ScribblePoint } from "@lydie/ui";
import { useId } from "react";
import type { CSSProperties, ReactNode } from "react";

// Agents: whoever writes through MCP, the API or the CLI. Each look below is a doodle in the
// same pen-on-paper language as people's, but should say "a machine did this" at 16 px. A page's
// top right then shows who wrote it, agents included, and for whom.

export type AgentVariant = {
  id: string;
  name: string;
  description: string;
  // `behalf`: the seed of the person it worked for, shown as a badge.
  render: (seed: string, size: number, behalf?: string | null) => ReactNode;
};

type P = ScribblePoint;
const TAU = Math.PI * 2;
const C = 50;

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

function curve(count: number, from: number, to: number, f: (u: number) => P): P[] {
  return Array.from({ length: count + 1 }, (_, i) => f(from + ((to - from) * i) / count));
}

const ring = (cx: number, cy: number, r: number, count = 24): P[] =>
  curve(count, 0, TAU, (t) => [cx + r * Math.cos(t), cy + r * Math.sin(t)]);

// A four-pointed sparkle, the sign people already read as "AI": an astroid, pinched further.
function sparkle(cx: number, cy: number, r: number): P[] {
  const bend = (v: number) => Math.sign(v) * Math.abs(v) ** 3.4;
  return curve(120, 0, TAU, (t) => [cx + r * bend(Math.cos(t)), cy + r * bend(Math.sin(t))]);
}

// A rounded box as dense points, so the wobble bends its sides.
function box(x0: number, y0: number, x1: number, y1: number, round: number): P[] {
  const out: P[] = [];
  const corners: [number, number, number][] = [
    [x1 - round, y0 + round, -Math.PI / 2],
    [x1 - round, y1 - round, 0],
    [x0 + round, y1 - round, Math.PI / 2],
    [x0 + round, y0 + round, Math.PI],
  ];
  for (const [cx, cy, start] of corners) {
    out.push(
      ...curve(10, start, start + Math.PI / 2, (t) => [
        cx + round * Math.cos(t),
        cy + round * Math.sin(t),
      ]),
    );
  }
  out.push(out[0]!);
  return out;
}

const SPARKLES: Scribble[] = [
  { id: "sparkle", name: "Sparkle", strokes: () => [sparkle(C, C, 31)] },
  {
    id: "sparkles",
    name: "Sparkles",
    strokes: () => [sparkle(C - 5, C + 5, 27), sparkle(C + 19, C - 19, 11)],
  },
];

// Little robot heads: a box, an antenna, two eyes. The seed picks the antenna and the eyes, so
// Claude and Cursor are not the same robot.
const ROBOTS: Scribble[] = (["one", "two"] as const).flatMap((antenna) =>
  (["dots", "visor"] as const).map((eyes): Scribble => ({
    id: `robot-${antenna}-${eyes}`,
    name: "Robot",
    strokes: () => [
      box(C - 21, C - 11, C + 21, C + 22, 7),
      ...(antenna === "one"
        ? [curve(4, C - 11, C - 19, (y): P => [C, y]), ring(C, C - 23, 3.5)]
        : [
            curve(4, 0, 1, (u): P => [C - 10 - 4 * u, C - 11 - 9 * u]),
            curve(4, 0, 1, (u): P => [C + 10 + 4 * u, C - 11 - 9 * u]),
          ]),
      ...(eyes === "dots"
        ? [ring(C - 9, C + 3, 3, 12), ring(C + 9, C + 3, 3, 12)]
        : [curve(10, C - 12, C + 12, (x): P => [x, C + 3])]),
      curve(6, C - 6, C + 6, (x): P => [x, C + 13]),
    ],
  })),
);

const pathOf = (points: P[]) =>
  points.map(([x, y], i) => `${i ? "L" : "M"}${fmt(x)} ${fmt(y)}`).join("");

// The pen line is about 1.3 px at any size, as ScribbleIcon's.
const lineWidth = (size: number) => Math.max(4.6, (1.3 * 100) / size);

function Svg({ size, children }: { size: number; children: ReactNode }) {
  return (
    <svg viewBox="0 0 100 100" width={size} height={size} aria-hidden className="shrink-0">
      {children}
    </svg>
  );
}

// A machine draws the seed's own doodle, but steady (no wobble) and in dots, like a plotter.
function Plotted({ seed, size }: { seed: string; size: number }) {
  const { scribble, pen } = scribbleFor(seed);
  const width = lineWidth(size);
  return (
    <Svg size={size}>
      <path d={scribbleOutline("circle")} fill={SCRIBBLE_PAPER} />
      <g
        fill="none"
        stroke={pen}
        strokeWidth={width}
        strokeLinecap="round"
        strokeDasharray={`0 ${fmt(width * 1.9)}`}
      >
        {scribble.strokes().map((points, i) => (
          <path key={i} d={pathOf(points)} />
        ))}
      </g>
    </Svg>
  );
}

// The negative of a person's: paper-coloured line on a disc of the pen's ink, like a stamp.
function Stamped({ seed, size }: { seed: string; size: number }) {
  const choice = scribbleFor(seed);
  const { paths, transform } = strokesFor(choice);
  return (
    <Svg size={size}>
      <path d={scribbleOutline("circle")} fill={choice.pen} />
      <g
        transform={transform}
        fill="none"
        stroke={SCRIBBLE_PAPER}
        strokeWidth={lineWidth(size)}
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        {paths.map((d, i) => (
          <path key={i} d={d} />
        ))}
      </g>
    </Svg>
  );
}

// The person's own doodle with a small sparkle tag at the top right: the agent is how they wrote
// it, not someone else.
function Tagged({ seed, size, behalf }: { seed: string; size: number; behalf?: string | null }) {
  const tag = Math.max(8, Math.round(size * 0.48));
  const overhang = Math.round(tag * 0.18);
  const centre = { x: size - tag / 2 + overhang, y: tag / 2 - overhang };
  const cut = `radial-gradient(circle at ${centre.x}px ${centre.y}px, transparent ${tag / 2 + 1.5}px, #000 ${tag / 2 + 2}px)`;
  const pen = penFor(seed);
  return (
    <span className="relative inline-flex shrink-0" style={{ width: size, height: size }}>
      <span className="inline-flex" style={{ maskImage: cut, WebkitMaskImage: cut }}>
        <Avatar seed={behalf ?? seed} size={size} />
      </span>
      <span className="absolute" style={{ right: -overhang, top: -overhang }}>
        <Svg size={tag}>
          <circle cx={50} cy={50} r={50} fill={pen} />
          <path d={pathOf(sparkle(50, 50, 30))} fill={SCRIBBLE_PAPER} />
        </Svg>
      </span>
    </span>
  );
}

// The person it worked for, in a cut-out at the bottom right (as BotAvatar does it).
function Behalf({
  behalf,
  size,
  children,
}: {
  behalf?: string | null;
  size: number;
  children: ReactNode;
}) {
  if (!behalf || size < 20) return children;
  const badge = Math.max(10, Math.round(size * 0.5));
  const overhang = Math.round(badge * 0.18);
  const centre = size - badge / 2 + overhang;
  const cut = `radial-gradient(circle at ${centre}px ${centre}px, transparent ${badge / 2 + 1.5}px, #000 ${badge / 2 + 2}px)`;
  return (
    <span className="relative inline-flex shrink-0" style={{ width: size, height: size }}>
      <span className="inline-flex" style={{ maskImage: cut, WebkitMaskImage: cut }}>
        {children}
      </span>
      <Avatar
        seed={behalf}
        size={badge}
        style={{ position: "absolute", right: -overhang, bottom: -overhang }}
      />
    </span>
  );
}

const penFor = (seed: string) => pick(SCRIBBLE_PENS, seed, "agent-pen");

export const AGENT_VARIANTS: AgentVariant[] = [
  {
    id: "sparkle",
    name: "Sparkle",
    description:
      "A hand-drawn sparkle on the people's paper: the sign everyone already reads as AI, in our pen. One or two sparkles and a pen per agent.",
    render: (seed, size, behalf) => (
      <Behalf behalf={behalf} size={size}>
        <ScribbleIcon
          choice={{ scribble: pick(SPARKLES, seed, "sparkle"), pen: penFor(seed), seed }}
          size={size}
          shape="circle"
        />
      </Behalf>
    ),
  },
  {
    id: "robot",
    name: "Robot doodle",
    description:
      "A little robot head someone drew in the margin. Plainly a machine, a bit of fun; four heads (antennas and eyes) and a pen per agent.",
    render: (seed, size, behalf) => (
      <Behalf behalf={behalf} size={size}>
        <ScribbleIcon
          choice={{ scribble: pick(ROBOTS, seed, "robot"), pen: penFor(seed), seed }}
          size={size}
          shape="circle"
        />
      </Behalf>
    ),
  },
  {
    id: "plotter",
    name: "Plotter",
    description:
      "The same doodles people get, but drawn by a machine: perfectly steady, in dots. The hand wobbles, the plotter does not.",
    render: (seed, size, behalf) => (
      <Behalf behalf={behalf} size={size}>
        <Plotted seed={seed} size={size} />
      </Behalf>
    ),
  },
  {
    id: "stamp",
    name: "Stamp",
    description:
      "A person's doodle, inverted: paper line on a disc of ink. Same family, opposite tone, so it stands out in a row of faces.",
    render: (seed, size, behalf) => (
      <Behalf behalf={behalf} size={size}>
        <Stamped seed={seed} size={size} />
      </Behalf>
    ),
  },
  {
    id: "tag",
    name: "Person, tagged",
    description:
      "No face of its own: the person it worked for, with a sparkle tag in the agent's pen. Says 'Maya, through Claude' rather than 'Claude'.",
    render: (seed, size, behalf) => <Tagged seed={seed} size={size} behalf={behalf} />,
  },
  {
    id: "screen",
    name: "On a screen",
    description:
      "What the app has now (BotAvatar): the doodles in a light colour on a dark screen, for comparison.",
    render: (seed, size, behalf) => (
      <BotAvatar seed={seed} size={size} behalf={behalf && size >= 20 ? { seed: behalf } : null} />
    ),
  },
];

export const AGENT_NAMES = [
  "Claude",
  "Claude Code",
  "Cursor",
  "Codex",
  "ChatGPT",
  "Gemini CLI",
  "OpenCode",
  "Zed",
  "Linear sync",
  "Zapier",
  "API token",
  "Lydie CLI",
];

const MAYA = "Maya Lindqvist";
const JONAS = "Jonas Berg";
const ADA = "Ada Okafor";

type Who =
  | { kind: "person"; name: string }
  | { kind: "agent"; name: string; behalf: string | null };

type Contributor = {
  who: Who;
  role: string;
  share: number;
  when: string;
};

const CONTRIBUTORS: Contributor[] = [
  {
    who: { kind: "agent", name: "Claude", behalf: MAYA },
    role: "Wrote the first draft, 6 edits since",
    share: 54,
    when: "4 min ago",
  },
  {
    who: { kind: "person", name: MAYA },
    role: "Created the page, edited",
    share: 26,
    when: "1 h ago",
  },
  {
    who: { kind: "agent", name: "Cursor", behalf: JONAS },
    role: "Updated the API section",
    share: 14,
    when: "Yesterday",
  },
  { who: { kind: "person", name: JONAS }, role: "Edited, 2 comments", share: 6, when: "Mon" },
];

const firstName = (name: string) => name.split(" ")[0]!;

// `alone`: without the person an agent worked for (in a pile, the badges crowd the faces).
function Face({
  who,
  size,
  agent,
  alone,
}: {
  who: Who;
  size: number;
  agent: AgentVariant;
  alone?: boolean;
}) {
  return who.kind === "person" ? (
    <Avatar seed={who.name} size={size} />
  ) : (
    agent.render(who.name, size, alone ? null : who.behalf)
  );
}

function nameOf(who: Who) {
  return who.kind === "agent" && who.behalf ? (
    <>
      {who.name} <span className="font-normal text-gray-500">for {firstName(who.behalf)}</span>
    </>
  ) : (
    who.name
  );
}

// Overlapping faces, each lifted off the page by a ring of its background.
function Facepile({
  people,
  agent,
  size = 20,
  more,
}: {
  people: Who[];
  agent: AgentVariant;
  size?: number;
  more?: number;
}) {
  return (
    <span className="flex items-center -space-x-1">
      {people.map((who, i) => (
        // The hairline keeps paper faces apart on a white page; outlines paint over the picture.
        <span
          key={i}
          className="flex rounded-full bg-surface ring-2 ring-surface outline-1 -outline-offset-1 outline-gray-950/10"
        >
          <Face who={who} size={size} agent={agent} alone />
        </span>
      ))}
      {more ? (
        <span
          className="relative flex items-center justify-center rounded-full bg-gray-100 text-[10px] font-medium text-gray-600 ring-2 ring-surface"
          style={{ width: size, height: size }}
        >
          +{more}
        </span>
      ) : null}
    </span>
  );
}

// An agent writing right now: a pen circling round it, as presence does for people.
function Working({ children, size }: { children: ReactNode; size: number }) {
  return (
    <span className="relative inline-flex shrink-0" style={{ width: size, height: size }}>
      {children}
      <svg
        viewBox="0 0 100 100"
        aria-hidden
        className="absolute -inset-[3px] animate-[spin_2.4s_linear_infinite] motion-reduce:animate-none"
        style={{ width: size + 6, height: size + 6 }}
      >
        <circle
          cx={50}
          cy={50}
          r={47}
          fill="none"
          stroke="#1f8a5b"
          strokeWidth={5}
          strokeLinecap="round"
          strokeDasharray="30 18"
        />
      </svg>
    </span>
  );
}

// The page's top-right button: who worked on it, newest first, and the history behind it.
function HistoryButton({
  people,
  agent,
  more,
  label,
}: {
  people: Who[];
  agent: AgentVariant;
  more?: number;
  label?: ReactNode;
}) {
  return (
    <DialogTrigger>
      <Button
        variant="ghost"
        size="sm"
        aria-label="Who worked on this"
        tooltip="Who worked on this"
        className="gap-2 px-1.5"
      >
        <Facepile people={people} agent={agent} more={more} size={22} />
        {label}
        <HistoryAnticlockwiseRegular className="size-4 text-gray-500" />
      </Button>
      <Popover placement="bottom end" className="w-80">
        <AriaDialog aria-label="Who worked on this" className="outline-none">
          <WhoPanel agent={agent} />
        </AriaDialog>
      </Popover>
    </DialogTrigger>
  );
}

// Agents' share of the writing is hatched, like shading done by machine; people's is solid.
function ShareBar() {
  const id = useId().replace(/[^\w-]/g, "");
  return (
    <svg viewBox="0 0 100 6" preserveAspectRatio="none" className="h-1.5 w-full" aria-hidden>
      <defs>
        {CONTRIBUTORS.map((c, i) => (
          <pattern
            key={i}
            id={`${id}-${i}`}
            width={1.6}
            height={6}
            patternUnits="userSpaceOnUse"
            patternTransform="skewX(-30)"
          >
            <rect width={1.6} height={6} fill={penOf(c.who)} fillOpacity={0.25} />
            <rect width={0.7} height={6} fill={penOf(c.who)} />
          </pattern>
        ))}
        <clipPath id={`${id}-clip`}>
          <rect width={100} height={6} rx={3} />
        </clipPath>
      </defs>
      <g clipPath={`url(#${id}-clip)`}>
        {
          CONTRIBUTORS.reduce<{ x: number; nodes: ReactNode[] }>(
            ({ x, nodes }, c, i) => ({
              x: x + c.share,
              nodes: [
                ...nodes,
                <rect
                  key={i}
                  x={x + (i ? 0.4 : 0)}
                  width={c.share - (i ? 0.4 : 0)}
                  height={6}
                  fill={c.who.kind === "agent" ? `url(#${id}-${i})` : penOf(c.who)}
                />,
              ],
            }),
            { x: 0, nodes: [] },
          ).nodes
        }
      </g>
    </svg>
  );
}

const penOf = (who: Who) => (who.kind === "agent" ? penFor(who.name) : scribbleFor(who.name).pen);

function WhoPanel({ agent }: { agent: AgentVariant }) {
  const byAgents = CONTRIBUTORS.filter((c) => c.who.kind === "agent").reduce(
    (sum, c) => sum + c.share,
    0,
  );
  return (
    <div className="flex flex-col text-sm">
      <div className="flex flex-col gap-2 p-3 pb-2.5">
        <div className="flex items-baseline justify-between">
          <span className="text-xs font-medium text-gray-500">Who worked on this</span>
          <span className="text-xs text-gray-400">{byAgents}% by agents</span>
        </div>
        <ShareBar />
      </div>
      <ul className="flex flex-col px-1.5 pb-1.5">
        {CONTRIBUTORS.map((c) => (
          <li
            key={`${c.who.name}`}
            className="flex items-center gap-2.5 rounded-md px-1.5 py-1.5 hover:bg-gray-950/4"
          >
            <Face who={c.who} size={28} agent={agent} />
            <div className="flex min-w-0 grow flex-col">
              <span className="truncate font-medium text-gray-900">{nameOf(c.who)}</span>
              <span className="truncate text-xs text-gray-500">{c.role}</span>
            </div>
            <span className="shrink-0 text-xs text-gray-400">{c.when}</span>
          </li>
        ))}
      </ul>
      <div className="flex items-center gap-2.5 border-t border-gray-950/6 px-3 py-2.5">
        {agent.render("Linear sync", 20)}
        <span className="grow text-xs text-gray-600">
          <span className="font-medium text-gray-900">Linear sync</span> keeps the status table up
          to date, hourly
        </span>
      </div>
      <div className="border-t border-gray-950/6 p-1.5">
        <Button variant="ghost" size="sm" className="w-full justify-start">
          <HistoryAnticlockwiseRegular data-icon="inline-start" />
          Version history
        </Button>
      </div>
    </div>
  );
}

function Mock({ title, children }: { title: string; children: ReactNode }) {
  return (
    <article className="flex flex-col gap-3 rounded-xl border border-gray-950/8 bg-elevated p-5">
      <h3 className="text-xs font-medium text-gray-500">{title}</h3>
      {children}
    </article>
  );
}

const claude: Who = { kind: "agent", name: "Claude", behalf: MAYA };
const cursor: Who = { kind: "agent", name: "Cursor", behalf: JONAS };
const maya: Who = { kind: "person", name: MAYA };
const jonas: Who = { kind: "person", name: JONAS };
const ada: Who = { kind: "person", name: ADA };

// A page with the button at its top right; press it for the panel.
function PageMock({ agent }: { agent: AgentVariant }) {
  return (
    <div className="flex flex-col overflow-hidden rounded-lg bg-surface shadow-surface ring-1 ring-gray-950/6">
      <div className="flex h-10 items-center gap-1.5 px-2.5">
        <span className="text-sm text-gray-500">Projects</span>
        <span className="text-sm text-gray-300">/</span>
        <span className="grow truncate text-sm text-gray-900">Q4 launch plan</span>
        <HistoryButton people={[claude, maya, cursor]} more={1} agent={agent} />
        <Button size="xs" variant="secondary">
          Share
        </Button>
        <Button size="icon-sm" variant="ghost" aria-label="More">
          <More1Regular />
        </Button>
      </div>
      <div className="flex flex-col gap-2 px-10 pt-6 pb-8">
        <h4 className="text-2xl font-semibold text-gray-900">Q4 launch plan</h4>
        <p className="text-sm leading-6 text-gray-700">
          We ship the hosted MCP server to everyone on November 30, with the docs and a short video.
          The beta list gets it a week early.
        </p>
        <p className="text-sm leading-6 text-gray-700">
          Open questions: pricing for teams, and whether the CLI ships in the same release.
        </p>
      </div>
    </div>
  );
}

// What the button says in different pages.
function States({ agent }: { agent: AgentVariant }) {
  const rows: { label: string; note: string; node: ReactNode }[] = [
    {
      label: "Only you",
      note: "Nothing to say: just the history icon",
      node: (
        <Button variant="ghost" size="icon-sm" aria-label="Version history">
          <HistoryAnticlockwiseRegular />
        </Button>
      ),
    },
    {
      label: "You and an agent",
      note: "The agent first: it wrote most of it",
      node: <Facepile people={[claude, maya]} agent={agent} />,
    },
    {
      label: "A team with agents",
      note: "Three faces, newest first, then a count",
      node: <Facepile people={[cursor, jonas, maya]} more={3} agent={agent} />,
    },
    {
      label: "An agent is writing",
      note: "A pen circling it, like a person's presence",
      node: (
        <span className="flex items-center gap-2">
          <Working size={20}>{agent.render("Claude", 20)}</Working>
          <span className="text-xs text-gray-600">Claude is writing…</span>
        </span>
      ),
    },
    {
      label: "Drafted, not reviewed",
      note: "Written only by agents: nobody has read it yet",
      node: (
        <span className="flex items-center gap-2">
          {agent.render("Claude Code", 20)}
          <span className="rounded-full bg-amber-500/12 px-1.5 py-px text-[11px] font-medium text-amber-700">
            Draft
          </span>
        </span>
      ),
    },
    {
      label: "Kept by an automation",
      note: "Edits here may be written over",
      node: (
        <span className="flex items-center gap-2">
          {agent.render("Linear sync", 20)}
          <span className="text-xs text-gray-600">Kept by Linear sync</span>
        </span>
      ),
    },
  ];
  return (
    <ul className="flex flex-col divide-y divide-gray-950/6">
      {rows.map((row) => (
        <li key={row.label} className="flex items-center gap-3 py-2">
          <div className="flex min-w-0 grow flex-col">
            <span className="text-sm text-gray-900">{row.label}</span>
            <span className="text-xs text-gray-500">{row.note}</span>
          </div>
          <span className="flex h-7 shrink-0 items-center">{row.node}</span>
        </li>
      ))}
    </ul>
  );
}

// Who wrote each paragraph, in the gutter: agents' text marked with a hatched rule.
function Margin({ agent }: { agent: AgentVariant }) {
  const paragraphs: { who: Who; text: string }[] = [
    {
      who: maya,
      text: "Customers keep asking how to point their own agents at Lydie. This page is the plan.",
    },
    {
      who: claude,
      text: "Three things ship together: the hosted MCP server, OAuth for desktop clients, and per-page history that shows which agent wrote what.",
    },
    {
      who: cursor,
      text: "The API section is generated from the contract, so the docs cannot drift from the server.",
    },
    { who: ada, text: "Let's keep the launch post short. A video does the rest." },
  ];
  return (
    <div className="flex flex-col gap-3">
      {paragraphs.map((p, i) => {
        const hatch: CSSProperties | undefined =
          p.who.kind === "agent"
            ? {
                backgroundImage: `repeating-linear-gradient(-45deg, ${penOf(p.who)} 0 1.5px, transparent 1.5px 4px)`,
              }
            : undefined;
        return (
          <div key={i} className="group flex gap-2.5">
            <span className="flex w-4 shrink-0 justify-center pt-0.5 opacity-60 group-hover:opacity-100">
              <Face who={p.who} size={16} agent={agent} />
            </span>
            <span
              className={`w-[3px] shrink-0 rounded-full ${p.who.kind === "agent" ? "" : "bg-transparent"}`}
              style={hatch}
            />
            <p className="text-sm leading-6 text-gray-700">{p.text}</p>
          </div>
        );
      })}
    </div>
  );
}

// Sizes, light and dark, with and without the person it worked for.
function Sizes({ agent }: { agent: AgentVariant }) {
  const sizes = [48, 32, 24, 20, 16];
  const row = (dark: boolean) => (
    <div
      className={`flex flex-wrap items-end gap-x-8 gap-y-4 rounded-lg p-4 ${
        dark ? "bg-gray-900" : "bg-gray-950/3"
      }`}
    >
      <div className="flex items-end gap-2.5">
        {sizes.map((size, i) => (
          <span key={size}>{agent.render(AGENT_NAMES[i]!, size)}</span>
        ))}
      </div>
      <div className="flex items-end gap-2.5">
        {sizes.map((size, i) => (
          <span key={size}>{agent.render(AGENT_NAMES[i]!, size, MAYA)}</span>
        ))}
      </div>
      <div className="flex items-end gap-2">
        {[MAYA, JONAS, ADA].map((name) => (
          <Avatar key={name} seed={name} size={24} />
        ))}
        {AGENT_NAMES.slice(0, 3).map((name) => (
          <span key={name}>{agent.render(name, 24)}</span>
        ))}
      </div>
    </div>
  );
  return (
    <div className="flex flex-col gap-3">
      {row(false)}
      {row(true)}
    </div>
  );
}

export function AgentMocks({ agent }: { agent: AgentVariant }) {
  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_320px]">
        <Mock title="Top right of a page (press the faces)">
          <PageMock agent={agent} />
        </Mock>
        <Mock title="Who worked on this, open">
          <div className="-mx-2 rounded-lg shadow-popover">
            <WhoPanel agent={agent} />
          </div>
        </Mock>
      </div>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <Mock title="What the button shows">
          <States agent={agent} />
        </Mock>
        <Mock title="Who wrote what, in the margin">
          <Margin agent={agent} />
        </Mock>
      </div>
      <Mock title="Sizes, alone and for someone, next to people">
        <Sizes agent={agent} />
      </Mock>
    </div>
  );
}
