import { Placeholder } from "@lydie/editor/extensions";
import { sidebarItemStyles, sidebarItemIconStyles } from "@lydie/ui/components/editor/styles";
import { EditorContent, ReactNodeViewRenderer, useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { type ReactElement, useEffect, useMemo, useState } from "react";
import {
  Button,
  Collection,
  type Key,
  Tree,
  TreeItem,
  TreeItemContent,
} from "react-aria-components";

import { PlaceholderComponent } from "./PlaceholderComponent";

// SVG Icon Components
const CollectionsIcon = ({ className }: { className?: string }) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width="16"
    height="16"
    viewBox="0 0 16 16"
    className={className}
  >
    <path
      fill="currentColor"
      d="M2.854 2.121a2.5 2.5 0 0 0-1.768 3.062L2.12 9.047A2.5 2.5 0 0 0 5 10.857V8a3 3 0 0 1 3-3h2.354L9.78 2.854a2.5 2.5 0 0 0-3.062-1.768zM6 8a2 2 0 0 1 2-2h5a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2z"
    />
  </svg>
);

const DocumentIcon = ({ className }: { className?: string }) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width="16"
    height="16"
    viewBox="0 0 48 48"
    className={className}
  >
    <path
      fill="currentColor"
      d="M24 4H12.25A4.25 4.25 0 0 0 8 8.25v31.5A4.25 4.25 0 0 0 12.25 44h23.5A4.25 4.25 0 0 0 40 39.75V20H28.25A4.25 4.25 0 0 1 24 15.75zm15.626 13.5a4.3 4.3 0 0 0-.87-1.263L27.762 5.245a4.3 4.3 0 0 0-1.263-.871V15.75c0 .966.784 1.75 1.75 1.75z"
    />
  </svg>
);

const ChevronRightIcon = ({ className }: { className?: string }) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width="12"
    height="12"
    viewBox="0 0 12 12"
    className={className}
  >
    <path
      fill="currentColor"
      d="M2.22 4.47a.75.75 0 0 1 1.06 0L6 7.19l2.72-2.72a.75.75 0 0 1 1.06 1.06L6.53 8.78a.75.75 0 0 1-1.06 0L2.22 5.53a.75.75 0 0 1 0-1.06"
    />
  </svg>
);

type DocumentTreeItem = {
  id: string;
  name: string;
  type: "document";
  children?: DocumentTreeItem[];
  isLocked?: boolean;
};

type TemplateDocument = {
  id: string;
  title: string;
  content: any; // TipTap JSON content
  children?: TemplateDocument[];
};

type TemplateViewerProps = {
  documents: TemplateDocument[];
};

