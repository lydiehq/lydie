// `@` in the editor: mention a page, a date (a `[[YYYY-MM-DD]]` link) or a person (hosted workspaces,
// from `workspace.members`). Every mode offers pages and dates; people only when the backend
// reports members.
import { definePlugin, DocIcon, formatDate, fuzzyScore, useApp } from "@lydie/plugin-api";
import type { AppApi, EditorOverlayProps } from "@lydie/plugin-api";
import {
  createSuggestionStore,
  Extension,
  PluginKey,
  Suggestion,
  SuggestionPopup,
} from "@lydie/plugin-api/editor";
import type { Editor } from "@lydie/plugin-api/editor";
import { CalendarRegular, CommandList } from "@lydie/plugin-api/ui";
import { useEffect } from "react";

import { dateMentions, personHref } from "./suggest.ts";
import type { Mention } from "./suggest.ts";

type Handlers = {
  items: (query: string) => Promise<Mention[]>;
  insert: (editor: Editor, mention: Mention) => void;
};

type Storage = Handlers & {
  store: ReturnType<typeof createSuggestionStore<Mention>>;
  // The overlay, which has the app, sets the handlers through this rather than assigning them
  // itself (the React Compiler gives up on a component that modifies what it was given).
  connect: (handlers: Handlers) => void;
};

const mentionKey = new PluginKey("lydieMentions");
const DATE_FORMAT = "YYYY-MM-DD";

function storageOf(editor: Editor): Storage {
  return (editor.storage as unknown as Record<string, Storage>).lydieMentions!;
}

const Mentions = Extension.create({
  name: "lydieMentions",

  addStorage(): Storage {
    return {
      store: createSuggestionStore<Mention>(),
      items: async () => [],
      insert: () => {},
      // `this`, not a closure over this object: TipTap gives the editor a copy of it.
      connect(this: Storage, { items, insert }: Handlers) {
        this.items = items;
        this.insert = insert;
      },
    };
  },

  addProseMirrorPlugins() {
    const editor = this.editor;
    const storage = this.storage as Storage;
    return [
      Suggestion<Mention, Mention>({
        editor,
        char: "@",
        pluginKey: mentionKey,
        items: async ({ query }) => {
          try {
            return await storage.items(query);
          } catch {
            return [];
          }
        },
        command: ({ editor: e, range, props }) => {
          e.chain().focus().deleteRange(range).run();
          storage.insert(e, props);
        },
        render: storage.store.render,
      }),
    ];
  },
});

async function items(app: AppApi, query: string): Promise<Mention[]> {
  const out: Mention[] = dateMentions(query, new Date(), DATE_FORMAT);
  const q = query.trim();
  try {
    const members = await app.backend.query("workspace.members", {
      workspaceId: app.workspace.workspaceId,
    });
    for (const m of members) {
      const name = m.userName || m.userEmail || m.userId;
      if (q && fuzzyScore(q, name) === null && fuzzyScore(q, m.userEmail ?? "") === null) continue;
      out.push({
        kind: "person",
        label: name,
        userId: m.userId,
        ...(m.userEmail ? { detail: m.userEmail } : {}),
      });
    }
  } catch {
    // No members in this mode (local workspaces).
  }
  if (q) {
    const hits = await app.backend.query("doc.search", {
      workspaceId: app.workspace.workspaceId,
      text: q,
      limit: 8,
    });
    for (const h of hits
      .map((h) => ({ h, s: fuzzyScore(q, h.title) ?? -1000 }))
      .sort((a, b) => b.s - a.s)) {
      out.push({ kind: "page", label: h.h.title || "Untitled", title: h.h.title });
    }
  }
  return out.slice(0, 12);
}

function insert(editor: Editor, mention: Mention) {
  const chain = editor.chain().focus();
  if (mention.kind === "page") {
    chain.insertWikiLink({ target: mention.title }).insertContent(" ").run();
  } else if (mention.kind === "date") {
    chain
      .insertWikiLink({ target: formatDate(mention.date, DATE_FORMAT) })
      .insertContent(" ")
      .run();
  } else {
    chain
      .insertContent([
        {
          type: "text",
          text: `@${mention.label}`,
          marks: [{ type: "link", attrs: { href: personHref(mention.userId) } }],
        },
        { type: "text", text: " " },
      ])
      .run();
  }
}

function MentionMenu({ editor }: EditorOverlayProps) {
  const app = useApp();
  const storage = storageOf(editor);
  useEffect(() => {
    storage.connect({ items: (query) => items(app, query), insert });
  }, [storage, app]);
  return (
    <SuggestionPopup editor={editor} store={storage.store}>
      {(menu) => (
        <CommandList
          aria-label="Mention"
          emptyLabel="No matches"
          {...menu}
          items={menu.items.map((m, i) => ({
            id: `${m.kind}:${i}`,
            title: m.kind === "person" ? `@${m.label}` : m.label,
            ...(m.kind === "person" && m.detail ? { description: m.detail } : {}),
            icon:
              m.kind === "date" ? (
                <CalendarRegular className="size-4" />
              ) : m.kind === "page" ? (
                <DocIcon properties={null} />
              ) : undefined,
          }))}
        />
      )}
    </SuggestionPopup>
  );
}

export const mentionsPlugin = definePlugin({
  id: "mentions",
  name: "Mentions",
  description: "@ to mention a page, a date or (in shared workspaces) a person.",
  activate(ctx) {
    ctx.editor.register({ extensions: () => [Mentions], overlay: MentionMenu });
  },
});

export default mentionsPlugin;
