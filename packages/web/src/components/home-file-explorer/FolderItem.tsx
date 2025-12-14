import {
  GridListItem,
  MenuTrigger,
  Button as RACButton,
} from "react-aria-components";
import { Folder, MoreVertical } from "lucide-react";
import { Checkbox } from "@/components/generic/Checkbox";
import { composeTailwindRenderProps, focusRing } from "../generic/utils";
import { FolderMenu } from "./FolderMenu";

type FolderItemProps = {
  id: string;
  name: string;
  viewMode: "grid" | "list";
  onAction: () => void;
  isSelected?: boolean;
};

export function FolderItem({ id, name, viewMode, onAction }: FolderItemProps) {
  if (viewMode === "list") {
    return (
      <GridListItem
        id={id}
        textValue={name}
        className={composeTailwindRenderProps(
          focusRing,
          "flex items-center gap-3 p-3 hover:bg-gray-50"
        )}
        onAction={onAction}
      >
        {/* <Checkbox slot="selection" /> */}
        <Folder className="size-3.5 text-gray-400" />
        <span className="text-sm font-medium text-gray-900 flex-1 text-left">
          {name}
        </span>
        <MenuTrigger>
          <RACButton
            className="p-1 rounded hover:bg-gray-200"
            aria-label="Folder options"
          >
            <MoreVertical className="size-4" />
          </RACButton>
          <FolderMenu folderId={id} folderName={name} />
        </MenuTrigger>
      </GridListItem>
    );
  }

  return (
    <GridListItem
      id={id}
      textValue={name}
      onAction={onAction}
      className={composeTailwindRenderProps(
        focusRing,
        "flex items-center gap-2 p-3 rounded-lg border border-gray-200 hover:border-gray-300 hover:bg-gray-50 relative group"
      )}
    >
      <Checkbox slot="selection" className="hidden" />
      <Folder fill="currentColor" className="size-3.5 text-gray-300" />
      <span className="text-sm font-medium text-gray-700 truncate w-full">
        {name}
      </span>
      <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity">
        <MenuTrigger>
          <RACButton
            className="p-1 rounded hover:bg-gray-200"
            aria-label="Folder options"
          >
            <MoreVertical className="size-4" />
          </RACButton>
          <FolderMenu folderId={id} folderName={name} />
        </MenuTrigger>
      </div>
    </GridListItem>
  );
}
