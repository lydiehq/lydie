// `![[note]]`, `![[note#heading]]`, `![[note#^block]]` (read-only transclusion with an "open"
// affordance) and `![[image.png]]` (an attachment) inside the editor.
import {
  DocIcon,
  docPath,
  PageLink,
  useApp,
  useBackend,
  useQuery,
  useWorkspace,
} from "@lydie/plugin-api";
import type { OpenMode } from "@lydie/plugin-api";
import { Button, buttonStyles, ExternalLinkRegular } from "@lydie/plugin-api/ui";
import { useEffect, useState } from "react";

import { useResolved } from "./LinkCard.tsx";
import { MiniDoc } from "./MiniDoc.tsx";
import { createNoteFor, follow } from "./open.ts";
import { isExternalHref, isImageTarget, parseWikiTarget, sectionOf } from "./targets.ts";

function useAttachmentUrl(filename: string): { url: string | null; missing: boolean } {
  const backend = useBackend();
  const workspace = useWorkspace();
  const { data, isLoading } = useQuery("attachment.list", { workspaceId: workspace.workspaceId });
  const name = filename.split("/").pop()!.toLowerCase();
  const attachment = data.find((a) => a.filename.toLowerCase() === name);
  const [url, setUrl] = useState<{ id: string; url: string | null } | null>(null);
  useEffect(() => {
    if (!attachment) return;
    let live = true;
    let made: string | null = null;
    void backend.attachments.url(attachment.id).then((u) => {
      made = u;
      if (live) setUrl({ id: attachment.id, url: u });
      else if (u?.startsWith("blob:")) URL.revokeObjectURL(u);
    });
    return () => {
      live = false;
      if (made?.startsWith("blob:")) URL.revokeObjectURL(made);
    };
  }, [backend, attachment]);
  return {
    url: attachment && url?.id === attachment.id ? url.url : null,
    missing: !isLoading && !attachment,
  };
}

// Heights of the images shown so far: an attachment's URL is made asynchronously, and a page
// opened again keeps the room for it meanwhile.
const imageHeights = new Map<string, number>();

function ImageEmbed({ target }: { target: string }) {
  const external = isExternalHref(target);
  const local = useAttachmentUrl(external ? "" : target);
  const src = external ? target : local.url;
  const height = imageHeights.get(target);
  if (!src) {
    if (!local.missing && height) return <div aria-busy="true" style={{ height }} />;
    return (
      <div className="rounded-md bg-gray-50 px-3 py-2 text-xs text-gray-500">
        {local.missing ? `Attachment not found: ${target}` : "Loading image…"}
      </div>
    );
  }
  return (
    <img
      src={src}
      alt={target}
      className="max-h-[480px] max-w-full rounded-md"
      // Until it has loaded, the room it took last time.
      style={height ? { minHeight: height } : undefined}
      onLoad={(event) => {
        const img = event.currentTarget;
        img.style.minHeight = "";
        if (img.offsetHeight > 0) imageHeights.set(target, img.offsetHeight);
      }}
    />
  );
}

export function EmbedBlock({ target, sourceId }: { target: string; sourceId?: string | null }) {
  const app = useApp();
  const link = parseWikiTarget(target);
  const image = isImageTarget(link.target);
  const resolved = useResolved(image ? null : link.target, sourceId ?? null);
  if (image) return <ImageEmbed target={link.target} />;
  return (
    <div
      data-testid="embed"
      className="my-1 flex flex-col rounded-lg border border-gray-950/8 bg-gray-50/60"
    >
      {resolved.state === "found" ? (
        <EmbeddedDoc
          id={resolved.id}
          heading={link.heading}
          blockId={link.blockId}
          onOpen={(mode) => void follow(app, link, sourceId ?? null, mode)}
        />
      ) : resolved.state === "missing" ? (
        <div className="flex items-center gap-2 px-3 py-2 text-sm text-gray-500">
          <span className="grow">“{link.target}” does not exist yet.</span>
          <Button
            size="sm"
            variant="secondary"
            onPress={() =>
              void createNoteFor(app, link.target, sourceId ?? null).then((id) => app.openDoc(id))
            }
          >
            Create note
          </Button>
        </div>
      ) : (
        <div className="h-10" aria-busy="true" />
      )}
    </div>
  );
}

function EmbeddedDoc({
  id,
  heading,
  blockId,
  onOpen,
}: {
  id: string;
  heading: string | null;
  blockId: string | null;
  onOpen: (mode: OpenMode) => void;
}) {
  const app = useApp();
  const { data } = useQuery("doc.get", { id, includeBody: true });
  const entry = data[0];
  if (!entry) return <div className="h-10" aria-busy="true" />;
  const markdown = entry.body?.markdown ?? "";
  const content = app.editor.fromMarkdown(markdown).content;
  const section = sectionOf(content, app.editor.outline(markdown), { heading, blockId });
  const part = blockId ? `^${blockId}` : heading;
  return (
    <>
      <div className="flex items-center gap-1.5 px-3 pt-2 text-xs text-gray-500">
        <DocIcon properties={entry.document.properties} />
        <span className="truncate font-medium text-gray-700">{entry.document.title}</span>
        {part && <span className="truncate">› {part}</span>}
        <span className="grow" />
        <PageLink
          path={docPath(id, { heading: heading ?? undefined, blockId: blockId ?? undefined })}
          title={entry.document.title}
          aria-label={`Open ${entry.document.title}`}
          onOpen={onOpen}
          className={buttonStyles({ size: "sm", variant: "ghost" })}
        >
          <ExternalLinkRegular aria-hidden className="size-3.5" />
          Open
        </PageLink>
      </div>
      <div className="px-3 pb-2">
        {section.found ? (
          section.nodes.length ? (
            <MiniDoc nodes={section.nodes} limit={40} />
          ) : (
            <p className="py-1 text-xs text-gray-400">Empty note</p>
          )
        ) : (
          <p className="py-1 text-xs text-gray-500">
            {blockId ? "This block no longer exists." : "This heading no longer exists."}
          </p>
        )}
      </div>
    </>
  );
}
