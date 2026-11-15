import { useApp, useContributions } from "@lydie/plugin-api";
import type { Contributed } from "@lydie/plugin-api";
import {
  Button,
  CloseRegular,
  createEscapeStack,
  Dialog,
  EmptyState,
  ErrorState,
  Heading,
  Modal,
  SearchField,
  SettingsEscapeContext,
  sidebarItemStyles,
} from "@lydie/plugin-api/ui";
import { Component, useEffect, useLayoutEffect, useRef, useState } from "react";
import type { KeyboardEvent, ReactNode } from "react";

import clsx from "./clsx.ts";
import { groupPages, resolvePage, searchPages } from "./navigation.ts";

export type SettingsOverlayProps = {
  page?: string | null;
  path?: string | null;
};

type Page = Contributed<"settings">;

// The settings: a large overlay over the app, with a searchable navigation of the pages plugins
// contribute, the page, and (inside the page) an optional details panel. The open page is the
// overlay's props, so the host can keep it in the URL (`settings/<page>/<path>`, see the
// overlay's `url` in index.tsx); Escape closes the details panel first, then the settings.
export function SettingsShell({ close, props }: { close: () => void; props: unknown }) {
  const app = useApp();
  const options = (props ?? {}) as SettingsOverlayProps;
  const all = useContributions("settings");
  const pages = all.filter((p) => !p.when || p.when(app));
  const pageId = options.page ?? null;
  const path = options.path ?? null;
  const [query, setQuery] = useState("");
  const [stack] = useState(createEscapeStack);
  const contentRef = useRef<HTMLDivElement>(null);
  const navRef = useRef<HTMLElement>(null);

  // A page reached by deep link may be hidden from the navigation (`when`), but still opens.
  const current = resolvePage(all, pageId);
  const results = searchPages(pages, query);
  const groups = groupPages(query ? results : pages);

  const show = (id: string, nextPath: string | null) =>
    app.overlays.open("settings", { page: id, path: nextPath } satisfies SettingsOverlayProps);

  // Opened without a page: the first one, by name. A named page that is not there yet (its
  // plugin is still loading) keeps its name.
  const firstId = pageId ? null : (current?.id ?? null);
  useEffect(() => {
    if (firstId) app.overlays.open("settings", { page: firstId, path: null });
  }, [app, firstId]);

  // Closing animates out like the other dialogs: the Modal closes first, and the host is told
  // once react-aria has unmounted the content after its exit transition (`CloseWhenGone`).
  const [isOpen, setOpen] = useState(true);
  const dismiss = () => setOpen(false);

  const goTo = (id: string, nextPath: string | null = null) => {
    show(id, nextPath);
    contentRef.current?.scrollTo({ top: 0 });
  };

  const onKeyDown = (event: KeyboardEvent) => {
    if (navRef.current?.contains(event.target as Node)) onNavKeyDown(event);
  };

  // Escape anywhere (focus can fall back to the page after a menu closes): the innermost layer
  // first. Overlays inside (selects, dialogs) stop the Escapes they handle themselves.
  const dismissRef = useRef(dismiss);
  useLayoutEffect(() => {
    dismissRef.current = dismiss;
  });
  useEffect(() => {
    const onEscape = (event: globalThis.KeyboardEvent) => {
      if (event.key !== "Escape" || event.defaultPrevented || event.isComposing) return;
      event.preventDefault();
      if (!stack.pop()) dismissRef.current();
    };
    window.addEventListener("keydown", onEscape);
    return () => window.removeEventListener("keydown", onEscape);
  }, [stack]);

  // Up and down move between the navigation's pages.
  const onNavKeyDown = (event: KeyboardEvent) => {
    if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
    const items = [...(navRef.current?.querySelectorAll<HTMLElement>("[data-settings-nav]") ?? [])];
    const index = items.indexOf(document.activeElement as HTMLElement);
    if (index === -1) return;
    event.preventDefault();
    const next =
      items[(index + (event.key === "ArrowDown" ? 1 : -1) + items.length) % items.length];
    next?.focus();
  };

  return (
    <Modal
      isOpen={isOpen}
      size="screen"
      isDismissable
      isKeyboardDismissDisabled
      onOpenChange={(open) => {
        if (!open) dismiss();
      }}
    >
      <Dialog aria-label="Settings" className="h-full">
        <CloseWhenGone isOpen={isOpen} close={close} />
        {/* oxlint-disable-next-line jsx-a11y/no-static-element-interactions -- Escape for the dialog */}
        <div className="flex h-full flex-col" onKeyDown={onKeyDown}>
          <SettingsEscapeContext value={stack}>
            <header className="relative flex h-12 shrink-0 items-center justify-center border-b border-gray-950/5">
              {/* As wide as the navigation's items below it, at the close button's height. */}
              <SearchField
                size="sm"
                aria-label="Search settings"
                placeholder="Search settings"
                value={query}
                onChange={setQuery}
                onSubmit={() => {
                  if (!results[0]) return;
                  goTo(results[0].id);
                  setQuery("");
                }}
                onKeyDown={(event) => {
                  if (event.key === "ArrowDown") {
                    event.preventDefault();
                    navRef.current?.querySelector<HTMLElement>("[data-settings-nav]")?.focus();
                  } else {
                    // react-aria stops every key by default; an Escape on an empty field must
                    // still reach the window and close the settings.
                    event.continuePropagation();
                  }
                }}
                className="absolute left-2 w-56 max-w-[40%]"
              />
              <Heading slot="title" className="text-sm font-medium text-gray-900">
                Settings
              </Heading>
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label="Close settings"
                className="absolute right-2.5"
                onPress={dismiss}
              >
                <CloseRegular className="size-4" />
              </Button>
            </header>
            <div className="flex min-h-0 flex-1">
              {/* The border sits on a wrapper: the nav's scroll fade would fade it too. */}
              <div className="flex w-60 shrink-0 flex-col border-r border-gray-950/5">
                <nav
                  ref={navRef}
                  aria-label="Settings sections"
                  className="min-h-0 grow scroll-fade overflow-y-auto p-2 pt-4"
                >
                  {groups.length === 0 && (
                    <p className="px-2 py-1 text-sm text-gray-500">No settings match “{query}”</p>
                  )}
                  {groups.map((group) => (
                    <div key={group.title} className="mb-4">
                      <h2 className="px-2 pb-1 text-xs font-medium text-gray-500">{group.title}</h2>
                      <ul className="flex flex-col">
                        {group.pages.map((p) => (
                          <li key={`${p.pluginId}:${p.id}`}>
                            <button
                              type="button"
                              data-settings-nav
                              aria-current={p.id === current?.id ? "page" : undefined}
                              onClick={() => goTo(p.id)}
                              className={sidebarItemStyles({
                                isCurrent: p.id === current?.id,
                                className: clsx(
                                  "w-full gap-2 px-2 text-left",
                                  p.id === current?.id && "text-gray-900",
                                ),
                              })}
                            >
                              {p.icon}
                              <span className="truncate">{p.title}</span>
                            </button>
                          </li>
                        ))}
                      </ul>
                    </div>
                  ))}
                </nav>
              </div>
              <div
                ref={contentRef}
                tabIndex={-1}
                data-testid="settings-content"
                className="relative min-w-0 flex-1 overflow-y-auto outline-none"
              >
                {current ? (
                  <PageFrame key={`${current.pluginId}:${current.id}`} page={current}>
                    <current.component path={path} navigate={(next) => show(current.id, next)} />
                  </PageFrame>
                ) : (
                  <EmptyState title="No settings pages." />
                )}
              </div>
            </div>
          </SettingsEscapeContext>
        </div>
      </Dialog>
    </Modal>
  );
}

