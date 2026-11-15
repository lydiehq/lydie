import {
  atTop,
  DocIcon,
  docIdOf,
  docPath,
  DocumentSlots,
  linkStyleOf,
  linkTargetFor,
  markdownHref,
  PAGE_WIDTH_TRANSITION_MS,
  pageColumnClass,
  pageCoverOf,
  pageFullWidthOf,
  pageIconOf,
  parseDocPath,
  useApp,
  useBackend,
  useCollabDocument,
  useContributions,
  useOps,
  useQuery,
  useQuerySelect,
  useStatus,
  useTabStateSnapshot,
  useTabTint,
} from "@lydie/plugin-api";
import type {
  AppApi,
  DocWithBody,
  JSONContent,
  ParsedDocument,
  SlashCommandItem,
  TabTint,
  ViewProps,
} from "@lydie/plugin-api";
import { defaultSlashItems, Extension, LydieEditor } from "@lydie/plugin-api/editor";
import type { Editor, WikiLinkSuggestion } from "@lydie/plugin-api/editor";
import {
  Button,
  CommandList,
  DocumentThumbnailIcon,
  DragHandleGrip,
  EmptyState,
  ErrorState,
  LoadingState,
  NoAccessIllustration,
  NotFoundIllustration,
  StatusBanner,
  TableHandleMenu,
} from "@lydie/plugin-api/ui";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { KeyboardEvent, RefObject } from "react";

import { Breadcrumbs } from "./Breadcrumbs.tsx";
import { BubbleMenu } from "./BubbleMenu.tsx";
import { ConflictBanner, EXTERNAL, useFileSession } from "./file-session.tsx";
import { FindBar } from "./FindBar.tsx";
import { PageMenu } from "./PageMenu.tsx";
import { rankSlash, recordSlashUse } from "./slash-ranking.ts";
import type { SlashRecents } from "./slash-ranking.ts";

const SAVE_DELAY = 400;

export function DocTabTitle({ path }: { path: string }) {
  const id = docIdOf(path);
  const title = useQuerySelect("doc.get", id ? { id } : null, (s) =>
    s.data[0] ? s.data[0].document.title || "Untitled" : s.isLoading ? "" : "Not found",
  );
  const icon = useQuerySelect("doc.get", id ? { id } : null, (s) =>
    pageIconOf(s.data[0]?.document.properties),
  );
  // The page's own icon, else the document or database icon (as in the sidebar).
  return (
    <>
      <DocIcon id={id} properties={icon ? { icon } : null} className="size-4" />
      <span className="truncate">{title}</span>
    </>
  );
}

export function DocView({ tab }: ViewProps) {
  const app = useApp();
  const route = parseDocPath(tab.path);
  const ops = useOps();
  const { data, isLoading, error } = useQuery(
    "doc.get",
    route ? { id: route.id, includeBody: true } : null,
  );
  const entry = data[0];
  // Hosted, before the first download: a page that is not here may still be on its way.
  const arriving = useStatus().awaitingFirstSync === true;
  const fullWidth = pageFullWidthOf(entry?.document.properties);
  const root = useWidthTransition(entry?.document.id ?? null, fullWidth);
  const bar = useRef<HTMLDivElement>(null);
  // In a host's panel (the collections' page panel) the bar is left to the host's own controls.
  const bare = useTabStateSnapshot()("bare") === true;
  const overlay = useCoverOverlay(
    root,
    bar,
    pageCoverOf(entry?.document.properties) !== null && !entry?.document.deletedAt,
  );
  useTabTint(bare ? null : coverTint(overlay));
  if (!route) return null;
  if (error) return <ErrorState title="Could not open this document" error={error} />;
  if (!entry) {
    return isLoading || arriving ? (
      <LoadingState />
    ) : (
      <EmptyState
        className="h-full"
        title="This document does not exist"
        illustration={<NotFoundIllustration />}
        // Hosted: pages leave this device when they are deleted or access to them is removed.
        {...(app.workspace.mode === "synced"
          ? { description: "It was deleted, or your access to it was removed." }
          : {})}
      />
    );
  }
  const ref = {
    id: entry.document.id,
    title: entry.document.title,
    parentId: entry.document.parentId,
  };
  return (
    <div
      ref={root}
      // `isolate`: the bar's z-index stays inside the view, under a host's own controls.
      className="relative isolate flex min-h-0 grow flex-col"
      style={overlay ? { ["--page-bar-overlay" as string]: "2.25rem" } : undefined}
      data-testid="doc-view"
      data-doc-id={route.id}
      data-full-width={fullWidth || undefined}
    >
      {/* The breadcrumbs sit in the middle between two equal columns; when the trail is long
          the left one gives way first, as the actions never shrink below their width. */}
      <div
        ref={bar}
        data-testid="page-bar"
        data-over-cover={overlay?.over ? overlay.tone : undefined}
        className={`flex h-9 shrink-0 items-center gap-2 pr-2 ${
          overlay
            ? `absolute inset-x-0 top-0 z-10 transition-colors duration-150 ${overlay.over ? INK[overlay.tone] : "bg-surface"}`
            : ""
        }`}
      >
        {!bare && (
          <>
            <div aria-hidden className="flex-1 basis-0" />
            <Breadcrumbs doc={ref} />
            <div className="flex flex-1 basis-0 items-center justify-end gap-1">
              <DocumentSlots slot="actions" docId={route.id} />
              <PageMenu doc={ref} fullWidth={fullWidth} />
            </div>
          </>
        )}
      </div>
      {entry.document.deletedAt && (
        <StatusBanner
          kind="warning"
          action={
            <Button
              size="xs"
              variant="secondary"
              onPress={() => void ops.doc.restore({ id: route.id })}
            >
              Restore
            </Button>
          }
        >
          This document is in the trash.
        </StatusBanner>
      )}
      <DocEditor
        entry={entry}
        tabId={tab.id}
        heading={route.heading ?? null}
        blockId={route.blockId ?? null}
        active={tab.isActive}
        fullWidth={fullWidth}
      />
    </div>
  );
}

