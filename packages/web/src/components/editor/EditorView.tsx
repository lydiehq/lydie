import { AppFolder16Filled, DismissRegular } from "@fluentui/react-icons";
import type { HocuspocusProvider } from "@hocuspocus/provider";
import type { PropertyDefinition } from "@lydie/core/collection";
import { Button } from "@lydie/ui/components/generic/Button";
import { Dialog } from "@lydie/ui/components/generic/Dialog";
import { Drawer } from "@lydie/ui/components/generic/Drawer";
import { queries } from "@lydie/zero/queries";
import type { QueryResultType } from "@rocicorp/zero";
import { useQuery } from "@rocicorp/zero/react";
import type { Editor } from "@tiptap/core";
import { EditorContent } from "@tiptap/react";
import clsx from "clsx";
import { useRef, useState } from "react";
import { Heading } from "react-aria-components";

import { PropertyManager } from "@/components/collection";
import { ModuleViewToggle, PageConfigPanel, RecordsTable } from "@/components/modules";
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
  isLocked: boolean;
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
  isLocked,
  shouldShiftContent,
  organizationId,
  organizationSlug,
}: Props) {
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  // Fetch the document's collection schema if this document IS a Collection
  const [collectionSchemaData] = useQuery(
    queries.collections.byId({
      organizationId,
      collectionId: doc.id,
    }),
  );

  // Check if this document IS a Collection (has a collection_schemas row)
  const isCollection = collectionSchemaData !== null && collectionSchemaData !== undefined;
  const collectionSchema = (collectionSchemaData?.properties as PropertyDefinition[] | null) ?? [];
  const showChildrenInSidebar = doc.show_children_in_sidebar ?? true;

  // If this document belongs to a parent collection, get that collection's schema
  const [parentCollectionData] = useQuery(
    doc.nearest_collection_id
      ? queries.collections.byId({
          organizationId,
          collectionId: doc.nearest_collection_id,
        })
      : null,
  );

  const parentCollectionSchema =
    (parentCollectionData?.properties as PropertyDefinition[] | null) ?? [];
  const canManageCollectionSettings = isAdmin || parentCollectionSchema.length > 0;

  // View mode state for collection pages (only admins can use table view)
  const [viewMode, setViewMode] = useState<"documents" | "table">(
    isCollection && isAdmin ? "table" : "documents",
  );
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);

  // Preload documents for the @ mention feature
  usePreloadMentionDocuments(organizationId);

  return (
    <div
      className="overflow-hidden flex flex-col grow relative size-full"
      data-testid="editor-view"
    >
      <EditorToolbar editor={contentEditor} doc={doc} />

      {isLocked && (
        <div
          className="px-4 py-2 bg-gray-50 border-b border-gray-200 text-xs text-gray-500"
          data-testid="locked-notice"
        >
          This page is managed by an integration and cannot be edited.
        </div>
      )}

      <TableOfContentsMinimap editor={contentEditor} containerRef={scrollContainerRef} />

      <div
        ref={scrollContainerRef}
        className="flex flex-row grow overflow-y-auto relative scrollbar-thumb-rounded-full scrollbar-track-rounded-full scrollbar scrollbar-thumb-gray-200 scrollbar-track-white"
      >
        {/* Main content area */}
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
          <EditorContent editor={titleEditor} aria-label="Document title" className="my-2" />

          <div
            className={clsx(
              "my-3 flex items-center gap-x-2",
              isCollection && isAdmin ? "justify-between" : "justify-end",
            )}
          >
            {isCollection && isAdmin && (
              <ModuleViewToggle initialMode={viewMode} onChange={setViewMode} />
            )}

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

          {/* Collection view in table mode: Only show for admins */}
          {isCollection && isAdmin && viewMode === "table" ? (
            <div className="shrink-0 pb-5 editor-content-reset">
              <RecordsTable
                collectionId={doc.id}
                organizationId={organizationId}
                organizationSlug={organizationSlug}
                schema={collectionSchema}
              />
            </div>
          ) : (
            <>
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
            </>
          )}
        </div>

        {/* Handles shifting content left when assistant is undocked and open */}
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
            {canManageCollectionSettings && (
              <div className="space-y-4 pb-4 border-b border-black/6">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-x-1">
                    <AppFolder16Filled className="size-4 icon-muted" />
                    <span className="text-sm font-medium text-gray-700">
                      {isCollection ? "Collection setup" : "Collection properties"}
                    </span>
                  </div>
                  {isCollection && isAdmin && (
                    <ModuleViewToggle initialMode={viewMode} onChange={setViewMode} />
                  )}
                </div>

                <PropertyManager
                  documentId={doc.id}
                  organizationId={organizationId}
                  schema={collectionSchema}
                  isCollection={isCollection}
                  isAdmin={isAdmin}
                />

                {isCollection && isAdmin && (
                  <PageConfigPanel
                    documentId={doc.id}
                    organizationId={organizationId}
                    config={{ showChildrenInSidebar }}
                  />
                )}
              </div>
            )}

            <EditorSidebarPanels
              doc={doc}
              collectionSchema={
                parentCollectionSchema.length > 0 ? parentCollectionSchema : undefined
              }
            />
          </div>
        </Dialog>
      </Drawer>
    </div>
  );
}
