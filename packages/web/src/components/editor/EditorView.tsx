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

  const collectionSchema = (collectionData?.properties as PropertyDefinition[] | null) ?? [];
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
