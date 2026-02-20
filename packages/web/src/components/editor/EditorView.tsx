import { AppFolder16Filled, ChevronRightRegular, DismissRegular } from "@fluentui/react-icons";
import type { HocuspocusProvider } from "@hocuspocus/provider";
import type { PropertyDefinition } from "@lydie/core/collection";
import { Button } from "@lydie/ui/components/generic/Button";
import { Dialog } from "@lydie/ui/components/generic/Dialog";
import { Drawer } from "@lydie/ui/components/generic/Drawer";
import { queries } from "@lydie/zero/queries";
import type { QueryResultType } from "@rocicorp/zero";
import { useQuery } from "@rocicorp/zero/react";
import { Link } from "@tanstack/react-router";
import type { Editor } from "@tiptap/core";
import { EditorContent } from "@tiptap/react";
import clsx from "clsx";
import { Fragment, useMemo, useRef, useState } from "react";
import { Heading } from "react-aria-components";

import { usePreloadMentionDocuments } from "@/hooks/use-mention-documents";

import { BottomBar } from "./BottomBar";
import { BubbleMenu } from "./BubbleMenu";
import { CoverImageEditor } from "./CoverImageEditor";
import { EditorSidebarPanels } from "./EditorSidebarPanels";
import { EditorToolbar } from "./EditorToolbar";
import { LinkPopover } from "./link-popover/LinkPopover";
import { TableOfContentsMinimap } from "./TableOfContentsMinimap";

type DocumentType = NonNullable<QueryResultType<typeof queries.documents.byId>>;

export interface Props {
  doc: DocumentType;
  contentEditor: Editor;
  titleEditor: Editor;
  provider: HocuspocusProvider | null;
  isAdmin: boolean;
  shouldShiftContent: boolean;
  organizationId: string;
  organizationSlug: string;
}

export function EditorView({
  doc,
  contentEditor,
  titleEditor,
  provider,
  isAdmin,
  shouldShiftContent,
  organizationId,
  organizationSlug,
}: Props) {
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  const [collectionData] = useQuery(
    doc.collection_id
      ? queries.collections.byId({
          organizationId,
          collectionId: doc.collection_id,
        })
      : null,
  );

  const [documents] = useQuery(
    doc.parent_id ? queries.documents.byUpdated({ organizationId }) : null,
  );

  const collectionSchema = (collectionData?.properties as PropertyDefinition[] | null) ?? [];
  const documentTitle = doc.title?.trim() || "Untitled";
  const ancestorDocuments = useMemo(() => {
    if (!doc.parent_id || !documents) {
      return [];
    }

    const documentById = new Map(documents.map((document) => [document.id, document]));
    const visited = new Set<string>();
    const ancestors: Array<{ id: string; title: string | null }> = [];

    let currentParentId: string | null = doc.parent_id;

    while (currentParentId && !visited.has(currentParentId)) {
      visited.add(currentParentId);

      const parent = documentById.get(currentParentId);
      if (!parent) {
        break;
      }

      ancestors.push({ id: parent.id, title: parent.title });
      currentParentId = parent.parent_id;
    }

    return ancestors.reverse();
  }, [doc.parent_id, documents]);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);

  usePreloadMentionDocuments(organizationId);

  return (
    <div
      className="overflow-hidden flex flex-col grow relative size-full"
      data-testid="editor-view"
    >
      <EditorToolbar editor={contentEditor} doc={doc} />

      <TableOfContentsMinimap editor={contentEditor} containerRef={scrollContainerRef} />

      <div
        ref={scrollContainerRef}
        className="flex flex-row grow overflow-y-auto relative scrollbar-thumb-rounded-full scrollbar-track-rounded-full scrollbar scrollbar-thumb-gray-200 scrollbar-track-white"
      >
        <div
          className={clsx(
            "flex mx-auto w-full grow flex-col pt-12 shrink-0 transition-[max-width] duration-300 ease-in-out",
            doc.full_width ? "max-w-none px-20" : "max-w-[65ch] px-4",
          )}
        >
          <BubbleMenu editor={contentEditor} />
          <CoverImageEditor
            documentId={doc.id}
            organizationId={doc.organization_id}
            coverImage={doc.cover_image}
          />

          <nav
            aria-label="Document breadcrumbs"
            className="my-2 flex min-h-5 items-center gap-1 text-sm text-gray-500"
          >
            <Link
              to="/w/$organizationSlug"
              params={{ organizationSlug }}
              className="truncate rounded px-1 py-0.5 transition-colors hover:bg-gray-100 hover:text-gray-700"
            >
              Workspace
            </Link>

            {collectionData ? (
              <>
                <ChevronRightRegular className="size-3.5 shrink-0 text-gray-400" aria-hidden="true" />
                <Link
                  to="/w/$organizationSlug/collections/$collectionId"
                  params={{
                    organizationSlug,
                    collectionId: collectionData.id,
                  }}
                  className="truncate rounded px-1 py-0.5 transition-colors hover:bg-gray-100 hover:text-gray-700"
                >
                  {collectionData.name || "Untitled Collection"}
                </Link>
              </>
            ) : null}

            {ancestorDocuments.map((ancestor) => (
              <Fragment key={ancestor.id}>
                <ChevronRightRegular className="size-3.5 shrink-0 text-gray-400" aria-hidden="true" />
                <Link
                  to="/w/$organizationSlug/$id"
                  params={{
                    organizationSlug,
                    id: ancestor.id,
                  }}
                  className="truncate rounded px-1 py-0.5 transition-colors hover:bg-gray-100 hover:text-gray-700"
                >
                  {ancestor.title?.trim() || "Untitled"}
                </Link>
              </Fragment>
            ))}

            <ChevronRightRegular className="size-3.5 shrink-0 text-gray-400" aria-hidden="true" />
            <span className="truncate px-1 py-0.5 text-gray-800">{documentTitle}</span>
          </nav>

          <EditorContent editor={titleEditor} aria-label="Document title" className="my-2" />

          <div className="my-3 flex items-center gap-x-2 justify-end">
            <Button
              intent="ghost"
              size="sm"
              className="gap-x-1"
              onPress={() => setIsSidebarOpen(true)}
            >
              <AppFolder16Filled className="size-4 icon-muted" />
              <span>Page details</span>
            </Button>
          </div>

          <LinkPopover
            editor={contentEditor}
            organizationId={organizationId}
            organizationSlug={organizationSlug}
          />

          <EditorContent
            aria-label="Document content"
            editor={contentEditor}
            className="block grow"
          />
        </div>

        <div
          className={clsx(
            "shrink-0 transition-[width] duration-500 ease-in-out",
            shouldShiftContent ? "max-2xl:w-[170px]" : "w-0",
          )}
        />
      </div>

      <BottomBar editor={contentEditor} provider={provider} isAdmin={isAdmin} />

      <Drawer isOpen={isSidebarOpen} onOpenChange={setIsSidebarOpen} isDismissable size="md">
        <Dialog className="h-full flex flex-col">
          <div className="px-4 py-3 border-b border-gray-200 flex items-center justify-between">
            <Heading slot="title" className="text-sm font-medium text-gray-700">
              Page details
            </Heading>
            <Button
              intent="ghost"
              size="icon-sm"
              aria-label="Close sidebar"
              onPress={() => setIsSidebarOpen(false)}
            >
              <DismissRegular className="size-4" />
            </Button>
          </div>

          <div className="p-4 space-y-4 overflow-y-auto grow">
            <EditorSidebarPanels doc={doc} collectionSchema={collectionSchema} />
          </div>
        </Dialog>
      </Drawer>
    </div>
  );
}
