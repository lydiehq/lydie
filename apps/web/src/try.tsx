// The try-out on the marketing site: the whole app mounted into the site's home page, on a
// database that lives in memory only. Nothing is kept and nothing is written to the site's storage,
// and no Web Lock is taken, so it never competes with the app on its own host (single-tab
// browsers). Where notes are kept is the app's host (`appUrl`).
//
// The page paints a static copy of the app with its own content (`about`) in the first tab, and
// calls `mountTry` when the visitor first interacts. The app starts hidden, takes the page's
// element into its "About Lydie" tab once it has painted, and resolves; the page then shows it in
// the same frame.
import { createMemoryStorage, LydieApp, startApp } from "@lydie/app";
import type { Host } from "@lydie/app";
import {
  createEventHub,
  createLocalBackend,
  handledOperations,
  markdownExtract,
} from "@lydie/app/backend";
import type { Operations } from "@lydie/contract";
import { definePlugin, useActiveTab, useApp } from "@lydie/plugin-api";
import type { TabPath } from "@lydie/plugin-api";
import { sidebarItemStyles } from "@lydie/plugin-api/ui";
import { createGettingStarted, createRuntime, uuid } from "@lydie/runtime";
import { createMemoryPorts } from "@lydie/runtime/memory";
import { openWebStore, WASQLiteVFS } from "@lydie/store/web";
import { Button, LydieMark, StatusBanner } from "@lydie/ui";
import { StrictMode, useLayoutEffect, useRef } from "react";
import { createRoot } from "react-dom/client";

import { browserExports } from "./exports.ts";
import { createWebPlatform } from "./platform.ts";
import { plugins } from "./plugins.ts";

export type TryOptions = {
  // The app on its own host, where notes are kept.
  appUrl: string;
  // The page's own content, shown in the "About Lydie" tab. It is moved into the app, not copied,
  // so its scroll position, focus and form input carry over.
  about: HTMLElement;
  // Shows the app (until then the page keeps it hidden) and drops the page's static copy. Called
  // in the frame the app takes `about`, so no frame shows neither.
  show: () => void;
};

// What a page whose sidebar is hidden counts as narrow: the app has no layout of its own for it.
export const NARROW = "(max-width: 767px)";

const WORKSPACE_NAME = "Try Lydie";
// Fixed, so what the app paints (the workspace's icon, the ids of its Getting started pages) is
// the same every time: the site paints a captured copy of it before the app starts.
const WORKSPACE_ID = "01937a00-0000-7000-8000-000000000001";
const ABOUT_PATH: TabPath = "/about";
const ABOUT_TITLE = "About Lydie";

type About = {
  element: HTMLElement;
  // The About view's box, while it is mounted.
  container: HTMLElement | null;
  // Set once the element has moved in: a view mounted later takes it at once.
  adopted: boolean;
};

function aboutPlugin(about: About) {
  function AboutView() {
    const ref = useRef<HTMLDivElement>(null);
    useLayoutEffect(() => {
      const container = ref.current!;
      about.container = container;
      if (about.adopted) container.append(about.element);
      return () => {
        if (about.container === container) about.container = null;
      };
    }, []);
    return <div ref={ref} className="flex min-h-0 grow flex-col" data-testid="about" />;
  }

  function AboutLink() {
    const app = useApp();
    const current = useActiveTab()?.path === ABOUT_PATH;
    return (
      <button
        type="button"
        aria-current={current ? "page" : undefined}
        onClick={(event) => app.open(ABOUT_PATH, { mode: app.modeFor(event) })}
        className={sidebarItemStyles({ isCurrent: current, className: "mx-2 gap-1.5 px-1.5" })}
      >
        <LydieMark size={16} className="text-gray-400" />
        {ABOUT_TITLE}
      </button>
    );
  }

  return definePlugin({
    id: "try-about",
    name: ABOUT_TITLE,
    description: "The marketing site's page, as the try-out's first tab.",
    essential: true,
    activate(ctx) {
      ctx.views.register({
        path: ABOUT_PATH,
        component: AboutView,
        title: ABOUT_TITLE,
        icon: <LydieMark size={16} />,
      });
      // Above Home (2).
      ctx.sidebar.register({ id: "try-about", order: 1, component: AboutLink });
    },
  });
}

