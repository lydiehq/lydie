import {
  definePlugin,
  docIdOf,
  docPath,
  docPreviewTarget,
  PageLink,
  useApp,
  useHoverPreview,
  useQuery,
  useQuerySelect,
  useWorkspace,
} from "@lydie/plugin-api";
import type { AppApi, Backlink, JSONContent, TabInfo } from "@lydie/plugin-api";
import {
  Button,
  EmptyState,
  Link2Regular,
  LoadingState,
  NoDocumentIllustration,
  sidebarSectionTitleClass,
} from "@lydie/plugin-api/ui";
import { useState } from "react";
import type { ReactNode } from "react";

import { mentionEdit } from "./mentions.ts";

const PAGE = 50;

function Section({
  title,
  count,
  children,
}: {
  title: string;
  count?: number;
  children: ReactNode;
}) {
  return (
    <section aria-label={title} className="flex flex-col gap-1 px-3 py-3">
      <h3 className={`px-1 ${sidebarSectionTitleClass}`}>
        {title}
        {count !== undefined && count > 0 ? ` · ${count}` : ""}
      </h3>
      {children}
    </section>
  );
}

// A link to a document that previews it on hover.
function DocButton({ id, title }: { id: string; title: string }) {
  const { trigger, preview } = useHoverPreview(docPreviewTarget(id));
  return (
    <>
      <PageLink
        path={docPath(id)}
        title={title}
        {...trigger}
        className="max-w-full truncate rounded-md px-1 text-left text-sm font-medium text-gray-800 hover:bg-gray-950/5"
      >
        {title || "Untitled"}
      </PageLink>
      {preview}
    </>
  );
}

function Snippet({ text }: { text: string }) {
  return (
    <span className="line-clamp-3 text-xs text-gray-500">
      {text.split(/(<mark>.*?<\/mark>)/g).map((part, i) =>
        part.startsWith("<mark>") ? (
          <mark key={i} className="rounded bg-yellow-100 px-0.5 text-gray-900">
            {part.slice(6, -7)}
          </mark>
        ) : (
          <span key={i}>{part}</span>
        ),
      )}
    </span>
  );
}

const key = (s: string) => (s.split("/").pop() ?? s).replace(/\.md$/i, "").trim().toLowerCase();

// Plain text of a block, with links to `title` wrapped in <mark>.
function blockText(node: JSONContent, title: string): string {
  if (node.type === "wikiLink") {
    const a = node.attrs as { target: string; alias: string | null; heading: string | null };
    const label = a.alias ?? [a.target, a.heading].filter(Boolean).join(" > ");
    return key(a.target) === key(title) ? `<mark>${label}</mark>` : label;
  }
  if (node.text !== undefined) {
    const link = node.marks?.find((m) => m.type === "link");
    const href = typeof link?.attrs?.href === "string" ? decodeURIComponent(link.attrs.href) : "";
    return href && key(href.split("#")[0]!) === key(title)
      ? `<mark>${node.text}</mark>`
      : node.text;
  }
  const sep = node.type === "paragraph" || node.type === "heading" ? "" : " ";
  return (node.content ?? []).map((c) => blockText(c, title)).join(sep);
}

function hasLinkTo(node: JSONContent, title: string): boolean {
  return blockText(node, title).includes("<mark>");
}

// Where a source links here: the blocks around each link, read when the row shows.
function Context({ sourceId, title }: { sourceId: string; title: string }) {
  const app = useApp();
  const markdown = useQuerySelect(
    "doc.get",
    { id: sourceId, includeBody: true },
    (s) => s.data[0]?.body?.markdown ?? null,
  );
  if (markdown === null) return null;
  const blocks = (app.editor.fromMarkdown(markdown).content.content ?? []).filter((b) =>
    hasLinkTo(b, title),
  );
  return (
    <div className="flex flex-col gap-0.5 pl-1">
      {blocks.slice(0, 3).map((b, i) => (
        <Snippet key={i} text={blockText(b, title).slice(0, 280)} />
      ))}
    </div>
  );
}

function PartBadge({ link, targetId }: { link: Backlink; targetId: string }) {
  const app = useApp();
  const part = link.targetBlockId ? `^${link.targetBlockId}` : link.targetHeading;
  if (!part) return null;
  return (
    <Button
      size="xs"
      variant="ghost"
      tooltip="Go to the linked part"
      onPress={() =>
        app.open(
          docPath(targetId, {
            blockId: link.targetBlockId ?? undefined,
            heading: link.targetHeading ?? undefined,
          }),
        )
      }
      className="font-normal text-gray-500"
    >
      → {part}
    </Button>
  );
}

