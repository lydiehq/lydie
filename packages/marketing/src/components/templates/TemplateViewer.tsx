import type { ReactElement } from "react";
import type { Key } from "react-aria-components";

import { CollectionsEmpty16Filled } from "@fluentui/react-icons";
import { Placeholder } from "@lydie/editor/extensions";
import { sidebarItemIconStyles, sidebarItemStyles } from "@lydie/ui/components/editor/styles";
import { CollapseArrow } from "@lydie/ui/components/icons/CollapseArrow";
import { DocumentIcon } from "@lydie/ui/components/icons/DocumentIcon";
import { EditorContent, ReactNodeViewRenderer, useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { useEffect, useMemo, useState } from "react";
import { Button, Collection, Tree, TreeItem, TreeItemContent } from "react-aria-components";

import { PlaceholderComponent } from "./PlaceholderComponent";

type TemplateDocument = {
  id: string;
  title: string;
  content: any; // TipTap JSON content
  children?: TemplateDocument[];
};

type DocumentTreeItem = {
  id: string;
  name: string;
  type: "document";
  children?: DocumentTreeItem[];
  isLocked: boolean;
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
          paddingLeft: `calc(calc(var(--tree-item-level, 1) - 1) * 0.5rem + 0.5rem)`,
          paddingRight: "0.5rem",
        }}
        data-nosnippet
      >
        <TreeItemContent>
          {({ isExpanded }) => (
            <div className="flex items-center gap-x-1 flex-1 min-w-0">
              {/* Document icon with chevron on hover for items with children */}
              {hasChildren ? (
                <Button
                  slot="chevron"
                  className="text-gray-400 hover:text-gray-700 p-1 -ml-0.5 group/chevron relative size-5 rounded-md hover:bg-black/5 flex items-center justify-center"
                >
                  <CollectionsEmpty16Filled
                    className={sidebarItemIconStyles({
                      className:
                        "size-4 shrink-0 transition-[opacity_100ms,transform_200ms] group-hover:opacity-0",
                    })}
                  />
                  <CollapseArrow
                    className={sidebarItemIconStyles({
                      className: `size-3 shrink-0 absolute opacity-0 group-hover:opacity-100 text-black/45! transition-[opacity_100ms,transform_200ms] ${
                        isExpanded ? "rotate-90" : ""
                      }`,
                    })}
                  />
                </Button>
              ) : (
                <div className="text-gray-500 p-1 -ml-1 flex">
                  <DocumentIcon
                    className={sidebarItemIconStyles({
                      className: "size-4 shrink-0",
                    })}
                  />
                </div>
              )}

              <span className={`truncate ${isLocked ? "text-gray-500 italic" : ""}`}>
                {item.name.trim() || "Untitled document"}
              </span>
            </div>
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
