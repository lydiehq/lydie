import type { queries } from "@lydie/zero/queries";
import type { QueryResultType } from "@rocicorp/zero";
import type { Editor } from "@tiptap/core";

import { EditorContent } from "@tiptap/react";
import clsx from "clsx";
import { useRef } from "react";

import { BottomBar } from "./BottomBar";
import { BubbleMenu } from "./BubbleMenu";
import { CoverImageEditor } from "./CoverImageEditor";
import { DocumentMetadataTabs } from "./DocumentMetadataTabs";
import { EditorToolbar } from "./EditorToolbar";
import { LinkPopover } from "./link-popover/LinkPopover";

type DocumentType = NonNullable<QueryResultType<typeof queries.documents.byId>>;

export interface Props {
  doc: DocumentType;
  contentEditor: Editor;
  titleEditor: Editor;
  isLocked: boolean;
  shouldShiftContent: boolean;
  organizationId: string;
  organizationSlug: string;
}

export function EditorView({
  doc,
  contentEditor,
  titleEditor,
  isLocked,
  shouldShiftContent,
  organizationId,
  organizationSlug,
}: Props) {
  const scrollContainerRef = useRef<HTMLDivElement>(null);

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

      <div
        ref={scrollContainerRef}
        className="flex flex-row grow overflow-y-auto relative scrollbar-thumb-rounded-full scrollbar-track-rounded-full scrollbar scrollbar-thumb-gray-200 scrollbar-track-white"
      >
        <div className="flex mx-auto grow max-w-[65ch] px-4 flex-col pt-12 shrink-0">
          <BubbleMenu editor={contentEditor} />
          <CoverImageEditor
            documentId={doc.id}
            organizationId={doc.organization_id}
            coverImage={doc.cover_image}
          />

          <EditorContent editor={titleEditor} aria-label="Document title" className="my-2" />

          <DocumentMetadataTabs
            doc={doc}
            initialFields={(doc.custom_fields as Record<string, string | number>) || {}}
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
        </div>

        {/* Handles shifting content left when assistant is undocked and open */}
        <div
          className={clsx(
            "shrink-0 transition-[width] duration-500 ease-in-out",
            shouldShiftContent ? "max-2xl:w-[170px]" : "w-0",
          )}
        />
      </div>

      <BottomBar editor={contentEditor} />
    </div>
  );
}
