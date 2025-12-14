import {
  TreeItem,
  TreeItemContent,
  Button,
  MenuTrigger,
} from "react-aria-components";
import { useParams, useNavigate, useSearch } from "@tanstack/react-router";
import { Collection } from "react-aria-components";
import { type ReactElement } from "react";
import {
  ChevronRight,
  File,
  Folder,
  FolderOpen,
  MoreVertical,
  Move,
} from "lucide-react";
import { composeTailwindRenderProps, focusRing } from "../generic/utils";
import { sidebarItemStyles } from "./Sidebar";
import { FolderMenu } from "../home-file-explorer/FolderMenu";
import { DocumentMenu } from "../home-file-explorer/DocumentMenu";
import type { QueryResultType } from "@rocicorp/zero";
import { queries } from "@lydie/zero/queries";
import { useAuth } from "@/context/auth.context";
import { isAdmin } from "@/utils/admin";

export type DocumentTreeItemProps = {
  item: {
    id: string;
    name: string;
    type: "folder" | "document";
    children?: Array<{
      id: string;
      name: string;
      type: "folder" | "document";
      children?: any[];
    }>;
  };
  renderItem: (item: any) => ReactElement;
  documents: NonNullable<
    QueryResultType<typeof queries.organizations.documentsAndFolders>
  >["documents"];
};

type DocumentIndexStatusIndicatorProps = {
  indexStatus: string;
};

export function DocumentTreeItem({
  item,
  renderItem,
  documents,
}: DocumentTreeItemProps) {
  const { id: currentDocId, organizationId } = useParams({ strict: false });
  const navigate = useNavigate();
  const { tree } = useSearch({ strict: false });
  const { user } = useAuth();

  // Check if this item is current (for documents) or active (for folders)
  const isCurrentDocument =
    item.type === "document" && currentDocId === item.id;
  const isActiveFolder = item.type === "folder" && tree === item.id;
  const isCurrent = isCurrentDocument || isActiveFolder;

  const handleNavigate = () => {
    if (item.type === "document") {
      navigate({
        to: "/w/$organizationId/$id",
        params: { id: item.id },
        from: "/w/$organizationId",
      });
    } else if (item.type === "folder") {
      navigate({
        to: "/w/$organizationId",
        params: { organizationId: organizationId || "" },
        search: { tree: item.id, q: undefined, focusSearch: undefined },
      });
    }
  };

  return (
    <TreeItem
      id={item.id}
      textValue={item.name}
      onAction={handleNavigate}
      className={composeTailwindRenderProps(
        focusRing,
        sidebarItemStyles({
          isCurrent,
          className: `
            dragging:opacity-50 dragging:bg-gray-50 
            ${item.type === "folder" ? "drop-target:bg-gray-200" : ""}
          `,
        })
      )}
      style={{
        paddingLeft: `calc(calc(var(--tree-item-level, 1) - 1) * 1rem + 0.5rem)`,
        paddingRight: "0.5rem",
      }}
    >
      <TreeItemContent>
        {({ isExpanded }) => (
          <>
            <Button
              slot="drag"
              className="hidden"
              aria-label={`Drag ${
                item.type === "folder" ? "folder" : "document"
              } ${item.name}`}
            >
              <Move size={12} />
            </Button>
            <div className="flex items-center gap-x-1.5 flex-1 min-w-0">
              {item.type === "folder" && (
                <Button
                  className="text-gray-500 p-1 rounded hover:bg-gray-200 -ml-1 group"
                  slot="chevron"
                >
                  <ChevronRight className="size-3 group-expanded:rotate-90 transition-transform duration-200 ease-in-out" />
                </Button>
              )}
              {item.type === "folder" && (
                <Button className="text-gray-500 p-1 rounded hover:bg-gray-200 -ml-1">
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
                  const indexStatus = document?.index_status || "outdated";
                  return (
                    <div className="relative">
                      {isAdmin(user) && (
                        <DocumentIndexStatusIndicator
                          indexStatus={indexStatus}
                        />
                      )}
                      <File className="size-3.5 text-gray-500 shrink-0" />
                    </div>
                  );
                })()}
              <span className="truncate">{item.name}</span>
            </div>

            <div className="items-center gap-1 relative -mr-1">
              {item.type === "folder" ? (
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

function DocumentIndexStatusIndicator({
  indexStatus,
}: DocumentIndexStatusIndicatorProps) {
  const getStatusColor = (status: string) => {
    switch (status) {
      case "indexed":
        return "bg-green-500";
      case "indexing":
        return "bg-yellow-500";
      case "pending":
        return "bg-yellow-400";
      case "failed":
        return "bg-red-500";
      case "outdated":
      default:
        return "bg-gray-400";
    }
  };

  return (
    <div
      className={`rounded absolute top-0 left-0 transition-all duration-200 ease-in-out ring-1 ring-surface ${getStatusColor(
        indexStatus
      )} size-1`}
    />
  );
}
