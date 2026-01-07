import {
  TreeItem,
  TreeItemContent,
  Button,
  MenuTrigger,
} from "react-aria-components";
import { useParams, useNavigate } from "@tanstack/react-router";
import { Collection } from "react-aria-components";
import { type ReactElement, type SVGProps, useRef } from "react";
import {
  // ChevronRight,
  // File,
  FolderSync,
  MoreVertical,
  Move,
  Blocks,
  Loader,
  // Files,
} from "lucide-react";
import { composeTailwindRenderProps, focusRing } from "../generic/utils";
import { sidebarItemStyles } from "./Sidebar";
import { DocumentMenu } from "../home-file-explorer/DocumentMenu";
import { Menu, MenuItem } from "../generic/Menu";
import type { QueryResultType } from "@rocicorp/zero";
import { queries } from "@lydie/zero/queries";
import { getIntegrationIconUrl } from "@/utils/integration-icons";

// https://icones.js.org/collection/ion?s=chevron&icon=ion:chevron-forward
export function ChevronRight(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="1em"
      height="1em"
      viewBox="0 0 512 512"
      {...props}
    >
      {/* Icon from IonIcons by Ben Sperry - https://github.com/ionic-team/ionicons/blob/main/LICENSE */}
      <path
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="48"
        d="m184 112l144 144l-144 144"
      />
    </svg>
  );
}

export function File(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="1em"
      height="1em"
      viewBox="0 0 512 512"
      {...props}
    >
      {/* Icon from IonIcons by Ben Sperry - https://github.com/ionic-team/ionicons/blob/main/LICENSE */}
      <path
        fill="currentColor"
        d="M428 224H288a48 48 0 0 1-48-48V36a4 4 0 0 0-4-4h-92a64 64 0 0 0-64 64v320a64 64 0 0 0 64 64h224a64 64 0 0 0 64-64V228a4 4 0 0 0-4-4"
      />
      <path
        fill="currentColor"
        d="M419.22 188.59L275.41 44.78a2 2 0 0 0-3.41 1.41V176a16 16 0 0 0 16 16h129.81a2 2 0 0 0 1.41-3.41"
      />
    </svg>
  );
}

export function Files(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="1em"
      height="1em"
      viewBox="0 0 512 512"
      {...props}
    >
      {/* Icon from IonIcons by Ben Sperry - https://github.com/ionic-team/ionicons/blob/main/LICENSE */}
      <path
        fill="currentColor"
        d="M298.39 248a4 4 0 0 0 2.86-6.8l-78.4-79.72a4 4 0 0 0-6.85 2.81V236a12 12 0 0 0 12 12Z"
      />
      <path
        fill="currentColor"
        d="M197 267a43.67 43.67 0 0 1-13-31v-92h-72a64.19 64.19 0 0 0-64 64v224a64 64 0 0 0 64 64h144a64 64 0 0 0 64-64V280h-92a43.6 43.6 0 0 1-31-13m175-147h70.39a4 4 0 0 0 2.86-6.8l-78.4-79.72a4 4 0 0 0-6.85 2.81V108a12 12 0 0 0 12 12"
      />
      <path
        fill="currentColor"
        d="M372 152a44.34 44.34 0 0 1-44-44V16H220a60.07 60.07 0 0 0-60 60v36h42.12A40.8 40.8 0 0 1 231 124.14l109.16 111a41.1 41.1 0 0 1 11.83 29V400h53.05c32.51 0 58.95-26.92 58.95-60V152Z"
      />
    </svg>
  );
}

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
        {({ isExpanded, allowsDragging }) => (
          <>
            {/* Always render drag button when dragging is allowed, but visually hide it */}
            {/* Screen readers and keyboard users can still access it */}
            {allowsDragging && (
              <Button
                slot="drag"
                className="absolute w-px h-px p-0 -m-px overflow-hidden whitespace-nowrap border-0"
                style={{
                  clip: "rect(0, 0, 0, 0)",
                  clipPath: "inset(50%)",
                }}
                aria-label={`Drag ${item.name}`}
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
        <IconComponent className="size-4 text-gray-400 shrink-0" />
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
      <IconComponent className="size-4 text-gray-400 shrink-0 group-hover:hidden" />
      <ChevronRight
        className={`size-4 text-gray-400 shrink-0 hidden group-hover:block transition-transform duration-200 ease-in-out ${
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
