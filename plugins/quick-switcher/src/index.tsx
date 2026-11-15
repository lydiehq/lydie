import {
  definePlugin,
  docIdOf,
  docPath,
  docPickerItem,
  fuzzyScore,
  pageIconOf,
  prefetchDoc,
  useApp,
  useBackend,
} from "@lydie/plugin-api";
import type { AppApi, OpenOptions } from "@lydie/plugin-api";
import { FileSearchRegular, PickerDialog } from "@lydie/plugin-api/ui";
import type { PickerItem, PickerSelectEvent } from "@lydie/plugin-api/ui";
import { useEffect, useState } from "react";

import { parseQuery, rank, recordOpen } from "./ranking.ts";
import type { Candidate, Usage } from "./ranking.ts";

const USAGE_KEY = "quick-switcher:usage";

// Titles with their folder path, read once per opening of the switcher (one query, no watch).
async function loadCandidates(app: AppApi): Promise<Candidate[]> {
  const { entries } = await app.backend.ops.doc.listTree({
    workspaceId: app.workspace.workspaceId,
  });
  const titles = new Map(entries.map((e) => [e.id, e.title]));
  const parents = new Map(entries.map((e) => [e.id, e.parentId]));
  return entries.map((e) => {
    const path: string[] = [];
    for (let p = e.parentId; p && path.length < 4; p = parents.get(p) ?? null)
      path.unshift(titles.get(p) ?? "");
    return {
      id: e.id,
      title: e.title,
      path: path.join(" / "),
      icon: pageIconOf(e.properties),
      updatedAt: e.updatedAt,
    };
  });
}

// Enter: here. Mod+Enter: a new tab. Mod+Alt+Enter (or Shift+Enter, as before): to the side.
function modeOf(app: AppApi, event: PickerSelectEvent): OpenOptions["mode"] {
  if (event.shiftKey && !(event.metaKey || event.ctrlKey)) return "split";
  const mode = app.modeFor({ ...event, button: 0 });
  return mode === "replace" || mode === "tab" || mode === "split" ? mode : "replace";
}

type Heading = { docId: string; text: string; level: number };

// Headings of one document (the active one, or the best match for the text before `#`).
function useHeadings(app: AppApi, docQuery: string | null, candidates: Candidate[] | null) {
  const [state, setState] = useState<{ key: string; headings: Heading[] } | null>(null);
  const key = docQuery === null ? "" : `${docQuery}`;
  useEffect(() => {
    if (docQuery === null || !candidates) return;
    let live = true;
    const id = docQuery
      ? (rank(candidates, docQuery, {}, 0, 1)[0]?.id ?? null)
      : docIdOf(app.activeTab()?.path);
    if (!id) {
      setState({ key, headings: [] });
      return;
    }
    void app.backend.query("doc.get", { id, includeBody: true }).then((rows) => {
      if (!live) return;
      const outline = app.editor.outline(rows[0]?.body?.markdown ?? "");
      setState({
        key,
        headings: outline.headings.map((h) => ({ docId: id, text: h.text, level: h.level })),
      });
    });
    return () => {
      live = false;
    };
  }, [app, docQuery, candidates, key]);
  return state?.key === key ? state.headings : null;
}