// The bar's ink over a cover, by how light the cover is there. On the bar rather than on each
// control, so the controls plugins put in it (Share, comments) follow. Literal white and black:
// the cover keeps its colours in both themes.
const INK = {
  dark: "[&_*]:text-white/85! [&_button:hover]:bg-white/15! [&_button:hover]:text-white! [&_button:hover_*]:text-white!",
  light:
    "[&_*]:text-black/60! [&_button:hover]:bg-black/8! [&_button:hover]:text-black/90! [&_button:hover_*]:text-black/90!",
} as const;

// A colour cover runs on into the tab while the bar is over it.
function coverTint(overlay: CoverOverlay | null): TabTint | null {
  if (!overlay?.over || !overlay.color) return null;
  return { color: overlay.color, tone: overlay.tone };
}

// `color`: the cover's computed background when it is a colour (`data-cover-color`), else null.
type CoverOverlay = { tone: "light" | "dark"; over: boolean; color: string | null };

// When the page opens on a cover (page-decor's `data-page-cover` at the very top of the scroll
// container), the bar lies over it instead of taking a row of its own: `over` while the cover is
// under the whole bar, with its `data-cover-tone` (dark until known). Null otherwise, also when a
// banner sits above the cover. The editor's own changes are skipped: they never move the cover.
function useCoverOverlay(
  root: RefObject<HTMLElement | null>,
  bar: RefObject<HTMLElement | null>,
  enabled: boolean,
): CoverOverlay | null {
  const [overlay, setOverlay] = useState<CoverOverlay | null>(null);
  useLayoutEffect(() => {
    const el = root.current;
    if (!enabled || !el) return;
    const measure = () => {
      frame = 0;
      const scroller = el.querySelector<HTMLElement>("[data-scroll-root]");
      const cover = scroller?.querySelector<HTMLElement>("[data-page-cover]");
      let next: CoverOverlay | null = null;
      if (scroller && cover && bar.current) {
        const box = cover.getBoundingClientRect();
        const top = box.top - scroller.getBoundingClientRect().top + scroller.scrollTop;
        if (top < 1) {
          next = {
            tone: cover.dataset.coverTone === "light" ? "light" : "dark",
            over: box.bottom > bar.current.getBoundingClientRect().bottom,
            color: cover.dataset.coverColor ? getComputedStyle(cover).backgroundColor : null,
          };
        }
      }
      setOverlay((prev) =>
        prev?.tone === next?.tone && prev?.over === next?.over && prev?.color === next?.color
          ? prev
          : next,
      );
    };
    let frame = 0;
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(measure);
    };
    const inEditor = (node: Node) =>
      (node instanceof Element ? node : node.parentElement)?.closest("[data-doc-content]") != null;
    const observer = new MutationObserver((records) => {
      if (records.some((r) => !inEditor(r.target))) schedule();
    });
    observer.observe(el, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeFilter: ["data-cover-tone", "data-cover-color"],
    });
    // Scroll does not bubble: caught on the way down to the scroll container.
    el.addEventListener("scroll", schedule, { capture: true, passive: true });
    measure();
    return () => {
      observer.disconnect();
      el.removeEventListener("scroll", schedule, { capture: true });
      if (frame) cancelAnimationFrame(frame);
    };
  }, [root, bar, enabled]);
  return enabled ? overlay : null;
}

