import { useApp } from "@lydie/plugin-api";
import {
  Button,
  LydieAvatar,
  SCRIBBLE_PENS,
  ScribbleIcon,
  SCRIBBLES,
  StarFilled,
  StarRegular,
} from "@lydie/plugin-api/ui";
import { useState } from "react";
import type { ReactNode } from "react";

import { AGENT_NAMES, AGENT_VARIANTS, AgentMocks } from "./agents.tsx";
import { CONCEPTS, Mascot, MASCOT_STATES, useTime } from "./mascot.tsx";
import type { Concept, MascotState } from "./mascot.tsx";
import { VARIANTS } from "./variants.tsx";
import type { Kind, Variant } from "./variants.tsx";

const STORAGE_KEY = "avatars";

const NAMES: Record<Kind, string[]> = {
  person: [
    "Maya Lindqvist",
    "Jonas Berg",
    "Ada Okafor",
    "Sam Chen",
    "Ines Duarte",
    "Tomas Novak",
    "Lea Fischer",
    "Ravi Patel",
    "Noor Haddad",
    "Kai Müller",
    "Elif Yilmaz",
    "Oskar Dahl",
  ],
  workspace: [
    "Maya's notes",
    "Acme Inc",
    "Book club",
    "Thesis",
    "Lydie",
    "Field notes",
    "Garden",
    "Recipes",
    "Launch",
    "Research",
    "Side projects",
    "Journal",
  ],
  robot: [
    "Claude Desktop",
    "Cursor",
    "Zapier",
    "CI deploy key",
    "Raycast",
    "ChatGPT",
    "Obsidian import",
    "Slack",
    "Linear sync",
    "Backup script",
    "n8n",
    "Lydie CLI",
  ],
};

const SECTIONS: { kind: Kind; title: string; description: string }[] = [
  {
    kind: "person",
    title: "People",
    description: "Members, guests and anyone mentioned. Seeded by user id.",
  },
  {
    kind: "workspace",
    title: "Workspaces and teamspaces",
    description: "The workspace button, the switcher, teamspaces, share targets.",
  },
  {
    kind: "robot",
    title: "Robots",
    description:
      "MCP clients, API keys, the CLI, imports and automations: anything that edits on someone's behalf. They should never pass for a person.",
  },
];

type Picks = Partial<Record<Kind | "mascot" | "agent", string>>;

