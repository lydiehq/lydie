import { TreeItem, TreeItemContent, Button, MenuTrigger } from "react-aria-components"
import { useParams, useNavigate } from "@tanstack/react-router"
import { Collection } from "react-aria-components"
import { type ReactElement, useRef, useState } from "react"
import {
  FolderSyncRegular,
  ReOrderRegular,
  CubeRegular,
  ArrowClockwiseRegular,
  ArrowRightRegular,
  DocumentFilled,
  ChevronRightFilled,
  MoreHorizontalRegular,
  AddRegular,
  Add12Regular,
  CollectionsEmpty16Filled,
} from "@fluentui/react-icons"
import { composeTailwindRenderProps, focusRing } from "../generic/utils"
import { sidebarItemStyles, sidebarItemIconStyles } from "./Sidebar"
import { DocumentMenu } from "../home-file-explorer/DocumentMenu"
import { Menu, MenuItem } from "../generic/Menu"
import { Tooltip, TooltipTrigger } from "../generic/Tooltip"
import type { QueryResultType } from "@rocicorp/zero"
import { queries } from "@lydie/zero/queries"
import { getIntegrationIconUrl } from "@/utils/integration-icons"
import { useDocumentActions } from "@/hooks/use-document-actions"

type Props = {
  item: {
    id: string
    name: string
    type: "document" | "integration-link" | "integration-group"
    isLocked?: boolean
    children?: Array<{
      id: string
      name: string
      type: "document" | "integration-link" | "integration-group"
      children?: any[]
      integrationLinkId?: string | null
      integrationType?: string
      syncStatus?: string | null
      isLocked?: boolean
    }>
    integrationLinkId?: string | null
    integrationType?: string
    syncStatus?: string | null
  }
  renderItem: (item: any) => ReactElement
  documents: NonNullable<QueryResultType<typeof queries.organizations.documents>>["documents"]
}

export function DocumentTreeItem({ item, renderItem }: Props) {
  const { id: currentDocId } = useParams({ strict: false })
  const navigate = useNavigate()
  const chevronRef = useRef<HTMLButtonElement>(null)
  const [isMenuOpen, setIsMenuOpen] = useState(false)

  const isCurrentDocument = item.type === "document" && currentDocId === item.id
  const isCurrent = isCurrentDocument

  const isIntegrationLink = item.type === "integration-link"
  const isGroup = item.type === "integration-group"
  const isLocked = item.isLocked ?? false

  const handleAction = () => {
    if (isGroup && item.integrationType) {
      navigate({
        to: "/w/$organizationSlug/settings/integrations/$integrationType",
        params: { integrationType: item.integrationType },
        from: "/w/$organizationSlug",
      })
      return
    }

    if (isIntegrationLink) {
      chevronRef.current?.click()
      return
    }

    if (item.type === "document") {
      navigate({
        to: "/w/$organizationSlug/$id",
        params: { id: item.id },
        from: "/w/$organizationSlug",
      })
    }
  }

  return (
    <TreeItem
      id={item.id}
      textValue={item.name}
      onAction={handleAction}
      className={composeTailwindRenderProps(
        focusRing,
        sidebarItemStyles({
          isCurrent,
          className: `
            group
            dragging:opacity-50 dragging:bg-gray-50 
            ${item.type === "document" || isIntegrationLink ? "drop-target:bg-gray-200" : ""}
            ${isGroup ? "cursor-default" : ""}
          `,
        }),
      )}
      style={{
        paddingLeft: `calc(calc(var(--tree-item-level, 1) - 1) * 0.5rem + 0.40rem)`,
        paddingRight: "0.5rem",
      }}
    >
      <TreeItemContent>
        {({ isExpanded, allowsDragging }) => (
          <>
            {/* Always render drag button when dragging is allowed, but visually hide it */}
            {/* Screen readers and keyboard users can still access it */}
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
                <ReOrderRegular className="size-3" />
              </Button>
            )}

            <div className="flex items-center gap-x-1.5 flex-1 min-w-0">
              {/* Render appropriate chevron based on item type */}
              {isGroup && (
                <IntegrationGroupChevron
                  integrationType={item.integrationType}
                  name={item.name}
                  isExpanded={isExpanded}
                />
              )}

              {isIntegrationLink && (
                <IntegrationLinkChevron
                  syncStatus={item.syncStatus}
                  isExpanded={isExpanded}
                  chevronRef={chevronRef}
                  isMenuOpen={isMenuOpen}
                />
              )}

              {item.type === "document" && (
                <DocumentTreeItemIcon
                  isExpanded={isExpanded}
                  chevronRef={chevronRef}
                  hasChildren={item.children !== undefined && item.children.length > 0}
                  isMenuOpen={isMenuOpen}
                />
              )}

              <span className={`truncate ${isLocked ? "text-gray-500 italic" : ""}`}>
                {getDisplayName(item.name)}
              </span>
            </div>

            <div className="items-center gap-1 relative -mr-1">
              <ItemContextMenu
                type={item.type}
                itemId={item.id}
                itemName={item.name}
                integrationLinkId={item.integrationLinkId}
                integrationType={item.integrationType}
                isMenuOpen={isMenuOpen}
                onMenuOpenChange={setIsMenuOpen}
              />
            </div>
          </>
        )}
      </TreeItemContent>
      {item.children && <Collection items={item.children}>{renderItem}</Collection>}
    </TreeItem>
  )
}