// Marks the view with `data-width-transition` while the page glides to or from full width
// (PAGE_WIDTH_TRANSITION). Only a toggle on the same page: another page opening in the tab snaps.
function useWidthTransition(
  docId: string | null,
  fullWidth: boolean,
): RefObject<HTMLDivElement | null> {
  const root = useRef<HTMLDivElement>(null);
  const shown = useRef({ docId, fullWidth });
  // A layout effect: the attribute is in place before the browser restyles for the new width.
  useLayoutEffect(() => {
    const before = shown.current;
    shown.current = { docId, fullWidth };
    const el = root.current;
    if (!el || docId === null || before.docId !== docId || before.fullWidth === fullWidth) return;
    el.dataset.widthTransition = "";
    // A little longer than the glide, so removing the transition cannot cut its last frame.
    const timer = setTimeout(
      () => delete el.dataset.widthTransition,
      PAGE_WIDTH_TRANSITION_MS + 50,
    );
    return () => {
      clearTimeout(timer);
      delete el.dataset.widthTransition;
    };
  }, [docId, fullWidth]);
  return root;
}

const SLASH_RECENTS = "editor-view:slash-recents";

// The `/` menu: the editor's blocks and every plugin's items, each recording its use.
function slashItems(app: AppApi): SlashCommandItem[] {
  return [...defaultSlashItems, ...app.editor.slashItems()].map((item) => ({
    ...item,
    run: (editor: Editor) => {
      const recents = app.storage.get<SlashRecents>(SLASH_RECENTS) ?? {};
      app.storage.set(SLASH_RECENTS, recordSlashUse(recents, item.id, Date.now()));
      item.run(editor);
    },
  }));
}

// Remembers the modifier keys of the last pointer press, for links the editor opens.
let lastGesture = { metaKey: false, ctrlKey: false, shiftKey: false, altKey: false, button: 0 };

// `![[target]]`: the first plugin embed renderer that takes the target.
function EmbedSlot({ target, sourceId }: { target: string; sourceId: string }) {
  const renderers = useContributions("link");
  const renderer = renderers.find((r) => r.kind === "embed" && r.match(target));
  if (!renderer) return <span className="text-gray-500">{`![[${target}]]`}</span>;
  return <renderer.component target={target} sourceId={sourceId} />;
}

// Mounted once per editor: what plugins draw beside it (link popovers, mention menus).
function EditorOverlays({
  editor,
  docId,
  tabId,
}: {
  editor: Editor;
  docId: string;
  tabId: string;
}) {
  const contributions = useContributions("editor");
  return (
    <>
      {contributions.map((c, i) =>
        c.overlay ? (
          <c.overlay key={`${c.pluginId}:${i}`} editor={editor} docId={docId} tabId={tabId} />
        ) : null,
      )}
    </>
  );
}

// Scrolls to a heading (by text) or a `^block` of the editor's document.
function scrollToTarget(editor: Editor, heading: string | null, blockId: string | null) {
  const children = [...editor.view.dom.children] as HTMLElement[];
  let el: HTMLElement | undefined;
  if (blockId) {
    const suffix = `^${blockId}`;
    const index = children.findIndex((c) => c.textContent?.trim().endsWith(suffix));
    el = children[index];
    if (el && el.textContent?.trim() === suffix && index > 0) el = children[index - 1];
  } else if (heading) {
    const wanted = heading.trim().toLowerCase();
    el = children.find(
      (c) =>
        /^H[1-6]$/.test(c.tagName) &&
        c.textContent
          ?.replace(/\s\^[A-Za-z0-9-]+$/, "")
          .trim()
          .toLowerCase() === wanted,
    );
  }
  if (!el) return;
  el.scrollIntoView({ block: "start" });
  el.setAttribute("data-flash", "true");
  setTimeout(() => el?.removeAttribute("data-flash"), 1200);
}

