import { docIdOf } from "@lydie/plugin-api";
// Find in page: Mod+F opens a bar at the top right of the document view; matches are painted by
// the `find.ts` plugin. One bar per doc tab, reached by the commands through `finders`.
import type { AppApi, CommandSource, PluginContext } from "@lydie/plugin-api";
import { TextSelection, useEditorState } from "@lydie/plugin-api/editor";
import type { Editor } from "@lydie/plugin-api/editor";
import {
  Button,
  CloseRegular,
  DownRegular,
  groupedInputClass,
  Input,
  Search2Regular,
  UpRegular,
} from "@lydie/plugin-api/ui";
import { useEffect, useLayoutEffect, useRef, useState } from "react";

import { FindExtension, findState, findTransaction } from "./find.ts";

type Finder = {
  open(source: CommandSource): void;
  isOpen(): boolean;
  step(direction: 1 | -1): void;
};

// The mounted bars by tab id (pooled tabs stay mounted while hidden).
const finders = new Map<string, Finder>();

function activeFinder(app: AppApi): Finder | null {
  const tab = app.activeTab();
  return tab && docIdOf(tab.path) ? (finders.get(tab.id) ?? null) : null;
}

export function registerFind(ctx: PluginContext) {
  ctx.editor.register({ extensions: () => [FindExtension] });
  ctx.commands.register({
    id: "editor-view.find",
    title: "Find in page",
    group: "Document",
    icon: <Search2Regular />,
    keybinding: "Mod+F",
    // Only where there is an editor to search, so the browser's own find still works elsewhere.
    when: (app) => activeFinder(app) !== null,
    run: ({ app, source }) => activeFinder(app)?.open(source),
  });
  ctx.commands.register({
    id: "editor-view.find-next",
    title: "Find next",
    group: "Document",
    icon: <DownRegular />,
    keybinding: "Mod+G",
    when: (app) => activeFinder(app)?.isOpen() ?? false,
    run: ({ app }) => activeFinder(app)?.step(1),
  });
  ctx.commands.register({
    id: "editor-view.find-previous",
    title: "Find previous",
    group: "Document",
    icon: <UpRegular />,
    keybinding: "Mod+Shift+G",
    when: (app) => activeFinder(app)?.isOpen() ?? false,
    run: ({ app }) => activeFinder(app)?.step(-1),
  });
}

// The selection on one line, to search for.
function selectedText(editor: Editor): string | null {
  const { from, to, empty } = editor.state.selection;
  if (empty) return null;
  const text = editor.state.doc.textBetween(from, to, "\n", " ");
  return text.trim() && !text.includes("\n") && text.length <= 200 ? text : null;
}

// Scrolls the current match into view when it is off screen or under the bar.
function reveal(editor: Editor) {
  const el = editor.view.dom.querySelector<HTMLElement>("[data-find-current]");
  if (!el) return;
  const root = el.closest<HTMLElement>("[data-scroll-root]");
  const box = el.getBoundingClientRect();
  const view = root?.getBoundingClientRect() ?? { top: 0, bottom: window.innerHeight };
  if (box.top < view.top + 56 || box.bottom > view.bottom - 16)
    el.scrollIntoView({ block: "center" });
}