function getDisplayName(name: string): string {
  return name.trim() || "Untitled document"
}

function IntegrationGroupChevron({
  integrationType,
  name,
  isExpanded,
}: {
  integrationType?: string
  name: string
  isExpanded: boolean
}) {
  const iconUrl = integrationType ? getIntegrationIconUrl(integrationType) : null

  return (
    <Button
      className={sidebarItemIconStyles({
        className: "p-1 rounded hover:bg-gray-200 -ml-1 group/chevron hover:text-black/60",
      })}
      slot="chevron"
    >
      {iconUrl ? (
        <>
          <img
            src={iconUrl}
            alt={`${name} icon`}
            className="size-3.5 rounded-[2px] group-hover/chevron:hidden"
          />
          <ArrowRightRegular
            className={sidebarItemIconStyles({
              className: `size-3.5 shrink-0 hidden group-hover/chevron:block transition-transform duration-200 ease-in-out  ${
                isExpanded ? "rotate-90" : ""
              }`,
            })}
          />
        </>
      ) : (
        <>
          <CubeRegular
            className={sidebarItemIconStyles({
              className: "size-3.5 group-hover/chevron:hidden",
            })}
          />
          <ArrowRightRegular
            className={`size-3.5 shrink-0 hidden group-hover/chevron:block transition-transform duration-200 ease-in-out  ${
              isExpanded ? "rotate-90" : ""
            }`}
          />
        </>
      )}
    </Button>
  )
}

// Integration Link Chevron - Shows sync icon with loading state
function IntegrationLinkChevron({
  syncStatus,
  isExpanded,
  chevronRef,
  isMenuOpen,
}: {
  syncStatus?: string | null
  isExpanded: boolean
  chevronRef: React.RefObject<HTMLButtonElement | null>
  isMenuOpen: boolean
}) {
  return (
    <Button
      ref={chevronRef}
      className="text-gray-500 p-1 rounded hover:bg-gray-200 -ml-1 group/chevron"
      slot="chevron"
    >
      {syncStatus === "pulling" ? (
        <ArrowClockwiseRegular
          className={sidebarItemIconStyles({
            className: "size-3.5 animate-spin",
          })}
        />
      ) : (
        <>
          <FolderSyncRegular
            className={sidebarItemIconStyles({
              className: `size-3.5 ${isMenuOpen ? "hidden" : "group-hover/chevron:hidden"}`,
            })}
          />
          <ArrowRightRegular
            className={sidebarItemIconStyles({
              className: `size-3.5 shrink-0 ${isMenuOpen ? "block" : "hidden group-hover/chevron:block"} transition-transform duration-200 ease-in-out ${
                isExpanded ? "rotate-90" : ""
              }`,
            })}
          />
        </>
      )}
    </Button>
  )
}

