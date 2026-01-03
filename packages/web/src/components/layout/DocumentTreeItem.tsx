import {
  TreeItem,
  TreeItemContent,
  Button,
  MenuTrigger,
} from "react-aria-components";
import { useParams, useNavigate, useSearch } from "@tanstack/react-router";
import { Collection } from "react-aria-components";
import { type ReactElement, useRef } from "react";
import {
  ChevronRight,
  File,
  Folder,
  FolderOpen,
  FolderSync,
  MoreVertical,
  Move,
  Blocks,
  Loader,
} from "lucide-react";
import { composeTailwindRenderProps, focusRing } from "../generic/utils";
import { sidebarItemStyles } from "./Sidebar";
import { FolderMenu } from "../home-file-explorer/FolderMenu";
import { DocumentMenu } from "../home-file-explorer/DocumentMenu";
import { Menu, MenuItem } from "../generic/Menu";
import type { QueryResultType } from "@rocicorp/zero";
import { queries } from "@lydie/zero/queries";
import { useAuth } from "@/context/auth.context";
import { isAdmin } from "@/utils/admin";
import { getIntegrationIconUrl } from "@/utils/integration-icons";

function getDisplayName(name: string): string {
  return name.trim() || "Untitled document";
}

export type DocumentTreeItemProps = {
  item: {
    id: string;
    name: string;
    type: "folder" | "document" | "integration-link" | "integration-group";
    children?: Array<{
      id: string;
      name: string;
      type: "folder" | "document" | "integration-link" | "integration-group";
      children?: any[];
      integrationLinkId?: string | null;
      integrationType?: string;
      syncStatus?: string | null;
    }>;
    integrationLinkId?: string | null;
    integrationType?: string;
    syncStatus?: string | null;
  };
  renderItem: (item: any) => ReactElement;
  documents: NonNullable<
    QueryResultType<typeof queries.organizations.documentsAndFolders>
  >["documents"];
};

export function DocumentTreeItem({
  item,
  renderItem,
  documents,
}: DocumentTreeItemProps) {
  const { id: currentDocId } = useParams({ strict: false });
  const navigate = useNavigate();
  const { tree } = useSearch({ strict: false });
  const { user } = useAuth();
  const folderChevronRef = useRef<HTMLButtonElement>(null);
  const integrationLinkChevronRef = useRef<HTMLButtonElement>(null);
  const documentChevronRef = useRef<HTMLButtonElement>(null);

  const isCurrentDocument =
    item.type === "document" && currentDocId === item.id;
  const isActiveFolder = item.type === "folder" && tree === item.id;
  const isCurrent = isCurrentDocument || isActiveFolder;

  const isIntegrationLink = item.type === "integration-link";

  const isGroup = item.type === "integration-group";

  const handleAction = () => {
    if (isGroup)
      navigate({
        to: "/w/$organizationSlug/settings/integrations/$integrationId",
        params: { integrationId: item.integrationType },
        from: "/w/$organizationSlug",
      });

    // For folders and integration links, trigger expansion by clicking the chevron button
    if (item.type === "folder") {
      folderChevronRef.current?.click();
      return;
    }
    if (isIntegrationLink) {
      integrationLinkChevronRef.current?.click();
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
              item.type === "folder" ||
              item.type === "document" ||
              isIntegrationLink
                ? "drop-target:bg-gray-200"
                : ""
            }
            ${isGroup ? "cursor-default" : ""}
          `,
        })
      )}
      style={{
        paddingLeft: `calc(calc(var(--tree-item-level, 1) - 1) * 0.75rem + 0.5rem)`,
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
                aria-label={`Drag ${
                  item.type === "folder" ? "folder" : "document"
                } ${item.name}`}
              >
                <Move size={12} />
              </Button>
            )}
            <div className="flex items-center gap-x-1.5 flex-1 min-w-0">
              {/* Integration Group item - shows as a folder with blocks icon */}
              {isGroup && (
                <>
                  <Button
                    className="text-gray-500 p-1 rounded hover:bg-gray-200 -ml-1 group"
                    slot="chevron"
                  >
                    <ChevronRight className="size-3 group-expanded:rotate-90 transition-transform duration-200 ease-in-out" />
                  </Button>
                  <div className="flex items-center gap-0.5">
                    {(() => {
                      const iconUrl = item.integrationType
                        ? getIntegrationIconUrl(item.integrationType)
                        : null;

                      if (iconUrl) {
                        return (
                          <img
                            src={iconUrl}
                            alt={`${item.name} icon`}
                            className="size-3.5 rounded-[2px]"
                          />
                        );
                      }

                      return <Blocks className="size-3.5 text-gray-500" />;
                    })()}
                  </div>
                </>
              )}

              {/* Integration link item - use sync icon as chevron to toggle expansion */}
              {isIntegrationLink && (
                <Button
                  ref={integrationLinkChevronRef}
                  className="text-gray-500 p-1 rounded hover:bg-gray-200 -ml-1"
                  slot="chevron"
                >
                  {item.syncStatus === "pulling" ? (
                    <Loader className="size-3.5 text-gray-500 animate-spin" />
                  ) : (
                    <FolderSync className="size-3.5 text-gray-500" />
                  )}
                </Button>
              )}
              {/* Folder item - use folder icon as chevron to toggle expansion */}
              {item.type === "folder" && (
                <Button
                  ref={folderChevronRef}
                  className="text-gray-500 p-1 rounded hover:bg-gray-200 -ml-1"
                  slot="chevron"
                >
                  {isExpanded ? (
                    <FolderOpen className="size-3.5" />
                  ) : (
                    <Folder className="size-3.5" />
                  )}
                </Button>
              )}
              {item.type === "document" &&
                (() => {
                  const document = documents.find((doc) => doc.id === item.id);
                  const hasChildren = item.children && item.children.length > 0;
                  return (
                    <Button
                      ref={documentChevronRef}
                      className="text-gray-500 p-1 rounded hover:bg-gray-200 -ml-1 group/chevron"
                      slot="chevron"
                    >
                      <File className="size-3.5 text-gray-500 shrink-0 group-hover/chevron:hidden" />
                      <ChevronRight
                        className={`size-3 text-gray-500 shrink-0 hidden group-hover/chevron:block transition-transform duration-200 ease-in-out ${
                          hasChildren && isExpanded ? "rotate-90" : ""
                        }`}
                      />
                    </Button>
                  );
                })()}
              <span className="truncate">{getDisplayName(item.name)}</span>
            </div>

            {/* Context menu */}
            <div className="items-center gap-1 relative -mr-1">
              {isGroup ? null : isIntegrationLink ? (
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
                        if (item.integrationLinkId) {
                          navigate({
                            to: "/w/$organizationSlug/settings/integrations/$integrationId",
                            params: { integrationId: item.integrationType },
                            from: "/w/$organizationSlug",
                          });
                        }
                      }}
                    >
                      Integration settings
                    </MenuItem>
                  </Menu>
                </MenuTrigger>
              ) : item.type === "folder" ? (
                <MenuTrigger>
                  <Button
                    className="p-1 rounded hover:bg-gray-200"
                    aria-label="Folder options"
                  >
                    <MoreVertical size={12} />
                  </Button>
                  <FolderMenu folderId={item.id} folderName={item.name} />
                </MenuTrigger>
              ) : (
                <MenuTrigger>
                  <Button
                    className="p-1 rounded hover:bg-gray-200"
                    aria-label="Document options"
                  >
                    <MoreVertical size={12} />
                  </Button>
                  <DocumentMenu documentId={item.id} documentName={item.name} />
                </MenuTrigger>
              )}
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