export function FindBar({ editor, tabId }: { editor: Editor; tabId: string }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [focusRequest, setFocusRequest] = useState<{ source: CommandSource } | null>(null);
  const openRef = useRef(false);
  // Where the search starts: the caret when the bar opened.
  const anchor = useRef(0);
  const input = useRef<HTMLInputElement>(null);
  const status = useEditorState({
    editor,
    selector: ({ editor }) => {
      const s = editor ? findState(editor.state) : null;
      return { count: s?.matches.length ?? 0, current: s?.current ?? -1 };
    },
  });

  useLayoutEffect(() => {
    openRef.current = open;
  });

  const step = (direction: 1 | -1) => {
    if (editor.isDestroyed) return;
    editor.view.dispatch(findTransaction(editor.state, { step: direction }));
    reveal(editor);
  };

  const show = (source: CommandSource) => {
    if (!openRef.current) {
      openRef.current = true;
      anchor.current = editor.state.selection.from;
      const selected = selectedText(editor);
      if (selected) setQuery(selected);
      setOpen(true);
    }
    // Again while open: select the query, to type a new one.
    setFocusRequest({ source });
  };

  // Escape: the current match becomes the editor's selection, as in a browser.
  const close = () => {
    openRef.current = false;
    setOpen(false);
    if (editor.isDestroyed) return;
    const s = findState(editor.state);
    const match = s.matches[s.current];
    const tr = findTransaction(editor.state, { query: "" });
    if (match) tr.setSelection(TextSelection.create(tr.doc, match.from, match.to)).scrollIntoView();
    editor.view.dispatch(tr);
    editor.view.focus();
  };

  useEffect(() => {
    const finder: Finder = { open: show, isOpen: () => openRef.current, step };
    finders.set(tabId, finder);
    return () => {
      if (finders.get(tabId) === finder) finders.delete(tabId);
    };
  });

  // The query (or closing) reaches the editor's find state.
  useEffect(() => {
    if (editor.isDestroyed) return;
    const wanted = open ? query : "";
    if (findState(editor.state).query === wanted) return;
    editor.view.dispatch(findTransaction(editor.state, { query: wanted, anchor: anchor.current }));
    if (wanted) reveal(editor);
  }, [editor, open, query]);

  // Cleared when the bar goes away with its tab.
  useEffect(
    () => () => {
      if (!editor.isDestroyed && findState(editor.state).query)
        editor.view.dispatch(findTransaction(editor.state, { query: "" }));
    },
    [editor],
  );

  useEffect(() => {
    if (!focusRequest) return;
    const take = () => {
      input.current?.focus();
      input.current?.select();
    };
    take();
    if (focusRequest.source !== "palette") return;
    // The palette hands focus back to where it was as it closes: take it again.
    const timers = [50, 250].map((delay) =>
      setTimeout(() => {
        if (openRef.current && document.activeElement !== input.current) take();
      }, delay),
    );
    return () => timers.forEach(clearTimeout);
  }, [focusRequest]);

  if (!open) return null;
  const label = !query
    ? ""
    : status.count === 0
      ? "No results"
      : `${status.current + 1} of ${status.count}`;
  return (
    // Sticks to the top of the scroll container without taking room in it.
    <div className="pointer-events-none sticky top-0 z-30 h-0 shrink-0">
      <search
        aria-label="Find in page"
        data-testid="find-bar"
        className="pointer-events-auto absolute top-[calc(var(--page-bar-overlay,0px)+0.5rem)] right-3 flex items-center gap-1 rounded-lg bg-elevated py-1 pr-1 pl-2.5 shadow-popover"
      >
        <Search2Regular className="size-3.5 shrink-0 text-gray-400" />
        <Input
          ref={input}
          size="sm"
          aria-label="Find in page"
          placeholder="Find in page"
          value={query}
          spellCheck={false}
          autoComplete="off"
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              step(event.shiftKey ? -1 : 1);
            } else if (event.key === "Escape") {
              event.preventDefault();
              // Not focus mode's or the shell's Escape.
              event.stopPropagation();
              close();
            }
          }}
          className={`w-44 flex-none px-1 outline-none ${groupedInputClass}`}
        />
        <span
          aria-live="polite"
          className="min-w-16 shrink-0 px-1 text-right text-xs text-gray-500 tabular-nums"
        >
          {label}
        </span>
        <Button
          size="icon-sm"
          variant="ghost"
          aria-label="Previous match"
          isDisabled={status.count === 0}
          onPress={() => step(-1)}
        >
          <UpRegular className="size-4" />
        </Button>
        <Button
          size="icon-sm"
          variant="ghost"
          aria-label="Next match"
          isDisabled={status.count === 0}
          onPress={() => step(1)}
        >
          <DownRegular className="size-4" />
        </Button>
        <Button size="icon-sm" variant="ghost" aria-label="Close find" onPress={close}>
          <CloseRegular className="size-4" />
        </Button>
      </search>
    </div>
  );
}