function DocEditor({
  entry,
  tabId,
  heading,
  blockId,
  active,
  fullWidth,
}: {
  entry: DocWithBody;
  tabId: string;
  heading: string | null;
  blockId: string | null;
  active: boolean;
  fullWidth: boolean;
}) {
  const app = useApp();
  const ops = useOps();
  const backend = useBackend();
  const readTabState = useTabStateSnapshot();
  const id = entry.document.id;
  const markdown = entry.body?.markdown ?? "";
  // Hosted windows: the body is a collaborative document, saved by collab rather than here.
  const collab = useCollabDocument(id);
  const binding = collab === "loading" ? null : collab;
  // Someone who may comment but not edit still gets the selection toolbar's reading actions.
  const mayComment = useQuerySelect(
    "doc.access",
    binding?.state.readOnly ? { id } : null,
    (s) => s.data[0]?.level === "comment",
  );

  const [initial] = useState(() => app.editor.fromMarkdown(markdown));
  const parsed = useRef<ParsedDocument | null>(initial);
  const [content, setContent] = useState<JSONContent>(initial.content);
  const lastSaved = useRef(markdown);
  // Bodies this editor saved recently: the live query echoes each one, possibly after a newer save
  // went out; an echo is not someone else's change (taking it would reset the content and the
  // selection under the user's hands).
  const ours = useRef<string[]>([markdown]);
  const dirty = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const editorRef = useRef<Editor | null>(null);
  const [editor, setEditor] = useState<Editor | null>(null);
  const focusOnCreate = useRef(false);
  const titleRef = useRef<HTMLTextAreaElement>(null);
  // Shift-Tab with nothing to outdent goes back to the title (Enter and ArrowDown come from it).
  // Below the indent handler's priority, so lists and tab characters keep it.
  const [titleShortcut] = useState(() =>
    Extension.create({
      name: "focusTitle",
      priority: 50,
      addKeyboardShortcuts: () => ({
        "Shift-Tab": () => {
          const el = titleRef.current;
          if (!el) return false;
          el.focus();
          el.setSelectionRange(el.value.length, el.value.length);
          return true;
        },
      }),
    }),
  );
  const scroller = useRef<HTMLDivElement>(null);
  const scrollTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Folder vaults in Electron: edits go through the file bridge's session (LYD-196).
  const file = useFileSession(id, editorRef, dirty, !binding);
  const [dismissedConflict, setDismissedConflict] = useState<string | null>(null);

  const save = () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    if (binding) return;
    const editor = editorRef.current;
    if (!editor || editor.isDestroyed || !dirty.current || !parsed.current) return;
    dirty.current = false;
    if (file.active) {
      void file.save(editor.getJSON()).catch((error: unknown) => {
        app.notify({
          title: "Could not save",
          description: (error as Error).message,
          kind: "error",
        });
      });
      return;
    }
    const next = app.editor.toMarkdown(parsed.current, editor.getJSON());
    if (next === lastSaved.current) return;
    lastSaved.current = next;
    ours.current = [...ours.current.slice(-9), next];
    void ops.doc.updateBody({ id, markdown: next }, { history: false }).catch((error: unknown) => {
      app.notify({ title: "Could not save", description: (error as Error).message, kind: "error" });
    });
  };
  const saveRef = useRef(save);
  const fileRef = useRef(file);
  useLayoutEffect(() => {
    saveRef.current = save;
    fileRef.current = file;
  });

  // Someone else changed the body (another tab, an agent, the file bridge): take it if we have
  // no unsaved edits.
  useEffect(() => {
    // With a file session, changes on disk arrive as steps instead.
    if (file.active || markdown === lastSaved.current || dirty.current) return;
    if (ours.current.includes(markdown)) return;
    lastSaved.current = markdown;
    ours.current = [markdown];
    parsed.current = app.editor.fromMarkdown(markdown);
    setContent(parsed.current.content);
  }, [markdown, app, file.active]);

  useEffect(() => {
    const flush = () => saveRef.current();
    window.addEventListener("pagehide", flush);
    return () => {
      window.removeEventListener("pagehide", flush);
      flush();
      const editor = editorRef.current;
      if (editor && !editor.isDestroyed) {
        const { anchor, head } = editor.state.selection;
        app.setTabState(tabId, { selection: { anchor, head } });
      }
    };
  }, [app, tabId]);

  // Restore the scroll position (from the tab state bag) or jump to a heading from the route.
  useLayoutEffect(() => {
    const el = scroller.current;
    if (!el) return;
    const scroll = readTabState("scroll");
    if (typeof scroll === "number") el.scrollTop = scroll;
  }, [readTabState]);

  const onCreate = (editor: Editor) => {
    editorRef.current = editor;
    setEditor(editor);
    editor.on("update", ({ transaction }) => {
      if (!transaction.docChanged) return;
      fileRef.current.track(transaction);
      if (transaction.getMeta(EXTERNAL)) return;
      dirty.current = true;
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => saveRef.current(), SAVE_DELAY);
    });
    editor.on("blur", () => saveRef.current());
    const selection = readTabState("selection") as { anchor?: number; head?: number } | undefined;
    if (selection && typeof selection.anchor === "number") {
      const size = editor.state.doc.content.size;
      const anchor = Math.min(selection.anchor, size);
      const head = Math.min(selection.head ?? anchor, size);
      editor.commands.setTextSelection({ from: anchor, to: head });
    }
    if (heading || blockId) scrollToTarget(editor, heading, blockId);
    if (focusOnCreate.current) {
      focusOnCreate.current = false;
      editor.commands.setTextSelection(1);
      editor.view.focus();
    }
    // Opened to write at once (a daily note).
    if (readTabState("focusEditor") === true) {
      app.setTabState(tabId, { focusEditor: null });
      if (!selection) editor.commands.setTextSelection(editor.state.doc.content.size);
      editor.view.focus();
      // A closing dialog hands focus back to its trigger a moment later: take it again unless the
      // user has moved on.
      for (const delay of [50, 250]) {
        setTimeout(() => {
          const lost = !document.activeElement || document.activeElement === document.body;
          if (lost && !editor.isDestroyed) editor.view.focus();
        }, delay);
      }
    }
  };

  // A new heading or block in the route (a link followed within this tab).
  const lastPart = useRef(`${heading}|${blockId}`);
  useEffect(() => {
    const key = `${heading}|${blockId}`;
    if (key === lastPart.current) return;
    lastPart.current = key;
    const editor = editorRef.current;
    if (editor && !editor.isDestroyed && (heading || blockId))
      scrollToTarget(editor, heading, blockId);
  }, [heading, blockId]);

  const searchDocuments = async (query: string): Promise<WikiLinkSuggestion[]> => {
    const q = query.trim();
    if (!q) return [];
    const hits = await backend.query("doc.search", {
      workspaceId: backend.info.workspaceId,
      text: q,
      limit: 8,
    });
    const lower = q.toLowerCase();
    const sorted = hits
      .filter((h) => h.id !== id)
      .sort(
        (a, b) =>
          Number(b.title.toLowerCase().startsWith(lower)) -
          Number(a.title.toLowerCase().startsWith(lower)),
      );
    // In a folder window, links follow its settings (format and path), read now so a change in
    // Settings applies to the next link.
    const style = linkStyleOf(app);
    if (!style) return sorted.map((h) => ({ target: h.title, title: h.title }));
    return Promise.all(
      sorted.map(async (h) => {
        const target = await linkTargetFor(backend, id, h.id, style.path);
        return {
          target,
          title: h.title,
          ...(target !== h.title ? { description: target } : {}),
          ...(style.format === "markdown" ? { href: markdownHref(target) } : {}),
        };
      }),
    );
  };

  // Mod-Alt-9 and the `+` menu: a child of this page, first among its children, linked as the
  // folder's settings say.
  const createSubPage = async (title: string): Promise<WikiLinkSuggestion> => {
    const workspaceId = backend.info.workspaceId;
    const name = title.trim().slice(0, 255) || "Untitled";
    const created = await ops.doc.create({
      workspaceId,
      parentId: id,
      title: name,
      ...(await atTop(backend, workspaceId, id)),
    });
    const style = linkStyleOf(app);
    if (!style) return { target: name, title: name };
    const target = await linkTargetFor(backend, id, created.id, style.path);
    return {
      target,
      title: name,
      ...(style.format === "markdown" ? { href: markdownHref(target) } : {}),
    };
  };

  const openWikiLink = async (attrs: { target: string; heading?: string | null }) => {
    const target = attrs.target.split("/").at(-1)?.replace(/\.md$/i, "") ?? attrs.target;
    // Without the links plugin: Mod-click follows (as Obsidian does while editing).
    const mode = app.modeFor(lastGesture, "edit");
    let docId: string | null = null;
    try {
      // The saved link carries the runtime's resolution; a link typed since the last save falls
      // back to a title search.
      const key = (ref: string) =>
        ref
          .replace(/#.*$/, "")
          .replace(/\.(md|base)$/i, "")
          .trim()
          .toLowerCase();
      const saved = (await backend.query("doc.links", { id })).find(
        (l) => key(l.targetRef) === key(attrs.target),
      );
      if (saved?.target) docId = saved.target.id;
      const hits = saved
        ? []
        : await backend.query("doc.search", {
            workspaceId: backend.info.workspaceId,
            text: target,
            limit: 20,
          });
      docId ??= hits.find((h) => h.title.toLowerCase() === target.toLowerCase())?.id ?? null;
    } catch {
      docId = null;
    }
    if (!docId) {
      const created = await ops.doc.create({
        workspaceId: backend.info.workspaceId,
        title: target,
      });
      docId = created.id;
    }
    app.open(docPath(docId, { heading: attrs.heading ?? undefined }), { mode });
  };

  if (binding?.state.status === "unavailable") {
    return (
      <EmptyState
        className="h-full"
        title="You no longer have access to this page"
        illustration={<NoAccessIllustration />}
        description="Someone removed your access, or the page was deleted."
      />
    );
  }

  return (
    <div
      ref={scroller}
      // Overlays find the scroll container by this (no computed-style walk). One that puts
      // something beside the text (comments) sets `--doc-margin` for room on the right.
      data-scroll-root=""
      className="flex min-h-0 grow flex-col overflow-y-auto pr-[var(--doc-margin,0px)] motion-safe:transition-[padding] motion-safe:duration-200"
      onScroll={(event) => {
        const top = event.currentTarget.scrollTop;
        if (scrollTimer.current) clearTimeout(scrollTimer.current);
        scrollTimer.current = setTimeout(() => app.setTabState(tabId, { scroll: top }), 250);
      }}
      onMouseDownCapture={(event) => {
        lastGesture = {
          metaKey: event.metaKey,
          ctrlKey: event.ctrlKey,
          shiftKey: event.shiftKey,
          altKey: event.altKey,
          button: event.button,
        };
      }}
    >
      {editor && !editor.isDestroyed && <FindBar editor={editor} tabId={tabId} />}
      {binding?.state.readOnly && (
        <StatusBanner kind="info">You can view this page but not edit it.</StatusBanner>
      )}
      {file.conflict && file.conflict.at !== dismissedConflict && (
        <ConflictBanner
          docId={id}
          conflict={file.conflict}
          editorRef={editorRef}
          onDone={() => setDismissedConflict(file.conflict?.at ?? null)}
        />
      )}
      <DocumentSlots slot="top" docId={id} />
      {/* The body's column (editor-content.css: 680px blocks, 1rem padding; full width: 5rem
          padding), so the text lines up. */}
      <div className={`${pageColumnClass(fullWidth)} pt-12`}>
        <TitleField
          id={id}
          inputRef={titleRef}
          title={entry.document.title}
          autoFocus={active && readTabState("focusTitle") === true}
          onDone={() => {
            app.setTabState(tabId, { focusTitle: null });
            const editor = editorRef.current;
            // Synchronously, so keys typed right after Enter land in the body (TipTap's focus
            // command waits a frame).
            if (editor && !editor.isDestroyed) {
              editor.commands.setTextSelection(1);
              editor.view.focus();
            } else {
              // The editor is not there yet: focus it as soon as it is.
              focusOnCreate.current = true;
              scroller.current?.querySelector<HTMLElement>("[data-doc-content]")?.focus();
            }
          }}
        />
        <DocumentSlots slot="header" docId={id} />
      </div>
      <DocumentSlots
        slot="body"
        docId={id}
        fallback={
          collab === "loading" ? (
            // As in v1: the body this device has, read-only, until the collaborative document is
            // loaded and takes its place (a few ms; a spinner there made every page jump).
            <LydieEditor
              key="local"
              aria-label="Document content"
              content={content}
              editable={false}
              extensions={app.editor.extensions()}
              renderEmbed={({ target }) => <EmbedSlot target={target} sourceId={id} />}
              fullWidth={fullWidth}
              className="grow"
            />
          ) : (
            <LydieEditor
              key="live"
              aria-label="Document content"
              content={content}
              collab={
                binding
                  ? {
                      ydoc: binding.session.ydoc as never,
                      awareness: binding.session.awareness,
                      readOnly: binding.state.readOnly,
                      user: binding.session.user,
                    }
                  : undefined
              }
              onCreate={onCreate}
              placeholder="Write something, or press / for commands"
              slashItems={slashItems(app)}
              filterSlashItems={(items, query) =>
                rankSlash(items, query, app.storage.get<SlashRecents>(SLASH_RECENTS) ?? {})
              }
              renderSlashMenu={(menu) => <CommandList aria-label="Insert block" {...menu} />}
              searchDocuments={searchDocuments}
              createSubPage={createSubPage}
              renderWikiLinkMenu={(menu) => (
                <CommandList
                  aria-label="Link to document"
                  emptyLabel="No matching documents"
                  {...menu}
                  items={menu.items.map((item) => ({
                    // The `+` menu's "new page" entry can share its title with a hit.
                    id: item.create ? `new:${item.target}` : item.target,
                    title: item.title ?? item.target,
                    ...(item.description ? { description: item.description } : {}),
                    icon: <DocumentThumbnailIcon size="sm" />,
                  }))}
                />
              )}
              onOpenWikiLink={(attrs) => void openWikiLink(attrs)}
              bubbleMenu={(editor) => <BubbleMenu editor={editor} docId={id} tabId={tabId} />}
              bubbleMenuWhenReadOnly={mayComment}
              dragHandle={(block) => <DragHandleGrip label={block?.label} />}
              renderTableHandle={(handle) => <TableHandleMenu {...handle} />}
              extensions={[...app.editor.extensions(), titleShortcut]}
              renderEmbed={({ target }) => <EmbedSlot target={target} sourceId={id} />}
              fullWidth={fullWidth}
              className="grow"
            />
          )
        }
      />
      {editor && !editor.isDestroyed && <EditorOverlays editor={editor} docId={id} tabId={tabId} />}
    </div>
  );
}