export function AvatarsPlayground() {
  const app = useApp();
  const [picks, setPicks] = useState<Picks>(() => app.storage.get<Picks>(STORAGE_KEY) ?? {});
  const toggle = (kind: Kind | "mascot" | "agent", id: string) => {
    const next = { ...picks, [kind]: picks[kind] === id ? undefined : id };
    setPicks(next);
    app.storage.set(STORAGE_KEY, next);
  };
  const chosen = (kind: Kind): Variant =>
    VARIANTS[kind].find((v) => v.id === picks[kind]) ?? VARIANTS[kind][0]!;
  const concept = CONCEPTS.find((c) => c.id === picks.mascot) ?? CONCEPTS[0]!;
  const agent = AGENT_VARIANTS.find((v) => v.id === picks.agent) ?? AGENT_VARIANTS[0]!;
  const draw = {
    person: (name: string, size: number) => chosen("person").render(name, size),
    workspace: (name: string, size: number) => chosen("workspace").render(name, size),
    robot: (name: string, size: number) => chosen("robot").render(name, size),
  };

  return (
    <div className="min-h-0 grow overflow-y-auto" data-testid="avatars-playground">
      <div className="mx-auto flex w-full max-w-[1120px] flex-col gap-10 px-8 pt-10 pb-16">
        <header className="flex flex-col gap-1">
          <h1 className="text-lg font-medium text-gray-900">Avatars</h1>
          <p className="max-w-[720px] text-sm text-gray-500">
            Three kinds of thing that need a face: people, places and machines. Each should be
            recognisably Lydie (built from the mark) and recognisably its kind at 16 px. Star one
            per row; the mocks at the bottom use the starred ones (or the first).
          </p>
        </header>

        <section aria-label="Agents" className="flex flex-col gap-4">
          <div>
            <h2 className="text-sm font-medium text-gray-900">Agents</h2>
            <p className="max-w-[720px] text-sm text-gray-500">
              Most writing in Lydie can come through MCP, the API or the CLI, so a page should say
              who wrote it, agents included, and for whom. An agent's avatar is a scribble like
              everyone's, but must read as a machine at 16 px and never pass for a person. Star one;
              the mocks below use it ({agent.name}).
            </p>
          </div>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
            {AGENT_VARIANTS.map((variant) => (
              <VariantCard
                key={variant.id}
                variant={variant}
                names={AGENT_NAMES}
                picked={picks.agent === variant.id}
                onPick={() => toggle("agent", variant.id)}
              />
            ))}
          </div>
          <AgentMocks agent={agent} />
        </section>

        <Scribbles />

        {SECTIONS.map((section) => (
          <section key={section.kind} aria-label={section.title} className="flex flex-col gap-3">
            <div>
              <h2 className="text-sm font-medium text-gray-900">{section.title}</h2>
              <p className="text-sm text-gray-500">{section.description}</p>
            </div>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
              {VARIANTS[section.kind].map((variant) => (
                <VariantCard
                  key={variant.id}
                  variant={variant}
                  names={NAMES[section.kind]}
                  picked={picks[section.kind] === variant.id}
                  onPick={() => toggle(section.kind, variant.id)}
                />
              ))}
            </div>
          </section>
        ))}

        <section aria-label="Mascot" className="flex flex-col gap-3">
          <div>
            <h2 className="text-sm font-medium text-gray-900">Mascot</h2>
            <p className="max-w-[720px] text-sm text-gray-500">
              Lydie itself: the agent, sync, empty pages. A character of its own, not the logo:
              creatures, writing objects and a blob, all with the same simple face, each through the
              same six states.
            </p>
          </div>
          <div className="flex flex-col gap-4">
            {CONCEPTS.map((c) => (
              <ConceptCard
                key={c.id}
                concept={c}
                picked={picks.mascot === c.id}
                onPick={() => toggle("mascot", c.id)}
              />
            ))}
          </div>
        </section>

        <section aria-label="Together" className="flex flex-col gap-4">
          <div>
            <h2 className="text-sm font-medium text-gray-900">Together</h2>
            <p className="text-sm text-gray-500">
              {chosen("person").name} · {chosen("workspace").name} · {chosen("robot").name} ·{" "}
              {concept.name}
            </p>
          </div>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <Mock title="Workspace switcher">
              <Switcher draw={draw} />
            </Mock>
            <Mock title="Members and connected apps">
              <Members draw={draw} />
            </Mock>
            <Mock title="Page history">
              <History draw={draw} />
            </Mock>
            <Mock title="Top bar and mentions">
              <TopBar draw={draw} />
            </Mock>
            <Mock title="Lydie at work">
              <LydieAtWork concept={concept} draw={draw} />
            </Mock>
            <Mock title="Empty page and status">
              <LydieStatus concept={concept} />
            </Mock>
          </div>
          <Mock title="Sizes, light and dark">
            <Sizes draw={draw} />
          </Mock>
        </section>
      </div>
    </div>
  );
}

type Draw = Record<Kind, (name: string, size: number) => ReactNode>;

