import { docPath, PageLink, useAccount, useApp, useQuery, useWorkspace } from "@lydie/plugin-api";
import type { Activity, Actor } from "@lydie/plugin-api";
import {
  AriaDialog,
  Avatar,
  BotAvatar,
  Button,
  CheckRegular,
  CloseRegular,
  DialogTrigger,
  DownRegular,
  EmptyState,
  ErrorState,
  Filter2Regular,
  focusRingClass,
  formatTimelineTime,
  HistoryAnticlockwiseRegular,
  LydieAvatar,
  NoResultsIllustration,
  Popover,
  RightRegular,
  SearchField,
  Skeleton,
  Timeline,
  TimelineEvent,
  VersionsIllustration,
} from "@lydie/plugin-api/ui";
import type { TimelineTimeFormat } from "@lydie/plugin-api/ui";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";

import { describeActor, LOCAL_USER_ID } from "../activity/actors.ts";
import type { ActorInfo, Person } from "../activity/actors.ts";
import { describeActivity, formatRange, plural } from "../activity/describe.ts";
import type { SentencePart } from "../activity/describe.ts";
import {
  addSeen,
  EVENT_GROUPS,
  eventGroups,
  hasFilters,
  NO_FILTERS,
  personOptions,
  toggle,
  toQuery,
} from "../activity/filters.ts";
import type { ActivityFilters, ActivityQuery, PersonOption } from "../activity/filters.ts";
import { groupByDate } from "../activity/groups.ts";
import { collapseSessions, entryTime, undoableSessions } from "../activity/sessions.ts";
import type { SessionEntry } from "../activity/sessions.ts";
import { activitySource, isUnavailable } from "../activity/source.ts";
import type { ActivitySource, SkipReason } from "../activity/source.ts";

const PAGE_SIZE = 50;
const SEARCH_DELAY_MS = 200;

type ListState = {
  key: string;
  items: Activity[];
  nextCursor: string | null;
  status: "loading" | "ready" | "error" | "unavailable";
  error: unknown;
  loadingMore: boolean;
};

// Pages of `activity.list` for one query; a new query starts over, a stale answer is dropped.
function useActivityList(
  source: ActivitySource,
  query: ActivityQuery,
  handlers: { onItems: (items: Activity[]) => void; onMoreFailed: (error: unknown) => void },
) {
  const key = JSON.stringify(query);
  const [state, setState] = useState<ListState>(() => initial(key));
  const [reloads, setReloads] = useState(0);
  const latest = useRef(key);
  useLayoutEffect(() => {
    latest.current = key;
  });
  const current = state.key === key ? state : initial(key);

  useEffect(() => {
    let stale = false;
    setState((s) => (s.key === key && s.status === "loading" ? s : initial(key)));
    source.list(query).then(
      (page) => {
        if (stale) return;
        setState({ ...initial(key), ...page, status: "ready" });
        handlers.onItems(page.items);
      },
      (error: unknown) => {
        if (stale) return;
        setState({
          ...initial(key),
          status: isUnavailable(error) ? "unavailable" : "error",
          error,
        });
      },
    );
    return () => {
      stale = true;
    };
    // `key` stands for `query`.
    // oxlint-disable-next-line react-hooks/exhaustive-deps
  }, [source, key, reloads]);

  const loadMore = () => {
    const cursor = current.nextCursor;
    if (!cursor || current.loadingMore) return;
    setState((s) => ({ ...s, loadingMore: true }));
    source.list({ ...query, cursor }).then(
      (page) => {
        if (latest.current !== key) return;
        handlers.onItems(page.items);
        setState((s) => ({
          ...s,
          items: [...s.items, ...page.items.filter((i) => !s.items.some((o) => o.id === i.id))],
          nextCursor: page.nextCursor,
          loadingMore: false,
        }));
      },
      (error: unknown) => {
        if (latest.current !== key) return;
        setState((s) => ({ ...s, loadingMore: false }));
        handlers.onMoreFailed(error);
      },
    );
  };

  return { ...current, loadMore, reload: () => setReloads((n) => n + 1) };
}

function initial(key: string): ListState {
  return { key, items: [], nextCursor: null, status: "loading", error: null, loadingMore: false };
}

