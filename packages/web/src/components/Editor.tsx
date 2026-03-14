import { ChevronRight16Filled, MoreVerticalRegular, ReOrderDotsVertical16Regular } from "@fluentui/react-icons";
import type { HocuspocusProvider } from "@hocuspocus/provider";
import { Button } from "@lydie/ui/components/generic/Button";
import { Menu, MenuItem } from "@lydie/ui/components/generic/Menu";
import { mutators } from "@lydie/zero/mutators";
import { queries } from "@lydie/zero/queries";
import type { QueryResultType } from "@rocicorp/zero";
import { useQuery } from "@rocicorp/zero/react";
import { Link } from "@tanstack/react-router";
import type { Editor as TiptapEditor } from "@tiptap/core";
import DragHandle from "@tiptap/extension-drag-handle-react";
import { EditorContent } from "@tiptap/react";
import clsx from "clsx";
import { useAtom, useAtomValue, useSetAtom } from "jotai";
import {
  Fragment,
  type CSSProperties,
  type RefObject,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { MenuTrigger } from "react-aria-components";
import { toast } from "sonner";

import { editorSessions, pendingChangeStatusAtom, pendingEditorChangeAtom } from "@/atoms/editor";
import { documentTabsAtom, makeTabPersistentAtom } from "@/atoms/tabs";
import {
  isFloatingAssistantDockedAtom as isDockedAtom,
  isFloatingAssistantOpenAtom as isOpenAtom,
} from "@/atoms/workspace-settings";
import { BottomBar } from "@/components/editor/BottomBar";
import { BubbleMenu } from "@/components/editor/BubbleMenu";
import { CoverImageEditor } from "@/components/editor/CoverImageEditor";
import { DocumentSettingsDialog } from "@/components/editor/DocumentSettingsDialog";
import { LinkPopover } from "@/components/editor/link-popover/LinkPopover";
import { StatusBar } from "@/components/editor/StatusBar";
import { TableOfContentsMinimap } from "@/components/editor/TableOfContentsMinimap";
import { useAuth } from "@/context/auth.context";
import { useDocumentActions } from "@/hooks/use-document-actions";
import { usePreloadMentionDocuments } from "@/hooks/use-mention-documents";
import { useZero } from "@/services/zero";
import { applyDocumentChange } from "@/utils/apply-document-change";

type Props = {
  doc: NonNullable<QueryResultType<typeof queries.documents.byId>>;
  organizationId: string;
  organizationSlug: string;
};

const DRAG_HANDLE_NESTED_CONFIG = { edgeDetection: { threshold: -16 } };

export function Editor({ doc, organizationId, organizationSlug }: Props) {
  const z = useZero();
  const { user } = useAuth();
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  const [pendingChange, setPendingChange] = useAtom(pendingEditorChangeAtom);
  const setPendingChangeStatus = useSetAtom(pendingChangeStatusAtom);
  const isDocked = useAtomValue(isDockedAtom);
  const isAssistantOpen = useAtomValue(isOpenAtom);
  const makeTabPersistent = useSetAtom(makeTabPersistentAtom);
  const tabs = useAtomValue(documentTabsAtom);

  // Mutable refs for event handlers to avoid repeated subscriptions.
  const lastSyncedRef = useRef<{ id: string; title: string } | null>(null);
  const hasMadePersistentRef = useRef(false);
  const serverTitleRef = useRef(doc.title || "");
  const isPreviewTabRef = useRef(false);
  const zeroRef = useRef(z);

  serverTitleRef.current = doc.title || "";
  isPreviewTabRef.current = tabs.some((tab) => tab.documentId === doc.id && tab.mode === "preview");
  zeroRef.current = z;

  // When assistant is undocked and open, shift content left to avoid overlap
  const shouldShiftContent = !isDocked && isAssistantOpen;

  // Get or create editor sessions synchronously during render.
  const session = user
    ? editorSessions.getOrCreate(
        doc.id,
        user.name,
        doc.yjs_state,
        doc.title || "",
        organizationId,
        organizationSlug,
        z,
      )
    : null;

  if (lastSyncedRef.current?.id !== doc.id) {
    hasMadePersistentRef.current = false;
  }

  // Sync title when document changes, but defer command execution to a microtask
  // to avoid dispatching TipTap updates while React is in a render/commit lifecycle.
  // useEffect(() => {
  //   if (!session) {
  //     return;
  //   }

  //   const expectedTitle = doc.title || "";
  //   const needsSync =
  //     lastSyncedRef.current?.id !== doc.id || lastSyncedRef.current?.title !== expectedTitle;

  //   if (!needsSync || session.titleEditor.isFocused) {
  //     return;
  //   }

  //   let isCancelled = false;

  //   queueMicrotask(() => {
  //     if (isCancelled) {
  //       return;
  //     }

  //     if (session.titleEditor.isFocused) {
  //       return;
  //     }

  //     session.titleEditor.commands.setContent({
  //       type: "doc",
  //       content: [
  //         {
  //           type: "heading",
  //           attrs: { level: 1 },
  //           content: expectedTitle ? [{ type: "text", text: expectedTitle }] : [],
  //         },
  //       ],
  //     });
  //     lastSyncedRef.current = { id: doc.id, title: expectedTitle };
  //   });

  //   return () => {
  //     isCancelled = true;
  //   };
  // }, [session, doc.id, doc.title]);

  useEffect(() => {
    if (!session) {
      return;
    }

    const onEditorUpdate = () => {
      if (isPreviewTabRef.current && !hasMadePersistentRef.current) {
        hasMadePersistentRef.current = true;
        makeTabPersistent(doc.id);
      }
    };

    session.contentEditor.on("update", onEditorUpdate);
    session.titleEditor.on("update", onEditorUpdate);

    return () => {
      session.contentEditor.off("update", onEditorUpdate);
      session.titleEditor.off("update", onEditorUpdate);
    };
  }, [session, doc.id, makeTabPersistent]);

  useEffect(() => {
    if (!session) {
      return;
    }

    const handleBlur = () => {
      const finalTitle = session.titleEditor.getText().trim();
      if (finalTitle !== serverTitleRef.current) {
        zeroRef.current.mutate(
          mutators.document.update({
            documentId: doc.id,
            title: finalTitle,
            organizationId: doc.organization_id,
          }),
        );
      }
    };

    const titleDom = session.titleEditor.view.dom as HTMLElement;
    titleDom.addEventListener("blur", handleBlur, true);

    return () => {
      titleDom.removeEventListener("blur", handleBlur, true);
    };
  }, [session, doc.id, doc.organization_id]);

  // Apply pending changes
  useEffect(() => {
    if (!pendingChange) return;
    if (pendingChange.documentId !== doc.id) return;
    if (!session) return;

    const applyPendingChange = async () => {
      setPendingChangeStatus("applying");
      toast.info("Applying changes...");

      try {
        const result = await applyDocumentChange({
          titleEditor: session.titleEditor,
          contentEditor: session.contentEditor,
          documentId: doc.id,
          organizationId: pendingChange.organizationId,
          title: pendingChange.title,
          replace: pendingChange.replace,
          selectionWithEllipsis: pendingChange.selectionWithEllipsis,
          z,
        });

        if (result.usedLLMFallback) {
          console.info("✨ LLM-assisted replacement was used for this change");
        }

        if (!result.titleSuccess && result.titleError) {
          console.error("Failed to apply title change:", result.titleError);
        }

        if (!result.contentSuccess && result.contentError) {
          console.error("Failed to apply content changes:", result.contentError);
        }

        if (result.success) {
          setPendingChangeStatus("applied");
          toast.success("Changes applied successfully");
        } else {
          setPendingChangeStatus("failed");
          toast.error("Failed to apply changes");
        }
      } catch (error) {
        setPendingChangeStatus("failed");
        console.error("Failed to apply pending change:", error);
        toast.error("Failed to apply changes");
      } finally {
        setTimeout(() => {
          setPendingChange(null);
          setPendingChangeStatus(null);
        }, 1000);
      }
    };

    const timeoutId = setTimeout(() => {
      void applyPendingChange();
    }, 100);

    return () => {
      clearTimeout(timeoutId);
    };
  }, [session, doc.id, pendingChange, setPendingChange, setPendingChangeStatus, z]);

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

  if (!session) {
    return null;
  }

  return (
    <EditorLayout
      doc={doc}
      contentEditor={session.contentEditor}
      titleEditor={session.titleEditor}
      provider={session.provider}
      shouldShiftContent={shouldShiftContent}
      organizationId={organizationId}
      organizationSlug={organizationSlug}
      documentTitle={documentTitle}
      collectionData={collectionData ?? null}
      ancestorDocuments={ancestorDocuments}
      scrollContainerRef={scrollContainerRef}
    />
  );
}

type EditorLayoutProps = {
  doc: NonNullable<QueryResultType<typeof queries.documents.byId>>;
  contentEditor: TiptapEditor;
  titleEditor: TiptapEditor;
  provider: HocuspocusProvider | null;
  shouldShiftContent: boolean;
  organizationId: string;
  organizationSlug: string;
  documentTitle: string;
  collectionData: NonNullable<QueryResultType<typeof queries.collections.byId>> | null;
  ancestorDocuments: Array<{ id: string; title: string | null }>;
  scrollContainerRef: RefObject<HTMLDivElement | null>;
};

function EditorLayout({
  doc,
  contentEditor,
  titleEditor,
  provider,
  shouldShiftContent,
  organizationId,
  organizationSlug,
  documentTitle,
  collectionData,
  ancestorDocuments,
  scrollContainerRef,
}: EditorLayoutProps) {
  const z = useZero();
  const { deleteDocument } = useDocumentActions();
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);

  return (
    <div
      className="overflow-hidden flex flex-col grow relative size-full"
      data-testid="editor-view"
    >
      <nav
        aria-label="Document breadcrumbs"
        className="p-2 flex items-center justify-between gap-2 text-xs text-gray-400"
      >
        <div className="flex min-w-0 items-center gap-1">
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
        </div>

        <MenuTrigger>
          <Button intent="ghost" size="icon-sm" aria-label="Document Options">
            <MoreVerticalRegular className="size-3.5 text-gray-600" />
          </Button>
          <Menu>
            <MenuItem
              onAction={() => {
                z.mutate(
                  mutators.document.update({
                    documentId: doc.id,
                    fullWidth: !doc.full_width,
                    organizationId: doc.organization_id,
                  }),
                );
              }}
            >
              {doc.full_width ? "Disable Full Width" : "Enable Full Width"}
            </MenuItem>
            <MenuItem onAction={() => setIsSettingsOpen(true)}>Settings</MenuItem>
            <MenuItem onAction={() => deleteDocument(doc.id, true)}>Delete</MenuItem>
          </Menu>
        </MenuTrigger>
      </nav>

      <DocumentSettingsDialog
        key={doc.id}
        isOpen={isSettingsOpen}
        onOpenChange={setIsSettingsOpen}
        doc={doc}
      />

      <StatusBar provider={provider} />
      <TableOfContentsMinimap editor={contentEditor} containerRef={scrollContainerRef} />

      <div
        ref={scrollContainerRef}
        className="flex flex-row grow overflow-y-auto relative scrollbar-thumb-rounded-full scrollbar-track-rounded-full scrollbar scrollbar-thumb-gray-200 scrollbar-track-white"
      >
        <div className={clsx("mx-auto flex w-full grow shrink-0 flex-col pt-12")}>
          <BubbleMenu editor={contentEditor} />

          <div
            data-testid="document-width-container"
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
          </div>

          <LinkPopover
            editor={contentEditor}
            organizationId={organizationId}
            organizationSlug={organizationSlug}
          />

          <DragHandle editor={contentEditor} nested={DRAG_HANDLE_NESTED_CONFIG}>
            <div className="cursor-grab items-center justify-center rounded transition-colors text-gray-400 hover:text-gray-600 active:cursor-grabbing">
              <ReOrderDotsVertical16Regular className="size-4" aria-hidden="true" />
            </div>
          </DragHandle>

          <EditorContent
            data-testid="editor-content"
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
