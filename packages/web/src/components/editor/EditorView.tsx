import {
  ChevronRight12Filled,
  ChevronRight16Filled,
  ChevronRightRegular,
} from "@fluentui/react-icons";
import type { HocuspocusProvider } from "@hocuspocus/provider";
import type { PropertyDefinition } from "@lydie/core/collection";
import { queries } from "@lydie/zero/queries";
import type { QueryResultType } from "@rocicorp/zero";
import { useQuery } from "@rocicorp/zero/react";
import { Link } from "@tanstack/react-router";
import type { Editor } from "@tiptap/core";
import DragHandle from "@tiptap/extension-drag-handle-react";
import { EditorContent } from "@tiptap/react";
import clsx from "clsx";
import { Fragment, type CSSProperties, useMemo, useRef } from "react";

import { usePreloadMentionDocuments } from "@/hooks/use-mention-documents";

import { BottomBar } from "./BottomBar";
import { BubbleMenu } from "./BubbleMenu";
import { CoverImageEditor } from "./CoverImageEditor";
import { DocumentDetails } from "./DocumentDetails";
import { LinkPopover } from "./link-popover/LinkPopover";
import { StatusBar } from "./StatusBar";
import { TableOfContentsMinimap } from "./TableOfContentsMinimap";

type DocumentType = NonNullable<QueryResultType<typeof queries.documents.byId>>;

const DRAG_HANDLE_NESTED_CONFIG = { edgeDetection: { threshold: -16 } };

export interface Props {
  doc: DocumentType;
  contentEditor: Editor;
  titleEditor: Editor;
  provider: HocuspocusProvider | null;
  shouldShiftContent: boolean;
  organizationId: string;
  organizationSlug: string;
}

export function EditorView({
  doc,
  contentEditor,
  titleEditor,
  provider,
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

  usePreloadMentionDocuments(organizationId);

  return (
    <div
      className="overflow-hidden flex flex-col grow relative size-full"
      data-testid="editor-view"
    >
      <nav
        aria-label="Document breadcrumbs"
        className="mx-auto flex py-1 items-center gap-1 text-xs text-gray-400"
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
            <ChevronRight16Filled className="size-3 shrink-0 text-gray-300" aria-hidden="true" />
            <Link
              to="/w/$organizationSlug/collections/$collectionId"
              params={{
                organizationSlug,
                collectionId: collectionData.id,
              }}
              className="truncate rounded px-1 py-0.5 transition-colors hover:text-gray-700"
            >
              {collectionData.name || "Untitled Collection"}
            </Link>
          </>
        ) : null}

        {ancestorDocuments.map((ancestor) => (
          <Fragment key={ancestor.id}>
            <ChevronRight16Filled className="size-3 shrink-0 text-gray-300" aria-hidden="true" />
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

        <ChevronRight16Filled className="size-3 shrink-0 text-gray-300" aria-hidden="true" />
        <span className="truncate px-1 py-0.5 text-gray-600">{documentTitle}</span>
      </nav>
      <StatusBar provider={provider} />

      <TableOfContentsMinimap editor={contentEditor} containerRef={scrollContainerRef} />

      <div
        ref={scrollContainerRef}
        className="flex flex-row grow overflow-y-auto relative scrollbar-thumb-rounded-full scrollbar-track-rounded-full scrollbar scrollbar-thumb-gray-200 scrollbar-track-white"
      >
        <div className={clsx("mx-auto flex w-full grow shrink-0 flex-col pt-12")}>
          <BubbleMenu editor={contentEditor} />

          <div
            className={clsx(
              "mx-auto w-full",
              doc.full_width ? "max-w-none px-20" : "max-w-[680px] px-4",
            )}
          >
            <CoverImageEditor
              documentId={doc.id}
              organizationId={doc.organization_id}
              coverImage={doc.cover_image}
            />

            <EditorContent editor={titleEditor} aria-label="Document title" className="my-2" />

            <div className="my-4">
              <DocumentDetails doc={doc} collectionSchema={collectionSchema} />
            </div>
          </div>

          <LinkPopover
            editor={contentEditor}
            organizationId={organizationId}
            organizationSlug={organizationSlug}
          />

          <DragHandle editor={contentEditor} nested={DRAG_HANDLE_NESTED_CONFIG}>
            <div className="flex size-6 cursor-grab items-center justify-center rounded text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600 active:cursor-grabbing">
              <div className="grid grid-cols-2 gap-0.5">
                <span className="size-0.5 rounded-full bg-current" />
                <span className="size-0.5 rounded-full bg-current" />
                <span className="size-0.5 rounded-full bg-current" />
                <span className="size-0.5 rounded-full bg-current" />
                <span className="size-0.5 rounded-full bg-current" />
                <span className="size-0.5 rounded-full bg-current" />
              </div>
            </div>
          </DragHandle>

          <EditorContent
            aria-label="Document content"
            editor={contentEditor}
            className={clsx(
              "block grow",
              doc.full_width
                ? "[--editor-block-max-width:none] [--editor-block-padding-x:5rem]"
                : undefined,
            )}
            style={
              {
                "--editor-content-line-start": doc.full_width
                  ? "5rem"
                  : "max(1rem, calc((100% - 680px) / 2 + 1rem))",
              } as CSSProperties
            }
          />
        </div>

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