// Sessions this person can undo: their own agents' sessions with changes left to undo, and how
// many.
function useUndoableSessions(source: ActivitySource, workspaceId: string, me: string | null) {
  const [left, setLeft] = useState<ReadonlyMap<string, number>>(new Map());
  const [reloads, setReloads] = useState(0);
  useEffect(() => {
    if (!me) return;
    let stale = false;
    source.sessions(workspaceId).then(
      (sessions) => {
        if (!stale) setLeft(undoableSessions(sessions, me));
      },
      // Without the journal (an older core) there is nothing to undo here.
      () => {
        if (!stale) setLeft(new Map());
      },
    );
    return () => {
      stale = true;
    };
  }, [source, workspaceId, me, reloads]);
  return { left, reload: () => setReloads((n) => n + 1) };
}

export function ActivityPage() {
  const app = useApp();
  const workspace = useWorkspace();
  const workspaceId = workspace.workspaceId;
  const source = useMemo(() => activitySource(app), [app]);
  const local = !source.hosted;
  const { state: account } = useAccount();
  const me = local ? LOCAL_USER_ID : account.status === "signed-out" ? null : account.user.id;

  const { data: memberRows } = useQuery("workspace.members", { workspaceId });
  const members = useMemo(
    () =>
      new Map<string, Person>(
        memberRows.map((m) => [
          m.userId,
          { name: m.userName, email: m.userEmail, image: m.userImage },
        ]),
      ),
    [memberRows],
  );

  const [filters, setFilters] = useState<ActivityFilters>(NO_FILTERS);
  const [search, setSearch] = useState("");
  useEffect(() => {
    const timer = setTimeout(() => setFilters((f) => ({ ...f, search })), SEARCH_DELAY_MS);
    return () => clearTimeout(timer);
  }, [search]);

  // Everyone seen in any load, so filtering by someone keeps their option (and an agent's
  // sessions) in the list.
  const [seen, setSeen] = useState<readonly Actor[]>([]);
  const options = useMemo(() => personOptions(members, local, seen), [members, local, seen]);
  // One object per distinct query, so the list reloads only when the query changes.
  const queryKey = JSON.stringify(toQuery(workspaceId, filters, options, PAGE_SIZE));
  const query = useMemo(() => JSON.parse(queryKey) as ActivityQuery, [queryKey]);
  const list = useActivityList(source, query, {
    onItems: (items) => setSeen((s) => addSeen(s, items)),
    onMoreFailed: (error) =>
      app.notify({
        title: "Could not load more activity",
        ...(error instanceof Error ? { description: error.message } : {}),
        kind: "error",
      }),
  });
  const sessions = useUndoableSessions(source, workspaceId, me);

  const entries = useMemo(() => collapseSessions(list.items), [list.items]);
  const groups = groupByDate(entries, entryTime);
  const actorOf = (activity: Pick<Activity, "actor">) =>
    describeActor(activity.actor, members, local);

  const refresh = () => {
    list.reload();
    sessions.reload();
  };

  const filtered = hasFilters(filters);

  if (list.status === "unavailable") {
    return (
      <EmptyState
        illustration={<VersionsIllustration />}
        title="Activity is not available"
        description="This workspace's server does not keep an activity log yet."
      />
    );
  }

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-center gap-2">
        <SearchField
          size="sm"
          aria-label="Search activity"
          placeholder="Search page titles"
          value={search}
          onChange={setSearch}
          className="mr-1 max-w-xs flex-1 basis-56"
        />
        <FilterPopover
          options={options}
          hosted={!local}
          filters={filters}
          onChange={(next) => setFilters((f) => ({ ...f, ...next }))}
        />
        {filters.people.map((key) => {
          const option = options.find((o) => o.key === key);
          return (
            <FilterChip
              key={key}
              prefix="Person"
              label={option?.label ?? "Someone"}
              onRemove={() => setFilters((f) => ({ ...f, people: toggle(f.people, key) }))}
            />
          );
        })}
        {filters.events.map((id) => (
          <FilterChip
            key={id}
            prefix="Event"
            label={EVENT_GROUPS.find((g) => g.id === id)?.label ?? id}
            onRemove={() => setFilters((f) => ({ ...f, events: toggle(f.events, id) }))}
          />
        ))}
      </div>

      {list.status === "loading" ? (
        <TimelineSkeleton />
      ) : list.status === "error" ? (
        <ErrorState
          title="Activity could not be loaded"
          error={list.error}
          action={
            <Button size="sm" variant="secondary" onPress={list.reload}>
              Try again
            </Button>
          }
        />
      ) : entries.length === 0 ? (
        filtered ? (
          <EmptyState
            illustration={<NoResultsIllustration />}
            title="Nothing matches these filters"
            action={
              <Button
                size="sm"
                variant="secondary"
                onPress={() => {
                  setSearch("");
                  setFilters(NO_FILTERS);
                }}
              >
                Clear filters
              </Button>
            }
          />
        ) : (
          <EmptyState
            illustration={<VersionsIllustration />}
            title="No activity yet"
            description="Pages, files and databases that are created, edited or deleted show up here."
          />
        )
      ) : (
        <div className="flex flex-col gap-8" data-testid="activity-list">
          {groups.map((group) => (
            <section key={group.key} aria-label={group.label}>
              <h2 className="mb-3 text-xs font-medium text-gray-500">{group.label}</h2>
              <Timeline>
                {group.entries.map((entry) =>
                  entry.kind === "item" ? (
                    <ActivityRow
                      key={entry.item.id}
                      activity={entry.item}
                      actor={actorOf(entry.item)}
                      timeFormat={group.timeFormat}
                    />
                  ) : (
                    <SessionRow
                      key={`${entry.sessionId}:${entry.items[0]!.id}`}
                      session={entry}
                      actor={actorOf(entry)}
                      timeFormat={group.timeFormat}
                      undoable={sessions.left.get(entry.sessionId) ?? 0}
                      source={source}
                      onUndone={refresh}
                    />
                  ),
                )}
              </Timeline>
            </section>
          ))}
          {list.nextCursor && (
            <div className="flex justify-center">
              <Button
                variant="secondary"
                size="sm"
                isPending={list.loadingMore}
                onPress={list.loadMore}
              >
                Load more
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// A person on paper, an agent on a screen (with whom it worked for), Lydie in its green.
function ActorIcon({ actor }: { actor: ActorInfo }) {
  if (actor.kind === "user") {
    return <Avatar seed={actor.userId ?? actor.key} image={actor.image} size={20} />;
  }
  if (actor.kind === "agent") {
    return (
      <BotAvatar
        seed={actor.key}
        behalf={actor.behalf && { seed: actor.behalf.userId, image: actor.behalf.image }}
        size={20}
      />
    );
  }
  return <LydieAvatar size={20} />;
}

function ActorName({ actor }: { actor: ActorInfo }) {
  return (
    <>
      {actor.name}
      {actor.onBehalfOf && (
        <span className="font-normal text-gray-500"> for {actor.onBehalfOf}</span>
      )}
    </>
  );
}

function ActivityRow({
  activity,
  actor,
  timeFormat,
}: {
  activity: Activity;
  actor: ActorInfo;
  timeFormat: TimelineTimeFormat;
}) {
  return (
    <TimelineEvent
      data-testid="activity-item"
      icon={<ActorIcon actor={actor} />}
      actor={<ActorName actor={actor} />}
      action={<SentenceView activity={activity} />}
      timestamp={activity.lastAt}
      timeFormat={timeFormat}
    />
  );
}

// `capitalized`: the sentence stands alone (a session's changes, without the actor's name).
function SentenceView({ activity, capitalized }: { activity: Activity; capitalized?: boolean }) {
  const sentence = describeActivity(activity);
  const [first, ...rest] = sentence.parts;
  const parts =
    capitalized && typeof first === "string"
      ? [first.charAt(0).toLocaleUpperCase() + first.slice(1), ...rest]
      : sentence.parts;
  return (
    <>
      {parts.map((part, i) => (
        <Part key={i} part={part} />
      ))}
      {sentence.range && (
        <span className="text-gray-400">
          {" "}
          · {formatRange(sentence.range.from, sentence.range.to)}
        </span>
      )}
    </>
  );
}

function Part({ part }: { part: SentencePart }) {
  if (typeof part === "string") return part;
  if (part.kind === "name") return <span className="text-gray-900">{part.text}</span>;
  return part.link ? (
    <TargetLink id={part.id} title={part.title} current={part.current} />
  ) : (
    <span className="text-gray-900">{part.title}</span>
  );
}

// A page or database: a link while it exists (also in the trash), else its name.
function TargetLink({ id, title, current }: { id: string; title: string; current: boolean }) {
  const app = useApp();
  const { data } = useQuery("doc.get", { id });
  const doc = data[0];
  if (!doc) return <span className="text-gray-900">{title}</span>;
  const shown = current ? doc.document.title.trim() || title : title;
  return (
    <PageLink
      path={docPath(id)}
      title={shown}
      className={`rounded-xs text-left text-gray-900 underline decoration-gray-950/20 underline-offset-2 hover:decoration-gray-950/50 ${focusRingClass}`}
      onOpen={(mode) => {
        app.overlays.close("settings");
        app.openDoc(id, { mode });
      }}
    >
      {shown}
    </PageLink>
  );
}

const SKIP_REASONS: Record<SkipReason, (n: number) => string> = {
  conflict: (n) => `${n} changed later by someone else`,
  not_undoable: (n) => `${n} cannot be undone`,
  failed: (n) => `${n} failed`,
};

function SessionRow({
  session,
  actor,
  timeFormat,
  undoable,
  source,
  onUndone,
}: {
  session: SessionEntry;
  actor: ActorInfo;
  timeFormat: TimelineTimeFormat;
  // What Undo acts on: the session's changes not undone yet (0: no Undo).
  undoable: number;
  source: ActivitySource;
  onUndone: () => void;
}) {
  const app = useApp();
  const [open, setOpen] = useState(false);
  const [undoing, setUndoing] = useState(false);
  const changes = plural(session.changes, "change");
  const summary =
    session.pages > 0 ? `made ${changes} in ${plural(session.pages, "page")}` : `made ${changes}`;
  const range =
    Date.parse(session.lastAt) - Date.parse(session.firstAt) >= 60_000
      ? formatRange(session.firstAt, session.lastAt)
      : null;

  const undo = async () => {
    const confirmed = await app.confirm({
      // Counted as history.undoSession counts, like the result; the summary counts activity.
      message: `Undo ${plural(undoable, "change")} by ${actor.name}?`,
      detail:
        "Everything left in this session is reverted, also changes not shown here. Changes that someone edited since are kept.",
      confirmLabel: "Undo changes",
      destructive: true,
    });
    if (!confirmed) return;
    setUndoing(true);
    try {
      const result = await source.undoSession(session.sessionId);
      const undone = result.undoneIds.length;
      const counts = new Map<SkipReason, number>();
      for (const s of result.skipped) counts.set(s.reason, (counts.get(s.reason) ?? 0) + 1);
      const skipped = [...counts].map(([reason, n]) => SKIP_REASONS[reason](n)).join(", ");
      app.notify({
        title: undone > 0 ? `Undid ${plural(undone, "change")}` : "Nothing was undone",
        ...(skipped
          ? { description: `Skipped ${plural(result.skipped.length, "change")}: ${skipped}.` }
          : {}),
        kind: undone > 0 && !skipped ? "success" : "warning",
      });
      onUndone();
    } catch (error) {
      app.notify({
        title: "Could not undo the session",
        ...(error instanceof Error ? { description: error.message } : {}),
        kind: "error",
      });
    } finally {
      setUndoing(false);
    }
  };

  return (
    <TimelineEvent
      data-testid="activity-session"
      icon={<ActorIcon actor={actor} />}
      actor={<ActorName actor={actor} />}
      action={
        <>
          {summary}
          {range && <span className="text-gray-400"> · {range}</span>}
        </>
      }
      timestamp={session.lastAt}
      timeFormat={timeFormat}
      details={
        <div className="flex flex-col gap-2">
          <div className="-ml-2 flex items-center gap-1">
            <Button
              variant="ghost"
              size="xs"
              aria-expanded={open}
              onPress={() => setOpen((o) => !o)}
            >
              {open ? (
                <DownRegular data-icon="inline-start" />
              ) : (
                <RightRegular data-icon="inline-start" />
              )}
              {/* No count: rows are coalesced, so it would differ from the summary's. */}
              {open ? "Hide changes" : "Show changes"}
            </Button>
            {undoable > 0 && (
              <Button variant="ghost" size="xs" isPending={undoing} onPress={() => void undo()}>
                <HistoryAnticlockwiseRegular data-icon="inline-start" />
                Undo
              </Button>
            )}
          </div>
          {open && (
            <ul className="flex flex-col gap-1.5 border-l border-gray-950/10 pl-3">
              {session.items.map((item) => (
                <li
                  key={item.id}
                  className="flex items-start gap-4 text-sm leading-5 text-gray-500"
                >
                  <span className="min-w-0 flex-1 break-words">
                    <SentenceView activity={item} capitalized />
                  </span>
                  <span className="shrink-0 text-xs leading-5 text-gray-400">
                    {formatTimelineTime(item.lastAt, "time")}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      }
    />
  );
}

function FilterPopover({
  options,
  hosted,
  filters,
  onChange,
}: {
  options: readonly PersonOption[];
  hosted: boolean;
  filters: ActivityFilters;
  onChange: (next: Partial<ActivityFilters>) => void;
}) {
  return (
    <DialogTrigger>
      <Button variant="secondary" size="sm" rounded>
        <Filter2Regular data-icon="inline-start" />
        Add filter
      </Button>
      <Popover placement="bottom start" className="w-72">
        <AriaDialog aria-label="Filters" className="max-h-96 overflow-y-auto p-1.5 outline-none">
          <FilterSection title="People">
            {options.length === 0 && (
              <p className="px-2 py-1.5 text-sm text-gray-500">Nobody yet</p>
            )}
            {options.map((option) => (
              <FilterOption
                key={option.key}
                label={option.label}
                icon={
                  <ActorIcon
                    actor={{
                      kind: option.kind,
                      key: option.key,
                      name: option.label,
                      onBehalfOf: null,
                      userId: option.userId,
                      image: option.image,
                    }}
                  />
                }
                selected={filters.people.includes(option.key)}
                onToggle={() => onChange({ people: toggle(filters.people, option.key) })}
              />
            ))}
          </FilterSection>
          <FilterSection title="Events">
            {eventGroups(hosted).map((group) => (
              <FilterOption
                key={group.id}
                label={group.label}
                selected={filters.events.includes(group.id)}
                onToggle={() => onChange({ events: toggle(filters.events, group.id) })}
              />
            ))}
          </FilterSection>
        </AriaDialog>
      </Popover>
    </DialogTrigger>
  );
}

function FilterSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <fieldset className="mb-2 min-w-0 last:mb-0">
      <legend className="px-2 py-1 text-xs font-medium text-gray-500">{title}</legend>
      <div className="flex flex-col gap-px">{children}</div>
    </fieldset>
  );
}

function FilterOption({
  label,
  icon,
  selected,
  onToggle,
}: {
  label: string;
  icon?: ReactNode;
  selected: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={onToggle}
      className={`flex h-8 w-full items-center gap-2 rounded-md px-2 text-left text-sm text-gray-700 hover:bg-gray-950/5 ${focusRingClass}`}
    >
      {icon}
      <span className="min-w-0 flex-1 truncate">{label}</span>
      <CheckRegular className={selected ? "size-4 text-gray-900" : "size-4 opacity-0"} />
    </button>
  );
}

function FilterChip({
  prefix,
  label,
  onRemove,
}: {
  prefix: string;
  label: string;
  onRemove: () => void;
}) {
  return (
    <Button
      variant="secondary"
      size="sm"
      rounded
      aria-label={`Remove filter ${prefix}: ${label}`}
      tooltip={false}
      className="max-w-64"
      onPress={onRemove}
    >
      <span className="truncate">
        <span className="text-gray-500">{prefix}</span> {label}
      </span>
      <CloseRegular data-icon="inline-end" className="size-3.5" />
    </Button>
  );
}

function TimelineSkeleton() {
  return (
    <output aria-busy aria-label="Loading activity" className="flex flex-col gap-6">
      <Skeleton className="h-3 w-16" />
      {[0, 1, 2, 3, 4].map((i) => (
        <div key={i} className="flex items-center gap-3">
          <Skeleton className="size-5 rounded-full" />
          <Skeleton className={`h-3 ${["w-64", "w-48", "w-72", "w-56", "w-40"][i]}`} />
          <Skeleton className="ml-auto h-3 w-12" />
        </div>
      ))}
    </output>
  );
}