function VariantCard({
  variant,
  names,
  picked,
  onPick,
}: {
  variant: Variant;
  names: string[];
  picked: boolean;
  onPick: () => void;
}) {
  return (
    <article
      aria-label={variant.name}
      className={`flex flex-col gap-4 rounded-xl border bg-elevated p-5 ${
        picked ? "border-gray-950/25" : "border-gray-950/8"
      }`}
    >
      <div className="flex items-start gap-2">
        <div className="grow">
          <h3 className="text-sm font-medium text-gray-900">{variant.name}</h3>
          <p className="mt-0.5 text-sm text-gray-500">{variant.description}</p>
        </div>
        <Button
          size="icon-sm"
          variant="ghost"
          aria-label={picked ? `Unpick ${variant.name}` : `Pick ${variant.name}`}
          onPress={onPick}
        >
          {picked ? <StarFilled className="text-amber-500" /> : <StarRegular />}
        </Button>
      </div>
      <div className="flex items-center justify-center gap-4 py-1">
        {variant.render(names[0]!, 80)}
        {variant.render(names[1]!, 80)}
      </div>
      <div className="grid grid-cols-6 gap-2">
        {names.map((name) => (
          <span key={name} title={name} className="flex justify-center">
            {variant.render(name, 36)}
          </span>
        ))}
      </div>
      <div className="flex items-center gap-2">
        {names.slice(0, 6).map((name) => (
          <span key={name}>{variant.render(name, 16)}</span>
        ))}
        <span className="mx-1 h-4 w-px bg-gray-950/10" />
        <div className="flex items-center gap-2 rounded-md bg-gray-900 px-2 py-1.5">
          {names.slice(0, 5).map((name) => (
            <span key={name}>{variant.render(name, 20)}</span>
          ))}
        </div>
      </div>
    </article>
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

function Switcher({ draw }: { draw: Draw }) {
  return (
    <div className="flex w-72 flex-col rounded-xl py-1 shadow-popover">
      <div className="px-3 pt-1 pb-1 text-xs font-medium text-gray-500">Workspaces</div>
      {NAMES.workspace.slice(0, 5).map((name, i) => (
        <div
          key={name}
          className={`flex h-8 items-center gap-2 px-3 text-sm ${
            i === 0 ? "font-medium text-gray-900" : "text-gray-700"
          }`}
        >
          {draw.workspace(name, 18)}
          <span className="grow truncate">{name}</span>
          <span className="text-xs text-gray-400">{i === 0 ? "This browser" : "Cloud"}</span>
        </div>
      ))}
      <div className="mt-1 flex h-8 items-center gap-2 border-t border-gray-950/5 px-3 text-sm text-gray-700">
        {draw.person(NAMES.person[0]!, 18)}
        maya@example.com
      </div>
    </div>
  );
}

function Members({ draw }: { draw: Draw }) {
  const rows: { kind: Kind; name: string; detail: string }[] = [
    { kind: "person", name: NAMES.person[0]!, detail: "Owner" },
    { kind: "person", name: NAMES.person[1]!, detail: "Member" },
    { kind: "person", name: NAMES.person[2]!, detail: "Guest" },
    { kind: "robot", name: NAMES.robot[0]!, detail: "MCP · acts as Maya" },
    { kind: "robot", name: NAMES.robot[1]!, detail: "MCP · acts as Jonas" },
    { kind: "robot", name: NAMES.robot[3]!, detail: "API key · read only" },
  ];
  return (
    <ul className="flex flex-col divide-y divide-gray-950/6">
      {rows.map((row) => (
        <li key={row.name} className="flex items-center gap-3 py-2">
          {draw[row.kind](row.name, 32)}
          <span className="grow truncate text-sm text-gray-900">{row.name}</span>
          <span className="text-xs text-gray-500">{row.detail}</span>
        </li>
      ))}
    </ul>
  );
}

function History({ draw }: { draw: Draw }) {
  const rows: { kind: Kind; name: string; what: string; when: string }[] = [
    { kind: "robot", name: NAMES.robot[0]!, what: "rewrote the summary for Maya", when: "2 min" },
    { kind: "person", name: NAMES.person[0]!, what: "edited", when: "5 min" },
    { kind: "robot", name: NAMES.robot[2]!, what: "added 3 rows to Leads", when: "1 h" },
    { kind: "person", name: NAMES.person[3]!, what: "commented", when: "3 h" },
    { kind: "robot", name: NAMES.robot[11]!, what: "imported 12 pages", when: "Yesterday" },
  ];
  const lydie = { name: "Lydie", what: "restored 2 pages from the trash", when: "Monday" };
  return (
    <ul className="flex flex-col gap-2.5">
      {rows.map((row) => (
        <li key={`${row.name}${row.when}`} className="flex items-center gap-2 text-sm">
          {draw[row.kind](row.name, 20)}
          <span className="font-medium text-gray-900">{row.name}</span>
          <span className="grow truncate text-gray-600">{row.what}</span>
          <span className="text-xs text-gray-400">{row.when}</span>
        </li>
      ))}
      <li className="flex items-center gap-2 text-sm">
        <LydieAvatar size={20} />
        <span className="font-medium text-gray-900">{lydie.name}</span>
        <span className="grow truncate text-gray-600">{lydie.what}</span>
        <span className="text-xs text-gray-400">{lydie.when}</span>
      </li>
    </ul>
  );
}

function TopBar({ draw }: { draw: Draw }) {
  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center gap-2 rounded-lg border border-gray-950/8 px-3 py-2">
        {draw.workspace(NAMES.workspace[1]!, 16)}
        <span className="text-sm text-gray-500">{NAMES.workspace[1]}</span>
        <span className="text-sm text-gray-400">/</span>
        <span className="grow truncate text-sm text-gray-900">Q3 plan</span>
        <div className="flex -space-x-1.5">
          {[
            draw.person(NAMES.person[0]!, 22),
            draw.person(NAMES.person[4]!, 22),
            draw.robot(NAMES.robot[0]!, 22),
          ].map((node, i) => (
            <span key={i} className="flex rounded-full bg-elevated ring-2 ring-elevated">
              {node}
            </span>
          ))}
        </div>
        <Button size="xs" variant="secondary">
          Share
        </Button>
      </div>
      <p className="text-sm leading-7 text-gray-800">
        <Chip>{draw.person(NAMES.person[2]!, 16)}Ada Okafor</Chip> asked{" "}
        <Chip>{draw.robot(NAMES.robot[0]!, 16)}Claude Desktop</Chip> to move the notes into{" "}
        <Chip>{draw.workspace(NAMES.workspace[2]!, 16)}Book club</Chip>.
      </p>
    </div>
  );
}

function Chip({ children }: { children: ReactNode }) {
  return (
    <span className="inline-flex translate-y-[3px] items-center gap-1 rounded-md bg-gray-950/5 py-px pr-1.5 pl-0.5 align-baseline text-sm leading-4">
      {children}
    </span>
  );
}

function Sizes({ draw }: { draw: Draw }) {
  const sizes = [48, 32, 24, 20, 16];
  const row = (dark: boolean) => (
    <div
      className={`flex flex-wrap items-end gap-x-10 gap-y-4 rounded-lg p-4 ${
        dark ? "bg-gray-900" : "bg-gray-950/3"
      }`}
    >
      {(["person", "workspace", "robot"] as const).map((kind) => (
        <div key={kind} className="flex items-end gap-2.5">
          {sizes.map((size, i) => (
            <span key={size}>{draw[kind](NAMES[kind][i]!, size)}</span>
          ))}
        </div>
      ))}
    </div>
  );
  return (
    <div className="flex flex-col gap-3">
      {row(false)}
      {row(true)}
    </div>
  );
}

function ConceptCard({
  concept,
  picked,
  onPick,
}: {
  concept: Concept;
  picked: boolean;
  onPick: () => void;
}) {
  const t = useTime();
  return (
    <article
      aria-label={concept.name}
      className={`flex flex-col gap-4 rounded-xl border bg-elevated p-5 ${
        picked ? "border-gray-950/25" : "border-gray-950/8"
      }`}
    >
      <div className="flex items-start gap-2">
        <div className="grow">
          <h3 className="text-sm font-medium text-gray-900">
            {concept.name} <span className="font-normal text-gray-400">· {concept.kind}</span>
          </h3>
          <p className="mt-0.5 max-w-[720px] text-sm text-gray-500">{concept.description}</p>
        </div>
        <Button
          size="icon-sm"
          variant="ghost"
          aria-label={picked ? `Unpick ${concept.name}` : `Pick ${concept.name}`}
          onPress={onPick}
        >
          {picked ? <StarFilled className="text-amber-500" /> : <StarRegular />}
        </Button>
      </div>
      <div className="grid grid-cols-3 gap-3 md:grid-cols-6">
        {MASCOT_STATES.map((state) => (
          <div key={state.id} className="flex flex-col items-center gap-1.5 text-center">
            <div className="flex size-24 items-center justify-center rounded-lg bg-gray-950/3">
              <Mascot concept={concept} state={state.id} t={t} size={88} />
            </div>
            <span className="text-xs font-medium text-gray-800">{state.label}</span>
            <span className="text-[11px] leading-4 text-gray-500">{state.use}</span>
          </div>
        ))}
      </div>
      <div className="flex items-center gap-4">
        <span className="text-xs text-gray-500">Small</span>
        {MASCOT_STATES.map((state) => (
          <Mascot key={state.id} concept={concept} state={state.id} t={t} size={24} />
        ))}
        <div className="flex items-center gap-3 rounded-md bg-gray-900 px-3 py-1.5">
          {MASCOT_STATES.map((state) => (
            <Mascot key={state.id} concept={concept} state={state.id} t={t} size={24} />
          ))}
        </div>
      </div>
    </article>
  );
}

// The agent answering in a page's side panel: thinking, then writing.
function LydieAtWork({ concept, draw }: { concept: Concept; draw: Draw }) {
  const t = useTime();
  // Thinks for two seconds, writes for four, then is done for two.
  const phase = t % 8;
  const state: MascotState = phase < 2 ? "thinking" : phase < 6 ? "working" : "happy";
  const label = { thinking: "Thinking…", working: "Writing the summary…", happy: "Done" }[
    state as "thinking" | "working" | "happy"
  ];
  return (
    <div className="flex flex-col gap-3 text-sm">
      <div className="flex items-start gap-2">
        {draw.person(NAMES.person[0]!, 22)}
        <p className="rounded-lg bg-gray-950/5 px-3 py-1.5 text-gray-800">
          Summarise this page for the team update.
        </p>
      </div>
      <div className="flex items-start gap-2">
        <Mascot concept={concept} state={state} t={t} size={28} />
        <div className="flex flex-col gap-1 pt-1">
          <span className="font-medium text-gray-900">Lydie</span>
          <span className="text-gray-500">{label}</span>
        </div>
      </div>
    </div>
  );
}

function LydieStatus({ concept }: { concept: Concept }) {
  const t = useTime();
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col items-center gap-2 py-2 text-center">
        <Mascot concept={concept} state="idle" t={t} size={84} />
        <span className="text-sm font-medium text-gray-900">Nothing here yet</span>
        <span className="text-xs text-gray-500">
          Start writing, or ask Lydie to draft something.
        </span>
      </div>
      <div className="flex flex-col gap-1.5">
        {(
          [
            ["happy", "All changes synced"],
            ["working", "Importing 12 pages…"],
            ["oops", "Could not sync: the server refused a change"],
            ["asleep", "Offline. Changes are kept on this device."],
          ] as const
        ).map(([state, text]) => (
          <div
            key={state}
            className="flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-sm text-gray-700 ring ring-gray-950/8"
          >
            <Mascot concept={concept} state={state} t={t} size={20} />
            {text}
          </div>
        ))}
      </div>
    </div>
  );
}

