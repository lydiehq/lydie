import {
  ContributionBoundary,
  DocIcon,
  docIdOf,
  docPickerItem,
  documentMenuLabel,
  formatKeybinding,
  fuzzyScore,
  prefetchDoc,
  useActiveTab,
  useContributions,
  useQuery,
} from "@lydie/plugin-api";
import type {
  CommandChoice,
  CommandChoices,
  CommandInfo,
  DocumentMenuItemDef,
  DocumentRef,
  SearchHit,
} from "@lydie/plugin-api";
import { CheckRegular, ConfirmDialog, PickerDialog, RightRegular } from "@lydie/ui";
import type { PickerItem } from "@lydie/ui";
import { useDeferredValue, useEffect, useState, useSyncExternalStore } from "react";

import { useHostInternal } from "./context.ts";

// The open overlay: the command palette (host) or one a plugin registered.
export function Overlays() {
  const host = useHostInternal();
  const overlay = useSyncExternalStore(host.overlay.subscribe, host.overlay.get);
  const defs = useContributions("overlay");
  if (!overlay) return null;
  const close = () => host.app.overlays.close(overlay.id);
  if (overlay.id === "core.palette") return <CommandPalette close={close} />;
  const def = defs.find((d) => d.id === overlay.id);
  if (!def) return null;
  return (
    <ContributionBoundary pluginId={def.pluginId} label="Overlay">
      <def.component close={close} props={overlay.props} />
    </ContributionBoundary>
  );
}

// `app.confirm`: one dialog at a time, over any overlay that asked for it.
export function Confirms() {
  const host = useHostInternal();
  const request = useSyncExternalStore(host.confirms.subscribe, host.confirms.get)[0] ?? null;
  return <ConfirmDialog request={request} onResolve={(confirmed) => request?.resolve(confirmed)} />;
}

const DOC_PREFIX = "doc:";
const MENU_PREFIX = "menu:";
// fuzzyScore adds 300 when the title contains the query; below that a command is a loose
// subsequence match and ranks under the documents.
const STRONG_MATCH = 200;

// The document the palette acts on (its pill), and its menu's items that apply to it.
type PaletteContext = {
  doc: DocumentRef;
  deleted: boolean;
  menu: readonly (DocumentMenuItemDef & { pluginId: string })[];
};

const menuItemId = (m: { pluginId: string; id: string }) => `${MENU_PREFIX}${m.pluginId}:${m.id}`;

// Full-text hits for the palette's query. The previous hits stay up while the next ones load.
function useDocumentHits(text: string) {
  const host = useHostInternal();
  const [state, setState] = useState<{ text: string; hits: readonly SearchHit[] }>({
    text: "",
    hits: [],
  });
  useEffect(() => {
    if (!text) return;
    let live = true;
    host.backend
      .query("doc.search", { workspaceId: host.backend.info.workspaceId, text, limit: 8 })
      .then(
        (hits) => {
          if (live) setState({ text, hits });
        },
        () => {
          if (live) setState({ text, hits: [] });
        },
      );
    return () => {
      live = false;
    };
  }, [host, text]);
  return { hits: text ? state.hits : [], isLoading: Boolean(text) && state.text !== text };
}

// A command's choices for the query, while its page is open. The previous ones stay up while the
// next ones load.
function useChoices(choices: CommandChoices | null, text: string) {
  const host = useHostInternal();
  const [state, setState] = useState<{
    of: CommandChoices | null;
    text: string;
    list: readonly CommandChoice[];
  }>({ of: null, text: "", list: [] });
  useEffect(() => {
    if (!choices) return;
    let live = true;
    Promise.resolve(choices.list(text, host.app)).then(
      (list) => {
        if (live) setState({ of: choices, text, list });
      },
      () => {
        if (live) setState({ of: choices, text, list: [] });
      },
    );
    return () => {
      live = false;
    };
  }, [host, choices, text]);
  const mine = choices !== null && state.of === choices;
  return { list: mine ? state.list : [], isLoading: !mine || state.text !== text };
}

const choiceItem = (choice: CommandChoice): PickerItem => ({
  id: choice.id,
  title: choice.title,
  icon: choice.icon ?? <RightRegular />,
  ...(choice.group ? { group: choice.group } : {}),
  ...(choice.current
    ? {
        hint: (
          <>
            <CheckRegular className="size-4" />
            <span className="sr-only">(current)</span>
          </>
        ),
      }
    : {}),
});

