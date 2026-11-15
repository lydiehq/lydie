import { useApp } from "@lydie/plugin-api";
import {
  BacklinksIllustration,
  BoardIllustration,
  BoardViewIllustration,
  Button,
  CalendarViewIllustration,
  EmptyState,
  FirstDocumentIllustration,
  GalleryViewIllustration,
  ListViewIllustration,
  MarkIllustration,
  NoAccessIllustration,
  NoDocumentIllustration,
  NoHeadingsIllustration,
  NoResultsIllustration,
  NotFoundIllustration,
  SearchIllustration,
  SyncIllustration,
  TableViewIllustration,
  TemplatesIllustration,
  TrashIllustration,
  VersionsIllustration,
} from "@lydie/plugin-api/ui";
import type { IllustrationProps } from "@lydie/plugin-api/ui";
import { useState } from "react";
import type { ReactNode } from "react";

type Illustration = {
  id: string;
  name: string;
  /** Where it shows: the plugin and the state. */
  where: string;
  title: string;
  description?: string;
  /** Side panels are narrow; their drawings sit smaller. */
  panel?: boolean;
  /** Drawn beside a label in a menu, at its smallest. */
  menu?: boolean;
  component: (props: IllustrationProps) => ReactNode;
};

// The drawings live in @lydie/ui; the text is what each state says in the app.
const ILLUSTRATIONS: Illustration[] = [
  {
    id: "mark",
    name: "Mark",
    where: "not used yet",
    title: "Nothing here yet",
    description: "Your notes will show up here.",
    component: MarkIllustration,
  },
  {
    id: "first-document",
    name: "First document",
    where: "not used yet",
    title: "No documents yet",
    description: "Create a document to get started.",
    component: FirstDocumentIllustration,
  },
  {
    id: "trash",
    name: "Trash",
    where: "trash · empty",
    title: "The trash is empty",
    description: "Deleted documents stay here until you delete them forever.",
    component: TrashIllustration,
  },
  {
    id: "versions",
    name: "Versions",
    where: "versions · none yet",
    title: "No versions yet",
    description: "A version is kept when this document changes.",
    panel: true,
    component: VersionsIllustration,
  },
  {
    id: "templates",
    name: "Templates",
    where: "not used yet",
    title: "No templates",
    component: TemplatesIllustration,
  },
  {
    id: "search",
    name: "Search",
    where: "search · nothing typed",
    title: "Search titles and text",
    description: "Results update as you type.",
    component: SearchIllustration,
  },
  {
    id: "no-results",
    name: "No results",
    where: "search · no matches",
    title: "No results",
    description: "Nothing matches “quarterly plan”.",
    component: NoResultsIllustration,
  },
  {
    id: "no-document",
    name: "No document open",
    where: "side panels · no document",
    title: "No document open",
    description: "Links to the open document show here.",
    panel: true,
    component: NoDocumentIllustration,
  },
  {
    id: "backlinks",
    name: "Backlinks",
    where: "not used yet",
    title: "No documents link here",
    panel: true,
    component: BacklinksIllustration,
  },
  {
    id: "no-headings",
    name: "No headings",
    where: "outline · no headings",
    title: "No headings",
    description: "Headings in the open document show here.",
    panel: true,
    component: NoHeadingsIllustration,
  },
  {
    id: "sync",
    name: "Not signed in",
    where: "account · signed out; team · local workspace",
    title: "Not signed in",
    description:
      "Sign in to Lydie Cloud to keep your notes on all your devices and write with your team.",
    component: SyncIllustration,
  },
  {
    id: "board",
    name: "Board",
    where: "databases · board without grouping",
    title: "Choose how to group the board",
    description: "Columns come from a select, status, person, relation or other property.",
    component: BoardIllustration,
  },
  {
    id: "no-access",
    name: "No access",
    where: "editor · access removed",
    title: "You no longer have access to this page",
    description: "Someone removed your access, or the page was deleted.",
    component: NoAccessIllustration,
  },
  {
    id: "not-found",
    name: "Not found",
    where: "editor · missing document",
    title: "This document does not exist",
    component: NotFoundIllustration,
  },
  {
    id: "view-table",
    name: "Table view",
    where: "databases · new view",
    title: "Table",
    description: "Pages and properties in a grid",
    menu: true,
    component: TableViewIllustration,
  },
  {
    id: "view-board",
    name: "Board view",
    where: "databases · new view",
    title: "Board",
    description: "Cards in columns",
    menu: true,
    component: BoardViewIllustration,
  },
  {
    id: "view-list",
    name: "List view",
    where: "databases · new view",
    title: "List",
    description: "One page per line",
    menu: true,
    component: ListViewIllustration,
  },
  {
    id: "view-calendar",
    name: "Calendar view",
    where: "databases · new view",
    title: "Calendar",
    description: "Pages on their dates",
    menu: true,
    component: CalendarViewIllustration,
  },
  {
    id: "view-gallery",
    name: "Gallery view",
    where: "databases · new view",
    title: "Gallery",
    description: "Cards with covers",
    menu: true,
    component: GalleryViewIllustration,
  },
];

