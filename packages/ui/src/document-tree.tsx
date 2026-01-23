import { Tree, TreeItem, TreeItemContent, Button, Collection } from "react-aria-components"
import type { ReactElement, ReactNode } from "react"
import type { DocumentTreeItem } from "./types"
import { sidebarItemStyles, sidebarItemIconStyles } from "./styles"
import type { Key } from "react-aria-components"

export type DocumentTreeProps = {
  items: DocumentTreeItem[]
  expandedKeys?: Set<Key>
  onExpandedChange?: (keys: Set<Key>) => void
  onItemAction?: (itemId: string, item: DocumentTreeItem) => void
  currentDocumentId?: string
  renderItemIcon?: (item: DocumentTreeItem, isExpanded: boolean, hasChildren: boolean) => ReactNode
  renderItemActions?: (item: DocumentTreeItem) => ReactNode
  enableDragDrop?: boolean
  dragAndDropHooks?: any
}

export function DocumentTree({
  items,
  expandedKeys,
  onExpandedChange,
  onItemAction,
  currentDocumentId,
  renderItemIcon,
  renderItemActions,
  enableDragDrop = false,
  dragAndDropHooks,
}: DocumentTreeProps) {
  const renderItem = (item: DocumentTreeItem): ReactElement => (
    <DocumentTreeItemComponent
      item={item}
      renderItem={renderItem}
      currentDocumentId={currentDocumentId}
      onItemAction={onItemAction}
      renderItemIcon={renderItemIcon}
      renderItemActions={renderItemActions}
    />
  )

  return (
    <Tree
      aria-label="Documents"
      selectionMode="single"
      className="flex flex-col focus:outline-none"
      items={items}
      dragAndDropHooks={enableDragDrop ? dragAndDropHooks : undefined}
      expandedKeys={expandedKeys}
      onExpandedChange={onExpandedChange}
    >
      {renderItem}
    </Tree>
  )
}

type DocumentTreeItemComponentProps = {
  item: DocumentTreeItem
  renderItem: (item: DocumentTreeItem) => ReactElement
  currentDocumentId?: string
  onItemAction?: (itemId: string, item: DocumentTreeItem) => void
  renderItemIcon?: (item: DocumentTreeItem, isExpanded: boolean, hasChildren: boolean) => ReactNode
  renderItemActions?: (item: DocumentTreeItem) => ReactNode
}

function DocumentTreeItemComponent({
  item,
  renderItem,
  currentDocumentId,
  onItemAction,
  renderItemIcon,
  renderItemActions,
}: DocumentTreeItemComponentProps) {
  const isCurrentDocument = item.type === "document" && currentDocumentId === item.id
  const hasChildren = item.children !== undefined && item.children.length > 0
  const isLocked = item.isLocked ?? false

  const handleAction = () => {
    onItemAction?.(item.id, item)
  }

  return (
    <TreeItem
      id={item.id}
      textValue={item.name}
      onAction={handleAction}
      className={sidebarItemStyles({
        isCurrent: isCurrentDocument,
        className: `
          group
          dragging:opacity-50 dragging:bg-gray-50 
          ${item.type === "document" ? "drop-target:bg-gray-200" : ""}
          focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500
        `,
      })}
      style={{
        paddingLeft: `calc(calc(var(--tree-item-level, 1) - 1) * 0.5rem + 0.40rem)`,
        paddingRight: "0.5rem",
      }}
    >
      <TreeItemContent>
        {({ isExpanded, allowsDragging }) => (
          <>
            {allowsDragging && (
              <Button
                slot="drag"
                className="absolute w-px h-px -m-px overflow-hidden whitespace-nowrap border-0"
                style={{
                  clip: "rect(0, 0, 0, 0)",
                  clipPath: "inset(50%)",
                }}
                aria-label={`Drag ${item.name}`}
              >
                <span className="sr-only">Drag</span>
              </Button>
            )}

            <div className="flex items-center gap-x-1.5 flex-1 min-w-0">
              {renderItemIcon && renderItemIcon(item, isExpanded, hasChildren)}

              <span className={`truncate ${isLocked ? "text-gray-500 italic" : ""}`}>
                {item.name.trim() || "Untitled document"}
              </span>
            </div>

            {renderItemActions && (
              <div className="items-center gap-1 relative -mr-1">{renderItemActions(item)}</div>
            )}
          </>
        )}
      </TreeItemContent>
      {item.children && <Collection items={item.children}>{renderItem}</Collection>}
    </TreeItem>
  )
}
