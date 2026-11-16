// Hover previews for links outside the editor (backlinks, search results, the tree). The card's
// content comes from a `links.register({ kind: "preview" })` contribution, so a plugin owns what
// a preview shows and every list gets the same card.
import { FloatingCard } from "@lydie/ui";
import { useCallback, useEffect, useRef, useState } from "react";
import type { FocusEvent, KeyboardEvent, PointerEvent, ReactNode } from "react";

import { ContributionBoundary } from "./contribution-boundary.tsx";
import { DOC_CARD_CLASS } from "./doc-card.tsx";
import { useContributions } from "./react.tsx";

export const PREVIEW_OPEN_DELAY = 450;
export const PREVIEW_CLOSE_DELAY = 180;

// The preview target for a known document: `doc:<id>`, optionally with `#Heading` or `#^block`.
export function docPreviewTarget(
  id: string,
  part?: { heading?: string | null; blockId?: string | null },
): string {
  if (part?.blockId) return `doc:${id}#^${part.blockId}`;
  if (part?.heading) return `doc:${id}#${part.heading}`;
  return `doc:${id}`;
}

export type HoverPreviewTrigger = {
  onPointerEnter(event: PointerEvent): void;
  onPointerLeave(event: PointerEvent): void;
  onFocus(event: FocusEvent): void;
  onBlur(event: FocusEvent): void;
  onKeyDown(event: KeyboardEvent): void;
};

// Spread `trigger` on the link element and render `preview` anywhere (it portals). The card opens
// after a short hover (or on keyboard focus), stays open while the pointer is over either, and
// closes on Escape. Nothing is queried until it opens.
export function useHoverPreview(
  target: string | null,
  sourceId?: string | null,
): { trigger: HoverPreviewTrigger; preview: ReactNode; open: boolean } {
  const renderers = useContributions("link");
  const renderer = target
    ? renderers.find((r) => r.kind === "preview" && r.match(target))
    : undefined;
  const [anchorEl, setAnchorEl] = useState<HTMLElement | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const keyboard = useRef(false);

  const clear = () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
  };
  const show = (el: HTMLElement, delay: number) => {
    clear();
    timer.current = setTimeout(() => setAnchorEl(el), delay);
  };
  const hide = (delay: number) => {
    clear();
    timer.current = setTimeout(() => setAnchorEl(null), delay);
  };
  useEffect(() => clear, []);

  const anchor = useCallback(
    () => (anchorEl?.isConnected ? anchorEl.getBoundingClientRect() : null),
    [anchorEl],
  );

  const trigger: HoverPreviewTrigger = {
    onPointerEnter: (event) => {
      if (renderer && event.pointerType !== "touch")
        show(event.currentTarget as HTMLElement, PREVIEW_OPEN_DELAY);
    },
    onPointerLeave: () => {
      if (!keyboard.current) hide(PREVIEW_CLOSE_DELAY);
    },
    onFocus: (event) => {
      const el = event.currentTarget as HTMLElement;
      // Keyboard focus only (a click focuses too, and would flash the card).
      if (renderer && el.matches(":focus-visible")) {
        keyboard.current = true;
        show(el, PREVIEW_OPEN_DELAY);
      }
    },
    onBlur: (event) => {
      keyboard.current = false;
      const next = event.relatedTarget as Node | null;
      if (!next || !document.querySelector("[data-hover-preview]")?.contains(next)) hide(0);
    },
    onKeyDown: (event) => {
      if (event.key === "Escape" && anchorEl) {
        event.preventDefault();
        event.stopPropagation();
        clear();
        setAnchorEl(null);
      }
    },
  };

  const preview =
    anchorEl && renderer && target ? (
      <FloatingCard
        anchor={anchor}
        data-hover-preview=""
        className={DOC_CARD_CLASS}
        role="dialog"
        aria-label="Link preview"
        onPointerEnter={clear}
        onPointerLeave={() => hide(PREVIEW_CLOSE_DELAY)}
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            setAnchorEl(null);
            anchorEl.focus();
          }
        }}
      >
        <ContributionBoundary pluginId={renderer.pluginId} label="Link preview" compact>
          <renderer.component target={target} sourceId={sourceId ?? null} />
        </ContributionBoundary>
      </FloatingCard>
    ) : null;

  return { trigger, preview, open: anchorEl !== null };
}
