import {
  TreeItem,
  TreeItemContent,
  Button,
  MenuTrigger,
} from "react-aria-components";
import { useParams, useNavigate } from "@tanstack/react-router";
import { Collection } from "react-aria-components";
import { type ReactElement, useRef } from "react";
import {
  ChevronRight,
  File,
  FolderSync,
  MoreVertical,
  Move,
  Blocks,
  Loader,
  Files,
} from "lucide-react";
import { composeTailwindRenderProps, focusRing } from "../generic/utils";
import { sidebarItemStyles } from "./Sidebar";
import { DocumentMenu } from "../home-file-explorer/DocumentMenu";
import { Menu, MenuItem } from "../generic/Menu";
import type { QueryResultType } from "@rocicorp/zero";
import { queries } from "@lydie/zero/queries";
import { getIntegrationIconUrl } from "@/utils/integration-icons";

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
  documents: NonNullable<
    QueryResultType<typeof queries.organizations.documents>
  >["documents"];
};

export function DocumentTreeItem({ item, renderItem }: Props) {
  const { id: currentDocId } = useParams({ strict: false });
  const navigate = useNavigate();
  const chevronRef = useRef<HTMLButtonElement>(null);

  const isCurrentDocument =
    item.type === "document" && currentDocId === item.id;
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

    // For integration links, trigger expansion by clicking the chevron button
    if (isIntegrationLink) {
      chevronRef.current?.click();
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
            dragging:opacity-50 dragging:bg-gray-50 
            ${
              item.type === "document" || isIntegrationLink
                ? "drop-target:bg-gray-200"
                : ""
            }
            ${isGroup ? "cursor-default" : ""}
          `,
        })
      )}
      style={{
        paddingLeft: `calc(calc(var(--tree-item-level, 1) - 1) * 0.5rem + 0.5rem)`,
        paddingRight: "0.5rem",
      }}
    >
      <TreeItemContent>
        {({ isExpanded }) => (
          <>
            {/* Only show drag button for non-integration-link/group items */}
            {!isIntegrationLink && !isGroup && (
              <Button
                slot="drag"
                className="hidden"
                aria-label={`Drag document ${item.name}`}
              >
                <Move size={12} />
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
                />
              )}

              {item.type === "document" && (
                <DocumentIcon
                  isExpanded={isExpanded}
                  chevronRef={chevronRef}
                  hasChildren={
                    item.children !== undefined && item.children.length > 0
                  }
                />
              )}

              <span
                className={`truncate ${isLocked ? "text-gray-500 italic" : ""}`}
              >
                {getDisplayName(item.name)}
              </span>
            </div>

            {/* Context menu */}
            <div className="items-center gap-1 relative -mr-1">
              <ItemContextMenu
                type={item.type}
                itemId={item.id}
                itemName={item.name}
                integrationLinkId={item.integrationLinkId}
                integrationType={item.integrationType}
              />
            </div>
          </>
        )}
      </TreeItemContent>
      {item.children && (
        <Collection items={item.children}>{renderItem}</Collection>
      )}
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
  const iconUrl = integrationType
    ? getIntegrationIconUrl(integrationType)
    : null;

  return (
    <Button
      className="text-gray-500 p-1 rounded hover:bg-gray-200 -ml-1 group/chevron"
      slot="chevron"
    >
      {iconUrl ? (
        <>
          <img
            src={iconUrl}
            alt={`${name} icon`}
            className="size-3.5 rounded-[2px] group-hover/chevron:hidden"
          />
          <ChevronRight
            className={`size-3.5 text-gray-500 shrink-0 hidden group-hover/chevron:block transition-transform duration-200 ease-in-out ${
              isExpanded ? "rotate-90" : ""
            }`}
          />
        </>
      ) : (
        <>
          <Blocks className="size-3.5 text-gray-500 group-hover/chevron:hidden" />
          <ChevronRight
            className={`size-3.5 text-gray-500 shrink-0 hidden group-hover/chevron:block transition-transform duration-200 ease-in-out ${
              isExpanded ? "rotate-90" : ""
            }`}
          />
        </>
      )}
    </Button>
  );
}

/**
 * Integration Link Chevron - Shows sync icon with loading state
 */
function IntegrationLinkChevron({
  syncStatus,
  isExpanded,
  chevronRef,
}: {
  syncStatus?: string | null;
  isExpanded: boolean;
  chevronRef: React.RefObject<HTMLButtonElement | null>;
}) {
  return (
    <Button
      ref={chevronRef}
      className="text-gray-500 p-1 rounded hover:bg-gray-200 -ml-1 group/chevron"
      slot="chevron"
    >
      {syncStatus === "pulling" ? (
        <Loader className="size-3.5 text-gray-500 animate-spin" />
      ) : (
        <>
          <FolderSync className="size-3.5 text-gray-500 group-hover/chevron:hidden" />
          <ChevronRight
            className={`size-3.5 text-gray-500 shrink-0 hidden group-hover/chevron:block transition-transform duration-200 ease-in-out ${
              isExpanded ? "rotate-90" : ""
            }`}
          />
        </>
      )}
    </Button>
  );
}

/**
 * Document Icon - Shows file icon, with interactive chevron only if page has children
 */
function DocumentIcon({
  isExpanded,
  chevronRef,
  hasChildren,
}: {
  isExpanded: boolean;
  chevronRef: React.RefObject<HTMLButtonElement | null>;
  hasChildren: boolean;
}) {
  const IconComponent = hasChildren ? Files : File;

  // If no children, just show the icon (not interactive)
  if (!hasChildren) {
    return (
      <div className="text-gray-500 p-1 -ml-1">
        <IconComponent className="size-3.5 text-gray-500 shrink-0" />
      </div>
    );
  }

  // If has children, show button with chevron on hover
  return (
    <Button
      ref={chevronRef}
      className="text-gray-500 p-1 rounded hover:bg-gray-200 -ml-1 group"
      slot="chevron"
    >
      <IconComponent className="size-3.5 text-gray-500 shrink-0 group-hover:hidden" />
      <ChevronRight
        className={`size-3.5 text-gray-500 shrink-0 hidden group-hover:block transition-transform duration-200 ease-in-out ${
          isExpanded ? "rotate-90" : ""
        }`}
      />
    </Button>
  );
}

/**
 * Context Menu for different item types
 */
function ItemContextMenu({
  type,
  itemId,
  itemName,
  integrationLinkId,
  integrationType,
}: {
  type: "document" | "integration-link" | "integration-group";
  itemId: string;
  itemName: string;
  integrationLinkId?: string | null;
  integrationType?: string;
}) {
  const navigate = useNavigate();

  if (type === "integration-group") {
    return null;
  }

  if (type === "integration-link") {
    return (
      <MenuTrigger>
        <Button
          className="p-1 rounded hover:bg-gray-200"
          aria-label="Integration link options"
        >
          <MoreVertical size={12} />
        </Button>
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
        </Menu>
      </MenuTrigger>
    );
  }

  // Document
  return (
    <MenuTrigger>
      <Button
        className="p-1 rounded hover:bg-gray-200"
        aria-label="Document options"
      >
        <MoreVertical size={12} />
      </Button>
      <DocumentMenu documentId={itemId} documentName={itemName} />
    </MenuTrigger>
  );
}