export function TemplateViewer({ documents }: TemplateViewerProps) {
  const [selectedDocId, setSelectedDocId] = useState<string>(documents[0]?.id || "");

  // Convert template documents to tree items
  const treeItems = useMemo((): DocumentTreeItem[] => {
    const convertToTreeItem = (doc: TemplateDocument): DocumentTreeItem => ({
      id: doc.id,
      name: doc.title,
      type: "document" as const,
      children: doc.children?.map(convertToTreeItem),
      isLocked: false,
    });

    return documents.map(convertToTreeItem);
  }, [documents]);

  // Collect all item IDs recursively to keep tree fully expanded by default
  const getAllItemIds = useMemo((): Set<Key> => {
    const collectIds = (items: DocumentTreeItem[]): Set<string> => {
      const ids = new Set<string>();
      for (const item of items) {
        if (item.children && item.children.length > 0) {
          ids.add(item.id);
          const childIds = collectIds(item.children);
          childIds.forEach((id) => ids.add(id));
        }
      }
      return ids;
    };
    return collectIds(treeItems) as Set<Key>;
  }, [treeItems]);

  // Find currently selected document
  const selectedDoc = useMemo(() => {
    const findDoc = (docs: TemplateDocument[]): TemplateDocument | null => {
      for (const doc of docs) {
        if (doc.id === selectedDocId) return doc;
        if (doc.children) {
          const found = findDoc(doc.children);
          if (found) return found;
        }
      }
      return null;
    };
    return findDoc(documents);
  }, [documents, selectedDocId]);

  // Title editor (read-only)
  const titleEditor = useEditor({
    extensions: [StarterKit],
    content: selectedDoc?.title || "",
    editable: false,
    immediatelyRender: false,
    editorProps: {
      attributes: {
        class: "text-3xl font-medium text-gray-950 mb-6",
      },
    },
  });

  const contentEditor = useEditor({
    extensions: [
      StarterKit,
      Placeholder.configure({
        addNodeView: () => ReactNodeViewRenderer(PlaceholderComponent, { as: "span" }),
      }),
    ],
    content: selectedDoc?.content || { type: "doc", content: [] },
    editable: false,
    immediatelyRender: false,
    editorProps: {
      attributes: {
        class: "prose prose-lg max-w-none focus:outline-none",
      },
    },
  });

  // Update editor content when selected document changes
  useEffect(() => {
    if (titleEditor && selectedDoc) {
      titleEditor.commands.setContent(selectedDoc.title || "");
    }
  }, [titleEditor, selectedDoc?.title, selectedDoc]);

  useEffect(() => {
    if (contentEditor && selectedDoc) {
      contentEditor.commands.setContent(selectedDoc.content || "");
    }
  }, [contentEditor, selectedDoc?.content, selectedDoc]);

  const handleItemAction = (itemId: string) => {
    setSelectedDocId(itemId);
  };

  const renderItem = (item: DocumentTreeItem): ReactElement => {
    const hasChildren = item.children !== undefined && item.children.length > 0;
    const isCurrentDocument = selectedDocId === item.id;
    const isLocked = item.isLocked ?? false;

    return (
      <TreeItem
        key={item.id}
        id={item.id}
        textValue={item.name}
        onAction={() => handleItemAction(item.id)}
        className={sidebarItemStyles({ isCurrent: isCurrentDocument })}
        style={{
          paddingLeft: `calc(calc(var(--tree-item-level, 1) - 1) * 0.5rem + 0.40rem)`,
          paddingRight: "0.5rem",
        }}
        data-nosnippet
      >
        <TreeItemContent>
          {({ isExpanded }) => (
            <>
              <div className="flex items-center gap-x-1.5 flex-1 min-w-0">
                {/* Document icon with chevron on hover for items with children */}
                {hasChildren ? (
                  <Button
                    slot="chevron"
                    className="text-gray-400 hover:text-gray-700 p-1 -ml-1 group/chevron relative cursor-default"
                  >
                    <CollectionsIcon
                      className={`size-4 shrink-0 ${sidebarItemIconStyles()} transition-[opacity_100ms,transform_200ms] group-hover:opacity-0`}
                    />
                    <ChevronRightIcon
                      className={`size-3 shrink-0 absolute inset-0 m-auto opacity-0 group-hover:opacity-100 group-hover/chevron:text-black/50 transition-[opacity_100ms,transform_200ms] ${
                        isExpanded ? "rotate-90" : ""
                      }`}
                    />
                  </Button>
                ) : (
                  <div className="text-gray-500 p-1 -ml-1">
                    <DocumentIcon className={`size-4 shrink-0 ${sidebarItemIconStyles()}`} />
                  </div>
                )}

                <span className={`truncate ${isLocked ? "text-gray-500 italic" : ""}`}>
                  {item.name.trim() || "Untitled document"}
                </span>
              </div>
            </>
          )}
        </TreeItemContent>
        {item.children && <Collection items={item.children}>{renderItem}</Collection>}
      </TreeItem>
    );
  };

  return (
    <div className="flex gap-x-1 bg-[#f8f8f8] rounded-xl border border-black/10 shadow-inner p-1.5">
      {/* Sidebar */}
      <div className="shrink-0 flex w-[240px] flex-col rounded-lg">
        <div className="flex flex-col grow min-h-0">
          <div className="flex items-center justify-between shrink-0 px-3 pt-3">
            <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
              Documents
            </span>
          </div>
          <div className="min-h-0 overflow-y-auto scrollbar-thumb-rounded-full scrollbar-track-rounded-full scrollbar scrollbar-thumb-gray-200 scrollbar-track-white px-2 py-2">
            <Tree
              aria-label="Documents"
              selectionMode="single"
              className="flex flex-col focus:outline-none"
              items={treeItems}
              defaultExpandedKeys={getAllItemIds}
            >
              {renderItem}
            </Tree>
          </div>
        </div>
      </div>

      {/* Editor */}
      <div className="bg-white rounded-lg w-full grow overflow-hidden shadow-surface h-[600px]">
        <div className="h-full flex flex-col overflow-hidden">
          <div className="overflow-hidden flex flex-col grow">
            <div className="flex py-8 overflow-y-auto grow flex-col scrollbar-thumb-rounded-full scrollbar-track-rounded-full scrollbar scrollbar-thumb-gray-200 scrollbar-track-white relative px-4">
              <div className="mx-auto w-full h-full max-w-[65ch] pb-8 flex flex-col">
                <EditorContent editor={titleEditor} aria-label="Document title" />
                <EditorContent
                  aria-label="Document content"
                  editor={contentEditor}
                  className="block grow editor-content"
                />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
