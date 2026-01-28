import type { QueryResultType } from "@rocicorp/zero";

import {
  Add12Regular,
  ArrowClockwiseRegular,
  ArrowRightRegular,
  CollectionsEmpty16Filled,
  CubeRegular,
  FolderSyncRegular,
  MoreHorizontalRegular,
  ReOrderRegular,
} from "@fluentui/react-icons";
import { queries } from "@lydie/zero/queries";
import { useNavigate, useParams } from "@tanstack/react-router";
import { type ReactElement, useState } from "react";
import { Button, MenuTrigger, TreeItem, TreeItemContent } from "react-aria-components";
import { Collection } from "react-aria-components";

import { useDocumentActions } from "@/hooks/use-document-actions";
import { getIntegrationIconUrl } from "@/utils/integration-icons";

import { DocumentMenu } from "../documents/DocumentMenu";
import { Menu, MenuItem } from "@lydie/ui/components/generic/Menu";
import { Tooltip, TooltipTrigger } from "@lydie/ui/components/generic/Tooltip";
import { composeTailwindRenderProps, focusRing } from "@lydie/ui/components/generic/utils";
import { CollapseArrow } from "../icons/CollapseArrow";
import { DocumentIcon } from "../icons/DocumentIcon";
import { sidebarItemIconStyles, sidebarItemStyles } from "./Sidebar";

type Props = {
  item: {
    id: string;
    name: string;
    type: "document" | "integration-link" | "integration-group";
    isLocked?: boolean;
    children?: Array<{
      id: string;
      name: string;
      type: "document" | "integration-link" | "integration-group";
      children?: any[];
      integrationLinkId?: string | null;
      integrationType?: string;
      syncStatus?: string | null;
      isLocked?: boolean;
    }>;
    integrationLinkId?: string | null;
    integrationType?: string;
    syncStatus?: string | null;
  };
  renderItem: (item: any) => ReactElement;
  documents: NonNullable<QueryResultType<typeof queries.organizations.documents>>["documents"];
};

export function DocumentTreeItem({ item, renderItem }: Props) {
  const { id: currentDocId } = useParams({ strict: false });
  const navigate = useNavigate();
  const [isMenuOpen, setIsMenuOpen] = useState(false);

  const isCurrentDocument = item.type === "document" && currentDocId === item.id;
  const isCurrent = isCurrentDocument;

  const isIntegrationLink = item.type === "integration-link";
  const isGroup = item.type === "integration-group";
  const isLocked = item.isLocked ?? false;

  const handleAction = () => {
    if (isGroup && item.integrationType) {
      navigate({
        to: "/w/$organizationSlug/settings/integrations/$integrationType",
        params: { integrationType: item.integrationType },
        from: "/w/$organizationSlug",
      });
      return;
    }

    if (item.type === "document") {
      navigate({
        to: "/w/$organizationSlug/$id",
        params: { id: item.id },
        from: "/w/$organizationSlug",
      });
    }
  };

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
        paddingLeft: `calc(calc(var(--tree-item-level, 1) - 1) * 0.5rem + 0.5rem)`,
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

            <div className="flex items-center gap-x-1 flex-1 min-w-0">
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
                  isMenuOpen={isMenuOpen}
                />
              )}

              {item.type === "document" && (
                <DocumentTreeItemIcon
                  isExpanded={isExpanded}
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
  );
}

function getDisplayName(name: string): string {
  return name.trim() || "Untitled document";
}