function QuickSwitcher({ close }: { close: () => void; props: unknown }) {
  const app = useApp();
  const backend = useBackend();
  const [query, setQuery] = useState("");
  const [candidates, setCandidates] = useState<Candidate[] | null>(null);
  const [now] = useState(() => Date.now());
  const usage = app.storage.get<Usage>(USAGE_KEY) ?? {};
  const parsed = parseQuery(query);
  const headings = useHeadings(app, parsed.kind === "headings" ? parsed.doc : null, candidates);

  useEffect(() => {
    let live = true;
    void loadCandidates(app).then((list) => {
      if (live) setCandidates(list);
    });
    return () => {
      live = false;
    };
  }, [app]);

  let items: PickerItem[] = [];
  let isLoading = candidates === null;
  if (parsed.kind === "commands") {
    items = app
      .commands()
      .filter((c) => c.enabled)
      .map((c) => ({ c, s: fuzzyScore(parsed.text, c.title) }))
      .filter((x) => x.s !== null)
      .sort((a, b) => b.s! - a.s!)
      .slice(0, 50)
      .map(({ c }) => ({
        id: `command:${c.id}`,
        title: c.title,
        ...(c.group ? { subtitle: c.group } : {}),
        ...(c.keybindings[0] ? { hint: app.formatKeybinding(c.keybindings[0]) } : {}),
      }));
  } else if (parsed.kind === "headings") {
    isLoading = headings === null;
    items = (headings ?? [])
      .map((h, i) => ({ h, i, s: parsed.text ? fuzzyScore(parsed.text, h.text) : 0 }))
      .filter((x) => x.s !== null)
      .sort((a, b) => (parsed.text ? b.s! - a.s! : a.i - b.i))
      .map(({ h, i }) => ({
        id: `heading:${h.docId}:${i}`,
        title: h.text,
        subtitle: `H${h.level}`,
      }));
  } else {
    const ranked = rank(candidates ?? [], query, usage, now);
    items = ranked.map((c) =>
      docPickerItem(
        { id: c.id, title: c.title, properties: c.icon ? { icon: c.icon } : null },
        c.path ? { subtitle: c.path } : {},
      ),
    );
    if (
      query.trim() &&
      candidates &&
      !ranked.some((c) => c.title.toLowerCase() === query.trim().toLowerCase())
    ) {
      items.push({ id: "create", title: `Create “${query.trim()}”` });
    }
  }

  return (
    <PickerDialog
      label="Quick switcher"
      placeholder="Find or create a document · # headings · > commands"
      query={query}
      onQueryChange={setQuery}
      items={items}
      onHighlight={(item) => {
        if (parsed.kind === "docs" && item.id !== "create") {
          void prefetchDoc(app.backend, item.id);
        }
      }}
      isLoading={isLoading}
      height="fixed"
      emptyText={
        parsed.kind === "commands"
          ? "No commands"
          : parsed.kind === "headings"
            ? "No headings"
            : "No documents"
      }
      footer={`Enter to open · ${app.formatKeybinding("Mod+Enter")} new tab · ${app.formatKeybinding("Mod+Alt+Enter")} to the side`}
      onClose={close}
      onSelect={(item, event) => {
        close();
        const mode = modeOf(app, event);
        if (item.id.startsWith("command:")) {
          void app.runCommand(item.id.slice("command:".length));
        } else if (item.id.startsWith("heading:")) {
          const [, docId, index] = item.id.split(":");
          const heading = headings?.[Number(index)];
          if (docId && heading) app.open(docPath(docId, { heading: heading.text }), { mode });
        } else if (item.id === "create") {
          void backend.ops.doc
            .create(
              { workspaceId: backend.info.workspaceId, title: query.trim() },
              { scope: app.historyScope() },
            )
            .then((doc) => app.openDoc(doc.id, { mode }));
        } else app.openDoc(item.id, { mode });
      }}
    />
  );
}

export const quickSwitcherPlugin = definePlugin({
  id: "quick-switcher",
  name: "Quick switcher",
  description:
    "Jump to any document by name or path, ranked by how often and how recently you open it; " +
    "# for headings, > for commands.",
  activate(ctx) {
    ctx.overlays.register({ id: "quick-switcher", component: QuickSwitcher });
    ctx.commands.register({
      id: "quick-switcher.open",
      title: "Open document…",
      icon: <FileSearchRegular />,
      group: "Navigation",
      keybinding: ["Mod+O", "Mod+P"],
      run: ({ app }) => app.overlays.open("quick-switcher"),
    });
    // Usage stats per device: every document that becomes the focused tab counts as an open.
    let lastDoc: string | null = null;
    return ctx.app.subscribeActiveTab(() => {
      const id = docIdOf(ctx.app.activeTab()?.path);
      if (!id || id === lastDoc) return;
      lastDoc = id;
      ctx.app.storage.set(
        USAGE_KEY,
        recordOpen(ctx.app.storage.get<Usage>(USAGE_KEY) ?? {}, id, Date.now()),
      );
    });
  },
});

export default quickSwitcherPlugin;
