import type { HocuspocusProvider } from "@hocuspocus/provider";
import { queries } from "@lydie/zero/queries";
import type { QueryResultType } from "@rocicorp/zero";
import { useQuery } from "@rocicorp/zero/react";
import type { Editor } from "@tiptap/core";
import { EditorContent } from "@tiptap/react";
import clsx from "clsx";
import { useRef, useState } from "react";

import { PropertyManager } from "@/components/database";
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
type SchemaField = {
  field: string;
  type: "text" | "number" | "select" | "boolean" | "datetime" | "file";
  required: boolean;
  options?: string[];
};
type PageConfig = {
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

  // Check if this page has a child schema (acts as a database/collection parent)
  const childSchema = (doc.child_schema as SchemaField[] | null) ?? [];
  const hasSchema = childSchema.length > 0;

  // Show database UI for all pages (allows adding first property)
  const showDatabaseSection = true;

  // Get page config for settings
  const pageConfig = (doc.page_config as PageConfig | null) ?? {};

  // Check if this is a child document (has a parent)
  const parentId = doc.parent_id;
  const isChild = !!parentId;

  // Fetch parent's schema if this is a child document
  const [parentDoc] = useQuery(
    isChild && parentId
      ? queries.documents.byId({
          organizationId,
          documentId: parentId,
        })
      : null,
  );

  const parentSchema = (parentDoc?.child_schema as SchemaField[] | null) ?? [];

  // View mode state for database pages
  const [viewMode, setViewMode] = useState<"documents" | "table">(
    hasSchema ? (pageConfig.defaultView ?? "table") : "documents",
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

          {/* Database section: always show property manager, conditionally show toggle/config */}
          {showDatabaseSection && (
            <div className="my-4 space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-gray-700">Properties</span>
                {hasSchema && <ModuleViewToggle initialMode={viewMode} onChange={setViewMode} />}
              </div>

              <PropertyManager
                documentId={doc.id}
                organizationId={organizationId}
                schema={childSchema}
              />

              {hasSchema && (
                <PageConfigPanel
                  documentId={doc.id}
                  organizationId={organizationId}
                  config={pageConfig}
                />
              )}
            </div>
          )}

          {/* Database parent in table view: show records table */}
          {hasSchema && viewMode === "table" ? (
            <RecordsTable
              parentId={doc.id}
              organizationId={organizationId}
              organizationSlug={organizationSlug}
              schema={childSchema}
            />
          ) : (
            <>
              <DocumentMetadataTabs
                doc={doc}
                parentSchema={parentSchema.length > 0 ? parentSchema : undefined}
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