function DocumentTreeItemIcon({
  isExpanded,
  chevronRef,
  hasChildren,
  isMenuOpen,
}: {
  isExpanded: boolean
  chevronRef: React.RefObject<HTMLButtonElement | null>
  hasChildren: boolean
  isMenuOpen: boolean
}) {
  const IconComponent = hasChildren ? CollectionsEmpty16Filled : DocumentFilled

  // If no children, just show the icon (not interactive)
  if (!hasChildren) {
    return (
      <div className="text-gray-500 p-1 -ml-1">
        <IconComponent
          className={sidebarItemIconStyles({
            className: "size-4 shrink-0",
          })}
        />
      </div>
    )
  }

  return (
    <Button
      ref={chevronRef}
      className="text-gray-400 hover:text-gray-700 p-1 -ml-1 group/chevron relative"
      slot="chevron"
    >
      <IconComponent
        className={sidebarItemIconStyles({
          className: `size-4 shrink-0 transition-[opacity_100ms,transform_200ms] ${isMenuOpen ? "opacity-0" : "group-hover:opacity-0"}`,
        })}
      />
      <ChevronRightFilled
        className={sidebarItemIconStyles({
          className: `size-3 shrink-0 absolute inset-0 m-auto ${isMenuOpen ? "opacity-100" : "opacity-0 group-hover:opacity-100"} group-hover/chevron:text-black/50 transition-[opacity_100ms,transform_200ms] ${
            isExpanded ? "rotate-90" : ""
          }`,
        })}
      />
    </Button>
  )
}

function VerticalMenuButton({
  "aria-label": ariaLabel,
  isOpen: _isOpen = false,
  tooltip,
}: {
  "aria-label": string
  isOpen?: boolean
  tooltip?: string
}) {
  const button = (
    <Button className="p-1 text-black hover:text-black/60 group/options" aria-label={ariaLabel}>
      <MoreHorizontalRegular
        className={sidebarItemIconStyles({
          className: "size-4 group-hover/options:text-black/60",
        })}
      />
    </Button>
  )

  if (tooltip) {
    return (
      <TooltipTrigger delay={500}>
        {button}
        <Tooltip placement="top">{tooltip}</Tooltip>
      </TooltipTrigger>
    )
  }

  return button
}

function ItemContextMenu({
  type,
  itemId,
  itemName,
  integrationLinkId,
  integrationType,
  isMenuOpen,
  onMenuOpenChange,
}: {
  type: "document" | "integration-link" | "integration-group"
  itemId: string
  itemName: string
  integrationLinkId?: string | null
  integrationType?: string
  isMenuOpen: boolean
  onMenuOpenChange: (isOpen: boolean) => void
}) {
  const navigate = useNavigate()
  const { createDocument } = useDocumentActions()

  if (type === "integration-group") {
    return null
  }

  if (type === "integration-link") {
    return (
      <div className={`${isMenuOpen ? "flex" : "hidden group-hover:flex"} items-center gap-1`}>
        <TooltipTrigger delay={500}>
          <Button
            className="p-1 text-black hover:text-black/60 group/add"
            aria-label="Add document"
            onPress={() => {
              if (integrationLinkId) {
                createDocument(undefined, integrationLinkId)
              }
            }}
          >
            <AddRegular
              className={sidebarItemIconStyles({
                className: "size-4.5 group-hover/add:text-black/60",
              })}
            />
          </Button>
          <Tooltip placement="top">Add document</Tooltip>
        </TooltipTrigger>
        <MenuTrigger isOpen={isMenuOpen} onOpenChange={onMenuOpenChange}>
          <VerticalMenuButton
            aria-label="Integration link options"
            isOpen={isMenuOpen}
            tooltip="Integration link options"
          />
          <Menu>
            <MenuItem
              onAction={() => {
                if (integrationLinkId && integrationType) {
                  navigate({
                    to: "/w/$organizationSlug/settings/integrations/$integrationType",
                    params: { integrationType },
                    from: "/w/$organizationSlug",
                  })
                }
              }}
            >
              Integration settings
            </MenuItem>
            <MenuItem
              onAction={() => {
                if (integrationLinkId) {
                  createDocument(undefined, integrationLinkId)
                }
              }}
            >
              New document
            </MenuItem>
          </Menu>
        </MenuTrigger>
      </div>
    )
  }

  return (
    <div className={`${isMenuOpen ? "flex" : "hidden group-hover:flex"} items-center gap-1`}>
      <TooltipTrigger delay={500}>
        <Button
          className="p-1 text-black hover:text-black/60 group/add"
          aria-label="Add sub document"
          onPress={() => createDocument(itemId)}
        >
          <Add12Regular
            className={sidebarItemIconStyles({
              className: "size-4 icon-muted",
            })}
          />
        </Button>
        <Tooltip placement="top">Add page inside</Tooltip>
      </TooltipTrigger>
      <MenuTrigger isOpen={isMenuOpen} onOpenChange={onMenuOpenChange}>
        <VerticalMenuButton aria-label="Document options" isOpen={isMenuOpen} tooltip="Document options" />
        <DocumentMenu documentId={itemId} documentName={itemName} />
      </MenuTrigger>
    </div>
  )
}