function IntegrationGroupChevron({
  integrationType,
  name,
  isExpanded,
}: {
  integrationType?: string;
  name: string;
  isExpanded: boolean;
}) {
  const iconUrl = integrationType ? getIntegrationIconUrl(integrationType) : null;

  return (
    <Button
      className={sidebarItemIconStyles({
        className: "p-1 rounded hover:bg-black/5 -ml-1 group/chevron hover:text-black/60",
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
          <CollapseArrow
            className={sidebarItemIconStyles({
              className: `size-3.5 shrink-0 hidden group-hover/chevron:block transition-transform duration-200 ease-in-out  ${
                isExpanded ? "rotate-90" : ""
              }`,
            })}
          />

          {/* <ArrowRightRegular
            className={sidebarItemIconStyles({
              className: `size-3.5 shrink-0 hidden group-hover/chevron:block transition-transform duration-200 ease-in-out  ${
                isExpanded ? "rotate-90" : ""
              }`,
            })}
          /> */}
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
  );
}

// Integration Link Chevron - Shows sync icon with loading state
function IntegrationLinkChevron({
  syncStatus,
  isExpanded,
  isMenuOpen,
}: {
  syncStatus?: string | null;
  isExpanded: boolean;
  isMenuOpen: boolean;
}) {
  return (
    <Button
      className="text-gray-500 p-1 rounded hover:bg-black/5 active:bg-black/10 -ml-1 group/chevron"
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
  );
}

function DocumentTreeItemIcon({
  isExpanded,
  hasChildren,
  isMenuOpen,
}: {
  isExpanded: boolean;
  hasChildren: boolean;
  isMenuOpen: boolean;
}) {
  // If no children, just show the icon (not interactive)
  if (!hasChildren) {
    return (
      <div className="text-gray-500 p-1 -ml-1 flex">
        <DocumentIcon
          className={sidebarItemIconStyles({
            className: "size-4 shrink-0",
          })}
        />
      </div>
    );
  }

  return (
    <Button
      className="text-gray-400 hover:text-gray-700 p-1 -ml-0.5 group/chevron relative size-5 rounded-md hover:bg-black/5 flex items-center justify-center group-pressed/chevron:bg-black/80"
      slot="chevron"
    >
      <CollectionsEmpty16Filled
        className={sidebarItemIconStyles({
          className: `size-4 shrink-0 transition-[opacity_100ms,transform_200ms] ${isMenuOpen ? "opacity-0" : "group-hover:opacity-0"}`,
        })}
      />
      <CollapseArrow
        className={sidebarItemIconStyles({
          className: `size-3 shrink-0 absolute ${isMenuOpen ? "opacity-100" : "opacity-0 group-hover:opacity-100"} text-black/45! transition-[opacity_100ms,transform_200ms] ${
            isExpanded ? "rotate-90" : ""
          }`,
        })}
      />
    </Button>
  );
}

type ActionButtonProps = {
  "aria-label": string;
  icon: React.ComponentType<{ className?: string }>;
  onPress?: () => void;
  tooltip?: string;
};

function ActionButton({
  "aria-label": ariaLabel,
  icon: Icon,
  onPress,
  tooltip,
}: ActionButtonProps) {
  const button = (
    <Button
      className="p-0.5 text-black hover:bg-black/5 hover:text-black/60 rounded-md flex items-center justify-center pressed:bg-black/8"
      aria-label={ariaLabel}
      onPress={onPress}
    >
      <Icon
        className={sidebarItemIconStyles({
          className: "size-4",
        })}
      />
    </Button>
  );

  if (tooltip) {
    return (
      <TooltipTrigger delay={500}>
        {button}
        <Tooltip placement="top" offset={8}>
          {tooltip}
        </Tooltip>
      </TooltipTrigger>
    );
  }

  return button;
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
  type: "document" | "integration-link" | "integration-group";
  itemId: string;
  itemName: string;
  integrationLinkId?: string | null;
  integrationType?: string;
  isMenuOpen: boolean;
  onMenuOpenChange: (isOpen: boolean) => void;
}) {
  const navigate = useNavigate();
  const { createDocument } = useDocumentActions();

  if (type === "integration-group") {
    return null;
  }

  if (type === "integration-link") {
    return (
      <div
        className={`flex items-center ${isMenuOpen ? "" : "opacity-0 pointer-events-none group-hover:opacity-100 group-hover:pointer-events-auto"}`}
      >
        <ActionButton
          aria-label="Add document"
          icon={Add12Regular}
          onPress={() => {
            if (integrationLinkId) {
              createDocument(undefined, integrationLinkId);
            }
          }}
          tooltip="Add document"
        />
        <MenuTrigger isOpen={isMenuOpen} onOpenChange={onMenuOpenChange}>
          <ActionButton
            aria-label="Integration link options"
            icon={MoreHorizontalRegular}
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
                  });
                }
              }}
            >
              Integration settings
            </MenuItem>
            <MenuItem
              onAction={() => {
                if (integrationLinkId) {
                  createDocument(undefined, integrationLinkId);
                }
              }}
            >
              New document
            </MenuItem>
          </Menu>
        </MenuTrigger>
      </div>
    );
  }

  return (
    <div
      className={`flex gap-x-px items-center ${isMenuOpen ? "" : "opacity-0 pointer-events-none group-hover:opacity-100 group-hover:pointer-events-auto"}`}
    >
      <ActionButton
        aria-label="Add sub document"
        icon={Add12Regular}
        onPress={() => createDocument(itemId)}
        tooltip="Add page inside"
      />
      <MenuTrigger isOpen={isMenuOpen} onOpenChange={onMenuOpenChange}>
        <ActionButton
          aria-label="Document options"
          icon={MoreHorizontalRegular}
          tooltip="Document options"
        />
        <DocumentMenu documentId={itemId} documentName={itemName} />
      </MenuTrigger>
    </div>
  );
}