// Calls `close` when it unmounts after the Modal was closed. While open, an unmount (the host
// closed the overlay itself, or Strict Mode's rehearsal) is not ours to report.
function CloseWhenGone({ isOpen, close }: { isOpen: boolean; close: () => void }) {
  const latest = useRef({ isOpen, close });
  useLayoutEffect(() => {
    latest.current = { isOpen, close };
  });
  useEffect(
    () => () => {
      if (!latest.current.isOpen) latest.current.close();
    },
    [],
  );
  return null;
}

function PageFrame({ page, children }: { page: Page; children: ReactNode }) {
  return (
    <div className="mx-auto max-w-2xl px-9 pt-14 pb-10" data-testid={`settings-page-${page.id}`}>
      <h1 className="text-xl font-medium text-gray-900">{page.title}</h1>
      {page.description && <p className="mt-1 text-sm text-gray-500">{page.description}</p>}
      <div className="mt-8">
        <PageBoundary label={page.title}>{children}</PageBoundary>
      </div>
    </div>
  );
}

// A failing page shows its error in place; the navigation keeps working.
class PageBoundary extends Component<{ label: string; children: ReactNode }, { error: unknown }> {
  override state = { error: null as unknown };
  static getDerivedStateFromError(error: unknown) {
    return { error };
  }
  override render() {
    if (this.state.error) {
      return (
        <ErrorState
          title={`The ${this.props.label} settings could not be shown`}
          error={this.state.error}
        />
      );
    }
    return this.props.children;
  }
}
