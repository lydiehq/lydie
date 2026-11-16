// Who worked on this page, at its top right: a few faces (people and agents alike) that open the
// list of everyone, what they did and when. Agents write through MCP, the API and the CLI as much
// as people do in the editor, so a page says which did, and for whom.
import { useApp, useQuery, useQuerySelect, useWorkspace } from "@lydie/plugin-api";
import type { Activity, AppApi, DocumentSlotProps } from "@lydie/plugin-api";
import { useAccount } from "@lydie/plugin-api/hosted";
import {
  AriaDialog,
  Avatar,
  BotAvatar,
  Button,
  DialogTrigger,
  formatTimelineTime,
  HistoryAnticlockwiseRegular,
  LydieAvatar,
  Popover,
} from "@lydie/plugin-api/ui";
import { useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";

import {
  contributorsOf,
  LOCAL_USER_ID,
  othersWorkedOn,
  whoIs,
  workedOnLabel,
  workOf,
  writingUntil,
} from "./contributors.ts";
import type { Contributor, People, Who } from "./contributors.ts";

// After an edit, the list is read again once changes pause for this long, not on every save.
const RELOAD_DELAY_MS = 2000;
// Activity rows are coalesced (per person, session and kind of change), so a page rarely has
// more than one page of them; a very busy one is read this far back.
const MAX_PAGES = 5;
// Faces on the button; the rest are a count.
const FACES = 3;

// The page's activity, where the workspace keeps it: a synced window asks the hosted API (its
// replica only has what this device wrote), as the activity log does; other windows their runtime.
export async function readActivity(
  app: AppApi,
  query: { workspaceId: string; targetId: string },
): Promise<Activity[]> {
  const account = app.services?.account;
  const remote = app.workspace.mode === "synced" ? account?.callContract?.bind(account) : undefined;
  const items: Activity[] = [];
  let cursor: string | undefined;
  for (let page = 0; page < MAX_PAGES; page++) {
    const input = { ...query, limit: 100, ...(cursor ? { cursor } : {}) };
    const result = remote
      ? await remote("activity.list", input)
      : await app.backend.execute("activity.list", input);
    items.push(...result.items);
    if (!result.nextCursor) break;
    cursor = result.nextCursor;
  }
  return items;
}

type Loaded = { docId: string; items: Activity[]; at: number };

// `me`: read again when it changes, so signing in fills a list read while signed out.
function useContributors(
  docId: string,
  me: string | null,
): { contributors: Contributor[]; at: number } | null {
  const app = useApp();
  const { workspaceId } = useWorkspace();
  // Every save moves `updatedAt`, so the list follows the page.
  const updatedAt = useQuerySelect(
    "doc.get",
    { id: docId },
    (s) => s.data[0]?.document.updatedAt ?? null,
  );
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const shown = useRef<string | null>(null);
  useEffect(() => {
    let live = true;
    const load = () =>
      readActivity(app, { workspaceId, targetId: docId })
        .then((items) => live && setLoaded({ docId, items, at: Date.now() }))
        // Not kept here (an older core): the button stays away.
        .catch(() => live && setLoaded({ docId, items: [], at: Date.now() }));
    // A page just opened at once; the same page after an edit, once the edits pause.
    const timer = setTimeout(load, shown.current === docId ? RELOAD_DELAY_MS : 0);
    shown.current = docId;
    return () => {
      live = false;
      clearTimeout(timer);
    };
  }, [app, workspaceId, docId, updatedAt, me]);
  const contributors = useMemo(
    () => (loaded?.docId === docId ? contributorsOf(loaded.items) : null),
    [loaded, docId],
  );
  return contributors && loaded ? { contributors, at: loaded.at } : null;
}

function usePeople(): People {
  const { workspaceId } = useWorkspace();
  const { data } = useQuery("workspace.members", { workspaceId });
  return useMemo(
    () =>
      new Map(
        data.map((m) => [m.userId, { name: m.userName, email: m.userEmail, image: m.userImage }]),
      ),
    [data],
  );
}

function useMe(): string | null {
  const app = useApp();
  const { state } = useAccount();
  if (app.workspace.mode !== "synced") return LOCAL_USER_ID;
  return state.status === "signed-out" ? null : state.user.id;
}

// Whether the newest contributor, an agent, is still writing: true until two minutes after its
// last change, then the component draws again without the pen.
function useWriting(contributors: readonly Contributor[], loadedAt: number): boolean {
  const until = writingUntil(contributors);
  const [over, setOver] = useState<number | null>(null);
  useEffect(() => {
    if (until === null) return;
    const timer = setTimeout(() => setOver(until), Math.max(0, until - Date.now()));
    return () => clearTimeout(timer);
  }, [until]);
  return until !== null && until > loadedAt && over !== until;
}

export function WhoWorkedButton({ docId }: DocumentSlotProps) {
  const app = useApp();
  const me = useMe();
  const loaded = useContributors(docId, me);
  const people = usePeople();
  const writing = useWriting(loaded?.contributors ?? [], loaded?.at ?? 0);
  if (!loaded || !othersWorkedOn(loaded.contributors, me)) return null;
  const versions = app.services?.vault ? () => app.panels.show("versions") : null;
  return (
    <WhoWorked
      contributors={loaded.contributors}
      people={people}
      me={me}
      writing={writing}
      onVersions={versions}
      onActivity={() => app.overlays.open("settings", { page: "activity" })}
    />
  );
}

type ViewProps = {
  contributors: readonly Contributor[];
  people: People;
  me: string | null;
  // The newest contributor, an agent, changed the page moments ago.
  writing: boolean;
  onVersions: (() => void) | null;
  onActivity: (() => void) | null;
};

export function WhoWorked({
  contributors,
  people,
  me,
  writing,
  onVersions,
  onActivity,
}: ViewProps) {
  const who = contributors.map((c) => whoIs(c.actor, people, me));
  const faces = who.slice(0, FACES);
  const more = who.length - faces.length;
  return (
    <DialogTrigger>
      <Button
        size="xs"
        variant="ghost"
        aria-label={workedOnLabel(who.map((w) => w.name))}
        tooltip="Who worked on this"
        className="gap-1.5 pr-1 pl-0.5 text-gray-500"
        data-testid="who-worked"
      >
        <span className="flex items-center -space-x-1">
          {faces.map((w, i) => (
            <Face key={contributors[i]!.key} who={w} size={18} writing={writing && i === 0} pile />
          ))}
          {more > 0 && (
            <span className="relative flex size-[18px] items-center justify-center rounded-full bg-gray-100 text-[10px] font-medium text-gray-600 ring-2 ring-surface">
              +{more}
            </span>
          )}
        </span>
        <HistoryAnticlockwiseRegular />
      </Button>
      <Popover placement="bottom end" className="w-80">
        <AriaDialog aria-label="Who worked on this" className="outline-none">
          {({ close }) => (
            <WhoPanel
              contributors={contributors}
              who={who}
              writing={writing}
              onVersions={after(close, onVersions)}
              onActivity={after(close, onActivity)}
            />
          )}
        </AriaDialog>
      </Popover>
    </DialogTrigger>
  );
}

// Closes the popover, then does what the button says.
const after = (close: () => void, action: (() => void) | null) =>
  action &&
  (() => {
    close();
    action();
  });

export function WhoPanel({
  contributors,
  who,
  writing,
  onVersions,
  onActivity,
}: {
  contributors: readonly Contributor[];
  who: readonly Who[];
  writing: boolean;
  onVersions: (() => void) | null;
  onActivity: (() => void) | null;
}) {
  return (
    <div className="flex flex-col text-sm" data-testid="who-worked-panel">
      <h2 className="px-3 pt-3 pb-1 text-xs font-medium text-gray-500">Who worked on this</h2>
      <ul className="flex max-h-80 flex-col overflow-y-auto px-1.5 pb-1.5">
        {contributors.map((c, i) => {
          const w = who[i]!;
          const now = writing && i === 0;
          return (
            <li key={c.key} className="flex items-center gap-2.5 rounded-md px-1.5 py-1.5">
              <Face who={w} size={28} writing={now} />
              <div className="flex min-w-0 grow flex-col">
                <span className="truncate font-medium text-gray-900">
                  {w.name}
                  {w.forName && <span className="font-normal text-gray-500"> for {w.forName}</span>}
                </span>
                <span className="truncate text-xs text-gray-500">
                  {now ? "Writing now" : workOf(c.types)}
                </span>
              </div>
              <time dateTime={c.lastAt} className="shrink-0 text-xs text-gray-400">
                {formatTimelineTime(c.lastAt, "relative")}
              </time>
            </li>
          );
        })}
      </ul>
      {(onVersions || onActivity) && (
        <div className="flex gap-1 border-t border-gray-950/6 p-1.5">
          {onVersions && (
            <Button variant="ghost" size="sm" onPress={onVersions}>
              <HistoryAnticlockwiseRegular data-icon="inline-start" />
              Version history
            </Button>
          )}
          {onActivity && (
            <Button variant="ghost" size="sm" className="text-gray-500" onPress={onActivity}>
              All activity
            </Button>
          )}
        </div>
      )}
    </div>
  );
}

// `pile`: in the button, where agents go without the person they worked for (the badges would
// crowd the faces) and a ring of the page lifts each face off the one under it.
function Face({
  who,
  size,
  writing,
  pile,
}: {
  who: Who;
  size: number;
  writing: boolean;
  pile?: boolean;
}) {
  const { avatar } = who;
  let face: ReactNode;
  if (avatar.kind === "person")
    face = <Avatar seed={avatar.seed} image={avatar.image} size={size} />;
  else if (avatar.kind === "agent") {
    face = <BotAvatar seed={avatar.seed} behalf={pile ? null : avatar.behalf} size={size} />;
  } else face = <LydieAvatar size={size} />;
  return (
    <span
      className={`relative flex shrink-0 rounded-full ${
        pile ? "bg-surface ring-2 ring-surface outline-1 -outline-offset-1 outline-gray-950/8" : ""
      }`}
      data-writing={writing || undefined}
    >
      {face}
      {writing && <Pen size={size} />}
    </span>
  );
}

// An agent writing right now: a pen circling its face, as presence does for people.
function Pen({ size }: { size: number }) {
  const outer = size + 6;
  return (
    <svg
      viewBox="0 0 100 100"
      aria-hidden
      width={outer}
      height={outer}
      // Inline, so the button's rule for its icons leaves it the size of the face.
      style={{ width: outer, height: outer }}
      className="pointer-events-none absolute -top-[3px] -left-[3px] animate-[spin_2.4s_linear_infinite] text-green-600 motion-reduce:animate-none"
    >
      <circle
        cx={50}
        cy={50}
        r={47}
        fill="none"
        stroke="currentColor"
        strokeWidth={5}
        strokeLinecap="round"
        strokeDasharray="30 18"
      />
    </svg>
  );
}