// Groups while nothing is typed, in this order; any others follow alphabetically.
const GROUP_ORDER = ["Document", "Navigation", "Tabs", "View", "Edit", "Database", "General"];
const OTHER_GROUP = "Other";
const TOP_MATCHES = 4;

// Snippets are excerpts of the Markdown body: drop the match marks and inline emphasis/code marks.
const plainSnippet = (snippet: string) =>
  snippet
    .replace(/<\/?mark>/g, "")
    .replace(/\*\*|__|`/g, "")
    .trim();

const groupRank = (group: string) => {
  const index = GROUP_ORDER.indexOf(group);
  return index === -1 ? GROUP_ORDER.length : index;
};

// The actions on the context's document, like Linear's on the issue in its pill: plugin commands,
// then its menu's items, then the operations (ending with the destructive ones). Delete or
// Restore, whichever applies.
function contextItems(
  all: readonly CommandInfo[],
  context: PaletteContext,
  item: (c: CommandInfo) => PickerItem,
): PickerItem[] {
  const commands = all.filter(
    (c) =>
      c.scope === "document" && c.id !== (context.deleted ? "op.doc.delete" : "op.doc.restore"),
  );
  // A menu item that is also a command ("Share…") is listed once, as the command.
  const ids = new Set(all.map((c) => c.id));
  return [
    ...commands.filter((c) => c.source === "plugin").map(item),
    ...context.menu
      .filter((m) => !ids.has(m.id))
      .map((m) => ({
        id: menuItemId(m),
        title: documentMenuLabel(m, context.doc),
        icon: <RightRegular />,
      })),
    ...commands.filter((c) => c.source === "operation").map(item),
  ];
}

// A command's title as the palette shows it ("Remove from favorites") or its own name ("Add to or
// remove from favorites"), whichever matches better.
function titleScore(query: string, c: CommandInfo): number | null {
  const shown = fuzzyScore(query, c.paletteTitle ?? c.title);
  const name = c.paletteTitle ? fuzzyScore(query, c.title) : null;
  return shown === null ? name : name === null ? shown : Math.max(shown, name);
}

// While typing, like Linear: the context's matching actions lead, then commands whose own title
// matches without a heading (their group as a breadcrumb), then documents, then every other match
// under its group, best group first. Without a context, document actions are left out.
function paletteItems(
  all: readonly CommandInfo[],
  query: string,
  hits: readonly SearchHit[],
  mac: boolean,
  context: PaletteContext | null,
): PickerItem[] {
  const item = (c: CommandInfo, extra: Partial<PickerItem> = {}): PickerItem => ({
    id: c.id,
    title: c.paletteTitle ?? c.title,
    icon: c.icon ?? <RightRegular />,
    ...(c.keybindings[0] ? { hint: formatKeybinding(c.keybindings[0], mac) } : {}),
    ...extra,
  });
  const actions = context ? contextItems(all, context, (c) => item(c)) : [];
  const commands = all.filter((c) => c.scope !== "document");
  if (!query.trim()) {
    // Within a group, registration order: the shell's and plugins' commands ("New document")
    // before the operations, which end with the destructive ones.
    return [
      ...actions,
      ...[...commands]
        .sort((a, b) => {
          const ga = a.group ?? OTHER_GROUP;
          const gb = b.group ?? OTHER_GROUP;
          return groupRank(ga) - groupRank(gb) || ga.localeCompare(gb);
        })
        .map((c) => item(c, { group: c.group ?? OTHER_GROUP })),
    ];
  }
  const byId = new Map(all.map((c) => [c.id, c]));
  const matchedActions = actions
    .map((a) => {
      const c = byId.get(a.id);
      return { a, score: c ? titleScore(query, c) : fuzzyScore(query, a.title) };
    })
    .filter((x) => x.score !== null)
    .sort((a, b) => b.score! - a.score!)
    .map((x) => x.a);
  const scored = commands
    .map((c) => {
      const title = titleScore(query, c);
      return {
        c,
        title,
        score: title ?? fuzzyScore(query, `${c.group ?? ""} ${c.paletteTitle ?? c.title}`),
      };
    })
    .filter((x) => x.score !== null)
    .sort((a, b) => b.score! - a.score!);
  const top = scored.filter((x) => (x.title ?? 0) >= STRONG_MATCH).slice(0, TOP_MATCHES);
  const groups = new Map<string, CommandInfo[]>();
  for (const x of scored) {
    if (top.includes(x)) continue;
    const group = x.c.group ?? OTHER_GROUP;
    groups.set(group, [...(groups.get(group) ?? []), x.c]);
  }
  return [
    ...matchedActions,
    ...top.map(({ c }) => item(c, c.group ? { breadcrumbs: [c.group] } : {})),
    ...hits.map((hit) => {
      const snippet = plainSnippet(hit.snippet);
      return docPickerItem(hit, {
        id: `${DOC_PREFIX}${hit.id}`,
        group: "Documents",
        ...(snippet && snippet !== hit.title ? { subtitle: snippet } : {}),
      });
    }),
    ...[...groups].flatMap(([group, list]) => list.map((c) => item(c, { group }))),
  ];
}

// The open document as the palette's context, until its pill is removed.
function usePaletteContext() {
  const tab = useActiveTab();
  const [removed, setRemoved] = useState(false);
  const docId = removed ? null : docIdOf(tab?.path);
  const row = useQuery("doc.get", docId ? { id: docId } : null).data[0]?.document;
  const menu = useContributions("documentMenu");
  const remove = () => setRemoved(true);
  if (!row) return { context: null, properties: null, remove };
  const doc: DocumentRef = { id: row.id, title: row.title, parentId: row.parentId };
  const context: PaletteContext = {
    doc,
    deleted: row.deletedAt !== null,
    menu: menu
      .filter((m) => !m.when || m.when(doc))
      .sort((a, b) => (a.order ?? 0) - (b.order ?? 0)),
  };
  return { context, properties: row.properties, remove };
}

function CommandPalette({ close }: { close: () => void }) {
  const host = useHostInternal();
  const [query, setQuery] = useState("");
  const text = useDeferredValue(query.trim());
  // The command whose choices are open as a page of their own ("Set page icon").
  const [nestedId, setNestedId] = useState<string | null>(null);
  const commands = host.app.commands().filter((c) => c.enabled);
  const nested = commands.find((c) => c.id === nestedId && c.choices) ?? null;
  const docs = useDocumentHits(nested ? "" : text);
  const choices = useChoices(nested?.choices ?? null, text);
  const { context, properties, remove } = usePaletteContext();
  const back = () => {
    setNestedId(null);
    setQuery("");
  };
  if (nested) {
    return (
      <PickerDialog
        label="Command palette"
        placeholder={nested.choices?.placeholder ?? "Search"}
        query={query}
        onQueryChange={setQuery}
        items={choices.list.map(choiceItem)}
        isLoading={choices.isLoading}
        height="fixed"
        emptyText="No matches"
        // Backspace in the empty search, the pill's button or Escape go back to the commands.
        context={{ label: nested.paletteTitle ?? nested.title, icon: nested.icon, onRemove: back }}
        onBack={back}
        onClose={close}
        onSelect={(item) => {
          close();
          void host.app.runCommand(nested.id, item.id);
        }}
      />
    );
  }
  const items = paletteItems(commands, query, docs.hits, host.mac, context);
  return (
    <PickerDialog
      label="Command palette"
      placeholder={
        context ? "Search actions, commands and documents" : "Search commands and documents"
      }
      query={query}
      onQueryChange={setQuery}
      items={items}
      onHighlight={(item) => {
        if (item.id.startsWith(DOC_PREFIX)) {
          void prefetchDoc(host.backend, item.id.slice(DOC_PREFIX.length));
        }
      }}
      isLoading={docs.isLoading}
      height="fixed"
      emptyText={query.trim() ? "No commands or documents" : "No commands"}
      context={
        context && {
          label: context.doc.title || "Untitled",
          icon: <DocIcon id={context.doc.id} properties={properties} />,
          onRemove: remove,
        }
      }
      onClose={close}
      onSelect={(item, event) => {
        if (commands.find((c) => c.id === item.id)?.choices) {
          setNestedId(item.id);
          setQuery("");
          return;
        }
        close();
        if (item.id.startsWith(DOC_PREFIX)) {
          const mode = host.app.modeFor({ ...event, button: 0 });
          host.app.openDoc(item.id.slice(DOC_PREFIX.length), { mode });
        } else if (item.id.startsWith(MENU_PREFIX)) {
          const entry = context?.menu.find((m) => menuItemId(m) === item.id);
          if (entry) void entry.run(context!.doc, host.app);
        } else void host.app.runCommand(item.id);
      }}
    />
  );
}