function TitleField({
  id,
  inputRef: ref,
  title,
  autoFocus,
  onDone,
}: {
  id: string;
  inputRef: RefObject<HTMLTextAreaElement | null>;
  title: string;
  autoFocus: boolean;
  onDone: () => void;
}) {
  const ops = useOps();
  const app = useApp();
  // A new document's "Untitled" shows as the placeholder, so typing replaces it.
  const shown = (t: string) => (t === "Untitled" ? "" : t);
  const [value, setValue] = useState(shown(title));
  const focused = useRef(false);

  useEffect(() => {
    if (!focused.current) setValue(shown(title));
  }, [title]);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "0px";
    el.style.height = `${el.scrollHeight}px`;
  }, [value, ref]);

  useEffect(() => {
    if (autoFocus) ref.current?.focus();
  }, [autoFocus, ref]);

  const commit = (next: string) => {
    const trimmed = next.trim().replace(/\s+/g, " ");
    if (trimmed && trimmed !== title) {
      void ops.doc
        .rename({ id, title: trimmed }, { coalesce: `title:${id}`, label: "Rename document" })
        .catch((error: unknown) =>
          app.notify({
            title: "Could not rename",
            description: error instanceof Error ? error.message : String(error),
            kind: "error",
          }),
        );
    }
  };

  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === "Enter" || (event.key === "ArrowDown" && !value.includes("\n"))) {
      event.preventDefault();
      commit(value);
      onDone();
    }
  };

  // A bare textarea, not the shared TextArea: it reads as the page's heading above the editor,
  // not as a form field, and grows with the title.
  return (
    <textarea
      ref={ref}
      aria-label="Title"
      // Hovering the title shows what a "top" slot keeps hidden above it (page-decor's buttons).
      data-page-title=""
      rows={1}
      value={value}
      placeholder="Untitled"
      onFocus={() => (focused.current = true)}
      onBlur={() => {
        focused.current = false;
        commit(value);
      }}
      onChange={(event) => {
        const next = event.target.value.replace(/\n/g, " ");
        setValue(next);
        commit(next);
      }}
      onKeyDown={onKeyDown}
      className="my-2 w-full resize-none overflow-hidden bg-transparent py-2 text-[1.75rem] leading-tight font-medium tracking-[-0.05rem] text-gray-950 outline-none placeholder:text-gray-300"
    />
  );
}