function Linked({ id, title }: { id: string; title: string }) {
  const backlinks = useQuery("doc.backlinks", { id });
  const [shown, setShown] = useState(PAGE);
  // One row per linking document, however many links it has.
  const sources = new Map<string, { id: string; title: string; links: Backlink[] }>();
  for (const link of backlinks.data) {
    const row = sources.get(link.source.id) ?? { ...link.source, links: [] };
    row.links.push(link);
    sources.set(link.source.id, row);
  }
  const rows = [...sources.values()];
  return (
    <Section title="Linked mentions" count={rows.length}>
      {backlinks.error ? (
        <p className="px-1 text-xs text-red-600">Could not load backlinks.</p>
      ) : backlinks.isLoading && rows.length === 0 ? (
        <LoadingState />
      ) : rows.length === 0 ? (
        <p className="px-1 text-xs text-gray-400">No documents link here</p>
      ) : (
        <ul aria-label="Backlinks" className="flex flex-col gap-2">
          {rows.slice(0, shown).map((s) => (
            <li key={s.id} className="flex flex-col gap-0.5" data-testid="backlink">
              <div className="flex min-w-0 flex-wrap items-center gap-1">
                <DocButton id={s.id} title={s.title} />
                {[
                  ...new Map(
                    s.links.map((l) => [`${l.targetBlockId}|${l.targetHeading}`, l]),
                  ).values(),
                ].map((l, i) => (
                  <PartBadge key={i} link={l} targetId={id} />
                ))}
              </div>
              {s.links.some((l) => l.sourceProperty) && (
                <span className="pl-1 text-xs text-gray-400">
                  in {s.links.find((l) => l.sourceProperty)!.sourceProperty}
                </span>
              )}
              <Context sourceId={s.id} title={title} />
            </li>
          ))}
        </ul>
      )}
      {rows.length > shown && (
        <Button size="xs" variant="ghost" onPress={() => setShown(shown + PAGE)}>
          Show {Math.min(PAGE, rows.length - shown)} more
        </Button>
      )}
    </Section>
  );
}

// Links the first plain mention in `sourceId` as one undoable operation.
export async function linkMention(app: AppApi, sourceId: string, title: string) {
  const rows = await app.backend.query("doc.get", { id: sourceId, includeBody: true });
  const markdown = rows[0]?.body?.markdown ?? "";
  const edit = mentionEdit(markdown, title);
  if (!edit) throw new Error("The mention is no longer there.");
  await app.backend.ops.doc.updateBody(
    {
      id: sourceId,
      edits: [edit],
      ...(rows[0]?.body ? { expectedVersion: rows[0].body.version } : {}),
    },
    { scope: app.historyScope(), label: `Link “${title}”` },
  );
}

function Unlinked({ id, title }: { id: string; title: string }) {
  const app = useApp();
  const workspace = useWorkspace();
  const [busy, setBusy] = useState<string | null>(null);
  const mentions = useQuery("doc.unlinkedMentions", {
    workspaceId: workspace.workspaceId,
    targetId: id,
    phrases: [title],
    limit: 50,
  });
  return (
    <Section title="Unlinked mentions" count={mentions.data.length}>
      {mentions.data.length === 0 ? (
        <p className="px-1 text-xs text-gray-400">
          {mentions.isLoading ? "Looking…" : "No unlinked mentions"}
        </p>
      ) : (
        <ul aria-label="Unlinked mentions" className="flex flex-col gap-2">
          {mentions.data.map((m) => (
            <li key={m.source.id} className="flex flex-col gap-0.5" data-testid="unlinked-mention">
              <div className="flex min-w-0 items-center gap-1">
                <DocButton id={m.source.id} title={m.source.title} />
                <span className="grow" />
                <Button
                  size="xs"
                  variant="secondary"
                  aria-label={`Link mention in ${m.source.title}`}
                  isDisabled={busy === m.source.id}
                  onPress={() => {
                    setBusy(m.source.id);
                    void linkMention(app, m.source.id, title)
                      .catch((error: unknown) =>
                        app.notify({
                          title: "Could not link",
                          description: error instanceof Error ? error.message : String(error),
                          kind: "error",
                        }),
                      )
                      .finally(() => setBusy(null));
                  }}
                >
                  Link
                </Button>
              </div>
              <div className="pl-1">
                <Snippet text={m.snippet} />
              </div>
            </li>
          ))}
        </ul>
      )}
    </Section>
  );
}

function LinksPanel({ activeTab }: { activeTab: TabInfo | null }) {
  const id = docIdOf(activeTab?.path);
  const title = useQuerySelect(
    "doc.get",
    id ? { id } : null,
    (s) => s.data[0]?.document.title ?? null,
  );
  if (!id)
    return (
      <EmptyState
        illustration={<NoDocumentIllustration size="sm" />}
        title="No document open"
        description="Links to the open document show here."
      />
    );
  return (
    <div data-testid="links-panel">
      {title !== null && <Linked id={id} title={title} />}
      {title !== null && <Unlinked id={id} title={title} />}
    </div>
  );
}

export const backlinksPlugin = definePlugin({
  id: "backlinks",
  name: "Backlinks",
  description:
    "Linked mentions with context (and the heading or block they point at) and unlinked mentions " +
    "you can link in one click.",
  activate(ctx) {
    ctx.panels.register({ id: "links", title: "Links", order: 10, component: LinksPanel });
    ctx.commands.register({
      id: "backlinks.show",
      title: "Show backlinks",
      icon: <Link2Regular />,
      group: "View",
      run: ({ app }) => app.panels.show("links"),
    });
  },
});

export default backlinksPlugin;