// The ten doodles, then everyone seeded.
function Scribbles() {
  return (
    <section aria-label="Scribbles" className="flex flex-col gap-4">
      <div>
        <h2 className="text-sm font-medium text-gray-900">Scribbles</h2>
        <p className="max-w-[720px] text-sm text-gray-500">
          Lydie is a notepad, so avatars are doodles: ten scribbles a pen might leave in a margin,
          one stroke in one of {SCRIBBLE_PENS.length} pens on beige paper. A seed picks both, and
          the line wobbles a little differently for everyone.
        </p>
      </div>
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-5">
        {SCRIBBLES.map((scribble, i) => {
          const choice = {
            scribble,
            pen: SCRIBBLE_PENS[i % SCRIBBLE_PENS.length]!,
            seed: scribble.id,
          };
          return (
            <figure
              key={scribble.id}
              className="flex flex-col items-center gap-2 rounded-xl border border-gray-950/8 bg-elevated p-4"
            >
              <ScribbleIcon choice={choice} size={104} shape="circle" />
              <figcaption className="text-xs font-medium text-gray-700">{scribble.name}</figcaption>
              <div className="flex items-end gap-1.5">
                {[40, 24, 16].map((size) => (
                  <ScribbleIcon key={size} choice={choice} size={size} shape="circle" />
                ))}
              </div>
            </figure>
          );
        })}
      </div>
      <div className="flex flex-col gap-3 rounded-xl border border-gray-950/8 bg-elevated p-5">
        <span className="text-xs font-medium text-gray-500">Seeded from names</span>
        <div className="flex flex-wrap gap-2.5">
          {[...NAMES.person, ...NAMES.robot].map((name) => (
            <span key={name} title={name}>
              <ScribbleIcon seed={name} size={40} shape="circle" />
            </span>
          ))}
        </div>
        <div className="flex flex-wrap gap-2.5">
          {NAMES.workspace.map((name) => (
            <span key={name} title={name}>
              <ScribbleIcon seed={name} size={40} />
            </span>
          ))}
        </div>
      </div>
    </section>
  );
}