const STORAGE_KEY = "playground.emptyStates";

const SIZES = [
  { id: "auto", name: "Auto" },
  { id: "small", name: "Small" },
  { id: "large", name: "Large" },
] as const;

type Size = (typeof SIZES)[number]["id"];
type Settings = { size: Size; dark: boolean; context: boolean };

const DEFAULTS: Settings = { size: "auto", dark: false, context: true };

// Auto is what the app uses: md on a page, sm in a side panel, xs in a menu.
function sizeProps(size: Size, illustration: Illustration): IllustrationProps {
  if (size === "small") return { className: "h-20" };
  if (size === "large") return { className: "h-44" };
  return { size: illustration.menu ? "xs" : illustration.panel ? "sm" : "md" };
}

export function EmptyStatesPlayground() {
  const app = useApp();
  const [settings, setSettings] = useState<Settings>(() => ({
    ...DEFAULTS,
    ...app.storage.get<Partial<Settings>>(STORAGE_KEY),
  }));
  // Remounting every drawing plays its entrance again.
  const [round, setRound] = useState(0);
  const update = (patch: Partial<Settings>) => {
    const next = { ...settings, ...patch };
    setSettings(next);
    app.storage.set(STORAGE_KEY, next);
  };

  return (
    <div className="min-h-0 grow overflow-y-auto" data-testid="empty-states-playground">
      <div className="mx-auto flex w-full max-w-[1120px] flex-col gap-8 px-8 pt-10 pb-16">
        <header className="flex flex-col gap-1">
          <h1 className="text-lg font-medium text-gray-900">Empty states</h1>
          <p className="text-sm text-gray-500">
            Isometric line drawings for the app's empty states: ink on paper, grey thickness, and
            dashed outlines for what is not there yet. Click a drawing to play it again.
          </p>
        </header>

        <section aria-label="Settings" className="flex flex-wrap items-center gap-x-8 gap-y-3">
          <fieldset className="flex items-center gap-1" aria-label="Size">
            {SIZES.map((size) => (
              <Button
                key={size.id}
                size="xs"
                variant="ghost"
                data-current={settings.size === size.id || undefined}
                onPress={() => update({ size: size.id })}
              >
                {size.name}
              </Button>
            ))}
          </fieldset>
          <fieldset className="flex items-center gap-1" aria-label="Theme">
            {([false, true] as const).map((dark) => (
              <Button
                key={String(dark)}
                size="xs"
                variant="ghost"
                data-current={settings.dark === dark || undefined}
                onPress={() => update({ dark })}
              >
                {dark ? "Dark" : "Light"}
              </Button>
            ))}
          </fieldset>
          <fieldset className="flex items-center gap-1" aria-label="Show">
            {([true, false] as const).map((context) => (
              <Button
                key={String(context)}
                size="xs"
                variant="ghost"
                data-current={settings.context === context || undefined}
                onPress={() => update({ context })}
              >
                {context ? "With text" : "Drawings only"}
              </Button>
            ))}
          </fieldset>
          <Button size="xs" variant="secondary" onPress={() => setRound(round + 1)}>
            Replay all
          </Button>
        </section>

        <div
          className={
            settings.dark ? "dark -mx-4 rounded-2xl bg-surface px-4 py-4 text-gray-900" : undefined
          }
        >
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
            {ILLUSTRATIONS.map((illustration) => (
              <Card
                key={`${illustration.id}-${round}`}
                illustration={illustration}
                sizing={sizeProps(settings.size, illustration)}
                context={settings.context}
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function Card({
  illustration,
  sizing,
  context,
}: {
  illustration: Illustration;
  sizing: IllustrationProps;
  context: boolean;
}) {
  const [replays, setReplays] = useState(0);
  const Drawing = illustration.component;
  const drawing = (
    <button
      type="button"
      aria-label={`Play ${illustration.name} again`}
      onClick={() => setReplays(replays + 1)}
      className="cursor-pointer rounded-lg outline-offset-4 focus-visible:outline-2 focus-visible:outline-gray-400"
    >
      <Drawing key={replays} {...sizing} />
    </button>
  );
  return (
    <article className="flex flex-col overflow-hidden rounded-xl border border-gray-200 bg-surface">
      <header className="flex items-baseline justify-between gap-3 border-b border-gray-100 px-4 py-2.5">
        <h2 className="text-sm font-medium text-gray-800">{illustration.name}</h2>
        <span className="truncate text-xs text-gray-400">{illustration.where}</span>
      </header>
      <div className="flex min-h-72 grow items-center justify-center">
        {context ? (
          <div className={illustration.panel ? "w-[280px]" : "w-full"}>
            <EmptyState
              illustration={drawing}
              title={illustration.title}
              description={illustration.description}
            />
          </div>
        ) : (
          <div className="p-8">{drawing}</div>
        )}
      </div>
    </article>
  );
}