async function startTry(about: About): Promise<Host> {
  const web = createWebPlatform();
  // The site's tab keeps its own title.
  const platform = { ...web, windows: { ...web.windows, setTitle: () => {} } };
  const workspaceId = WORKSPACE_ID;
  // Its own name per page: where PowerSync shares a database between tabs, two try-outs would
  // otherwise share one.
  const store = await openWebStore({
    dbFilename: `lydie-try-${uuid()}.db`,
    vfs: WASQLiteVFS.InMemoryVfs,
  });
  const hub = createEventHub();
  const { blob } = createMemoryPorts();
  const runtime = createRuntime<Operations>({
    ...store.ports,
    registry: handledOperations(),
    blob,
    exports: browserExports(() => WORKSPACE_NAME),
    events: hub.port,
    extract: markdownExtract,
    actor: { type: "user", id: "local" },
  });
  const backend = createLocalBackend({
    store,
    runtime,
    blob,
    events: hub,
    info: { workspaceId, workspaceName: WORKSPACE_NAME, persistent: false, ephemeral: true },
  });
  await runtime.transaction(
    "Getting started",
    (ops) => createGettingStarted(ops, { workspaceId, mode: "try" }),
    { history: false },
  );
  const host = await startApp({
    backend,
    platform,
    plugins: [aboutPlugin(about), ...plugins],
    services: {
      about: {
        licence: "AGPL-3.0-only",
        sourceUrl: "https://github.com/lydiehq/lydie",
        version: platform.app.version,
        shell: "web",
      },
    },
    // Settings and layout stay in the page too.
    storage: createMemoryStorage(),
  });
  if (matchMedia(NARROW).matches) host.shell.set((s) => ({ ...s, sidebarOpen: false }));
  host.app.open(ABOUT_PATH);
  return host;
}

function TryBanner({ appUrl }: { appUrl: string }) {
  return (
    <StatusBanner
      kind="offline"
      action={
        <Button size="xs" onPress={() => window.location.assign(appUrl)}>
          Open Lydie
        </Button>
      }
    >
      You are trying Lydie. Nothing you write here is kept.
    </StatusBanner>
  );
}

// Resolves on the first animation frame where `ready` holds, or after `timeoutMs` regardless.
function frameWhen(ready: () => boolean, timeoutMs: number): Promise<void> {
  const until = performance.now() + timeoutMs;
  return new Promise((resolve) => {
    const check = () => {
      if (ready() || performance.now() > until) resolve();
      else requestAnimationFrame(check);
    };
    requestAnimationFrame(check);
  });
}

// Moves the page's element into the app, shows the app, and restores the element's scroll
// position and focus (an element in a hidden app cannot take focus).
function adopt(about: About, container: HTMLElement, show: () => void) {
  const { element } = about;
  const scroll = element.scrollTop;
  const active = document.activeElement;
  const focused = active instanceof HTMLElement && element.contains(active) ? active : null;
  const field =
    focused instanceof HTMLInputElement || focused instanceof HTMLTextAreaElement ? focused : null;
  const start = field?.selectionStart ?? null;
  const end = field?.selectionEnd ?? null;
  container.append(element);
  about.adopted = true;
  show();
  element.scrollTop = scroll;
  focused?.focus({ preventScroll: true });
  if (field && start !== null && end !== null) field.setSelectionRange(start, end);
}

// Starts the app in `element`, which the page keeps hidden until `show`. Once the app has painted
// its sidebar, it takes `about` and calls `show` in the same animation frame. Once per page.
export async function mountTry(element: HTMLElement, options: TryOptions): Promise<void> {
  const about: About = { element: options.about, container: null, adopted: false };
  const host = await startTry(about);
  createRoot(element).render(
    <StrictMode>
      <LydieApp host={host} banner={<TryBanner appUrl={options.appUrl} />} />
    </StrictMode>,
  );
  await frameWhen(
    () => about.container !== null && element.querySelector("[data-testid=tree-row]") !== null,
    3000,
  );
  if (about.container) adopt(about, about.container, options.show);
  else options.show();
}
