// A collection's page keeps its own text: the page body (the body slot's `fallback`, the same
// editor any page has) shows above the views as the description when it has content, behind
// "Add a description…" when it has none. The page scrolls past the description to the views,
// which keep at least most of the window so their own (virtualised) scrolling still works.
//
// The editor stays mounted in the same place whether or not the page is a collection: turning a
// page into a collection (or back) must not remount it, or text typed moments ago would be shown
// from a stale copy. A plain page gets wrappers without boxes (`contents`).
import {
  pageColumnClass,
  pageFullWidthOf,
  useIsDatabase,
  useQuerySelect,
  useTabState,
} from "@lydie/plugin-api";
import type { DocumentSlotProps } from "@lydie/plugin-api";
import { useDatabase } from "@lydie/plugin-api/databases";
import { Button } from "@lydie/plugin-api/ui";
import { useEffect, useRef, useState } from "react";

import { DatabaseScreen } from "./lazy.tsx";
import { ScreenSkeleton } from "./skeleton.tsx";

export function CollectionBody({ docId, fallback }: DocumentSlotProps) {
  const { definition, isLoading } = useDatabase(docId);
  const hasText = useQuerySelect("doc.get", { id: docId, includeBody: true }, (s) =>
    Boolean(s.data[0]?.body?.markdown.trim()),
  );
  const fullWidth = useQuerySelect("doc.get", { id: docId, includeBody: true }, (s) =>
    pageFullWidthOf(s.data[0]?.document.properties),
  );
  const [adding, setAdding] = useState(false);
  const [collapsed, setCollapsed] = useTabState<boolean>("db:descriptionCollapsed", false);
  const region = useRef<HTMLElement>(null);
  const shown = hasText || adding;
  const open = shown && !collapsed;
  // The workspace's list of collections (the sidebar's icons use it) usually knows before the
  // collection itself has loaded: its outline shows meanwhile.
  const listed = useIsDatabase(docId);
  const pending = !definition && isLoading && listed;

  // "Add a description" puts the cursor in the editor.
  useEffect(() => {
    if (adding) region.current?.querySelector<HTMLElement>("[data-doc-content]")?.focus();
  }, [adding]);

  return (
    <div className={definition || pending ? "group/page flex min-h-0 grow flex-col" : "contents"}>
      {/* oxlint-disable-next-line jsx-a11y/no-noninteractive-element-interactions -- blur bubbling up from the editor closes an empty description */}
      <section
        ref={region}
        id={`description-${docId}`}
        aria-label={definition ? "Description" : undefined}
        // Not known yet whether this is a collection: laid out as a page, shown once known.
        className={
          definition
            ? open
              ? "shrink-0 [&_[data-doc-content]]:pb-2"
              : "hidden"
            : pending
              ? "hidden"
              : isLoading
                ? "flex grow flex-col opacity-0"
                : "contents"
        }
        data-testid={definition ? "collection-description" : undefined}
        onBlur={(event) => {
          if (!adding || event.currentTarget.contains(event.relatedTarget)) return;
          const text = event.currentTarget.querySelector("[data-doc-content]")?.textContent;
          if (!text?.trim()) setAdding(false);
        }}
      >
        {fallback}
      </section>
      {pending && (
        <>
          <div className="h-6 shrink-0" />
          <ScreenSkeleton fullWidth={fullWidth} />
        </>
      )}
      {definition && (
        <>
          <div className={`${pageColumnClass(fullWidth)} flex h-6 shrink-0 items-center`}>
            {!shown ? (
              // Quiet placeholder text at the size of the page's text, on the shared ghost button.
              <Button
                variant="ghost"
                size="sm"
                onPress={() => setAdding(true)}
                className="-ml-1 px-1 text-[15px] font-normal text-gray-400 hover:text-gray-600"
              >
                Add a description…
              </Button>
            ) : (
              <Button
                variant="ghost"
                size="xs"
                aria-expanded={open}
                aria-controls={`description-${docId}`}
                onPress={() => setCollapsed(!collapsed)}
                className={`-ml-1 px-1 font-normal text-gray-400 hover:text-gray-700 ${open ? "opacity-0 group-hover/page:opacity-100 focus-visible:opacity-100" : ""}`}
              >
                {collapsed ? "Show description" : "Hide description"}
              </Button>
            )}
          </div>
          <div className={`flex flex-col ${open ? "min-h-[70vh] shrink-0 grow" : "min-h-0 grow"}`}>
            <DatabaseScreen definition={definition} stateKey="db" fullWidth={fullWidth} />
          </div>
        </>
      )}
    </div>
  );
}
