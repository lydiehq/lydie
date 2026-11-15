// What a link popover shows: the target document as the tree's hover card shows it (`DocCard`) or,
// for a web link, its address. Read only when the card is open.
import { DocCard, useApp, useBackend, useQuery } from "@lydie/plugin-api";
import type { DocCardSection, OpenOptions } from "@lydie/plugin-api";
import { Button, ExternalLinkRegular } from "@lydie/plugin-api/ui";
import { useEffect, useState } from "react";
import type { ReactNode } from "react";

import { resolveTarget, savedResolution } from "./resolve.ts";
import { hostOf, sectionOf } from "./targets.ts";

export type Resolved = { state: "loading" } | { state: "found"; id: string } | { state: "missing" };

// Resolves a wiki target: live from the source's saved links (`doc.links`, so creating or renaming
// the target updates it), else once through the resolver (a link typed since the last save).
export function useResolved(target: string | null, sourceId: string | null): Resolved {
  const backend = useBackend();
  const links = useQuery("doc.links", target !== null && sourceId ? { id: sourceId } : null);
  const saved = target !== null && !links.isLoading ? savedResolution(links.data, target) : null;
  const [result, setResult] = useState<{ key: string; value: Resolved }>({
    key: "",
    value: { state: "loading" },
  });
  const key = `${sourceId ?? ""}\u0000${target ?? ""}`;
  const pending = target !== null && !saved && !links.isLoading;
  useEffect(() => {
    if (!pending || target === null) return;
    let live = true;
    void resolveTarget(backend, target, sourceId)
      .catch(() => null)
      .then((id) => {
        if (live) setResult({ key, value: id ? { state: "found", id } : { state: "missing" } });
      });
    return () => {
      live = false;
    };
  }, [backend, target, sourceId, key, pending]);
  if (saved) return saved.id ? { state: "found", id: saved.id } : { state: "missing" };
  return result.key === key ? result.value : { state: "loading" };
}

// The linked document in the same card the tree shows on hover; a `#heading` or `#^block` link
// shows that part instead of the opening.
export function DocPreview({
  id,
  heading,
  blockId,
}: {
  id: string;
  heading: string | null;
  blockId: string | null;
}) {
  const app = useApp();
  const part = blockId ? `^${blockId}` : heading;
  const section: DocCardSection | undefined = part
    ? {
        label: part,
        missing: blockId ? "This block no longer exists." : "This heading no longer exists.",
        select: (content, markdown) => {
          const found = sectionOf(content, app.editor.outline(markdown), { heading, blockId });
          return found.found ? found.nodes : null;
        },
      }
    : undefined;
  return <DocCard id={id} section={section} />;
}

export function ExternalPreview({ href, text }: { href: string; text?: string }) {
  if (href.startsWith("lydie:user/"))
    return (
      <div className="flex flex-col gap-1 px-3.5 py-3" data-testid="person-preview">
        <span className="text-[15px] leading-snug font-semibold text-gray-900">
          {text ?? "Person"}
        </span>
        <span className="text-[12.5px] text-gray-500">A person in this workspace</span>
      </div>
    );
  return (
    <div className="flex flex-col gap-1 px-3.5 py-3" data-testid="url-preview">
      <span className="text-[15px] leading-snug font-semibold text-gray-900">{hostOf(href)}</span>
      <span className="truncate text-[12.5px] text-gray-500" title={href}>
        {href}
      </span>
    </div>
  );
}

export function UnresolvedPreview({ target }: { target: string }) {
  return (
    <div className="flex flex-col gap-1 px-3.5 py-3" data-testid="unresolved-preview">
      <span className="text-[15px] leading-snug font-semibold text-gray-900">
        {target || "Untitled"}
      </span>
      <span className="text-[12.5px] text-gray-500">This note does not exist yet.</span>
    </div>
  );
}

// A button with an icon and no text: the label shows as a tooltip on hover and keyboard focus.
export function IconAction({
  label,
  onPress,
  children,
}: {
  label: string;
  onPress: () => void;
  children: ReactNode;
}) {
  return (
    <Button
      size="icon-sm"
      variant="ghost"
      aria-label={label}
      tooltipOptions={{ placement: "top", offset: 8, delay: 200 }}
      onPress={onPress}
    >
      {children}
    </Button>
  );
}

type OpenAction = (mode: OpenOptions["mode"]) => void;

// The three ways to open, the same in every card.
export function OpenButtons({ onOpen, label = "Open" }: { onOpen: OpenAction; label?: string }) {
  const app = useApp();
  return (
    <>
      <Button
        size="sm"
        variant="ghost"
        onPress={(e) =>
          onOpen(
            app.modeFor({
              metaKey: e.metaKey,
              ctrlKey: e.ctrlKey,
              shiftKey: e.shiftKey,
              altKey: e.altKey,
            }),
          )
        }
      >
        <ExternalLinkRegular aria-hidden className="size-3.5" />
        {label}
      </Button>
      <Button size="sm" variant="ghost" aria-label="Open in new tab" onPress={() => onOpen("tab")}>
        New tab
      </Button>
      <Button
        size="sm"
        variant="ghost"
        aria-label="Open to the side"
        onPress={() => onOpen("split")}
      >
        Side
      </Button>
    </>
  );
}

export function CardActions({ children }: { children: ReactNode }) {
  return (
    <div
      role="toolbar"
      aria-label="Link actions"
      className="flex flex-wrap items-center gap-0.5 border-t border-gray-950/5 p-1"
    >
      {children}
    </div>
  );
}
