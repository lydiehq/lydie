import type { HocuspocusProvider } from "@hocuspocus/provider";
import type { CollectionField } from "@lydie/core/collection";
import { queries } from "@lydie/zero/queries";
import type { QueryResultType } from "@rocicorp/zero";
import { useQuery } from "@rocicorp/zero/react";
import type { Editor } from "@tiptap/core";
import { EditorContent } from "@tiptap/react";
import clsx from "clsx";
import { useRef, useState } from "react";

import { PropertyManager } from "@/components/collection";
import { ModuleViewToggle, PageConfigPanel, RecordsTable } from "@/components/modules";
import { usePreloadMentionDocuments } from "@/hooks/use-mention-documents";

import { BottomBar } from "./BottomBar";
import { BubbleMenu } from "./BubbleMenu";
import { CoverImageEditor } from "./CoverImageEditor";
import { DocumentMetadataTabs } from "./DocumentMetadataTabs";
import { EditorToolbar } from "./EditorToolbar";
import { LinkPopover } from "./link-popover/LinkPopover";
import { TableOfContentsMinimap } from "./TableOfContentsMinimap";

type DocumentType = NonNullable<QueryResultType<typeof queries.documents.byId>>;
type CollectionConfig = {
  showChildrenInSidebar?: boolean;
  defaultView?: "documents" | "table";
};

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

  // Fetch the document's collection if it has one
  // Check if this page IS a Collection (has collection_schema)
  const isCollection = doc.collection_schema !== null && Array.isArray(doc.collection_schema);
  const collectionSchema = (doc.collection_schema as CollectionField[] | null) ?? [];

  // Get collection config (only relevant if this is a collection)
  const collectionConfig = (doc.config as CollectionConfig | null) ?? {};

  // If this document belongs to a parent collection, get that collection's schema
  const [docWithCollection] = useQuery(
    doc.collection_id
      ? queries.collections.documentsWithCollection({
          organizationId,
          documentId: doc.id,
        })
      : null,
  );
  const parentCollection = docWithCollection?.collection;
  const parentCollectionSchema = (parentCollection?.collection_schema as CollectionField[] | null) ?? [];

  // View mode state for collection pages
  const [viewMode, setViewMode] = useState<"documents" | "table">(
    isCollection ? (collectionConfig.defaultView ?? "table") : "documents",
  );

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
        <div className="flex mx-auto grow max-w-[65ch] px-4 flex-col pt-12 shrink-0">
          <BubbleMenu editor={contentEditor} />
          <CoverImageEditor
            documentId={doc.id}
            organizationId={doc.organization_id}
            coverImage={doc.cover_image}
          />
          <EditorContent editor={titleEditor} aria-label="Document title" className="my-2" />

          {/* Properties section: show on ALL pages - adding first field makes it a Collection */}
          <div className="my-4 space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-gray-700">
                {isCollection ? "Collection Properties" : "Properties"}
              </span>
              {isCollection && (
                <ModuleViewToggle initialMode={viewMode} onChange={setViewMode} />
              )}
            </div>

            <PropertyManager
              documentId={doc.id}
              organizationId={organizationId}
              schema={collectionSchema}
              isCollection={isCollection}
            />

            {isCollection && (
              <PageConfigPanel
                documentId={doc.id}
                organizationId={organizationId}
                config={collectionConfig}
              />
            )}
          </div>

          {/* Collection view in table mode: show records table if this is a Collection */}
          {isCollection && viewMode === "table" ? (
            <RecordsTable
              collectionId={doc.id}
              organizationId={organizationId}
              organizationSlug={organizationSlug}
              schema={collectionSchema}
            />
          ) : (
            <>
              <DocumentMetadataTabs
                doc={doc}
                collectionSchema={parentCollectionSchema.length > 0 ? parentCollectionSchema : undefined}
              />

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
    </div>
  );
}
