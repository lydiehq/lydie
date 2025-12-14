import { ArrowLeft, MoreVertical } from "lucide-react";
import { Heading } from "@/components/generic/Heading";
import { FolderMenu } from "./FolderMenu";
import { MenuTrigger, Button as RACButton } from "react-aria-components";

type FolderHeaderProps = {
  folderId: string;
  folderName: string;
  onBackClick: () => void;
};

export function FolderHeader({
  folderId,
  folderName,
  onBackClick,
}: FolderHeaderProps) {
  return (
    <div className="mb-4">
      <button
        onClick={onBackClick}
        className="flex items-center gap-2 text-sm text-gray-600 hover:text-gray-900 transition-colors"
      >
        <ArrowLeft className="size-4" />
        Back
      </button>
      <div className="flex items-center gap-x-1.5">
        <Heading level={2}>{folderName}</Heading>
        <MenuTrigger>
          <RACButton
            className="p-1 rounded hover:bg-gray-200 dark:hover:bg-gray-800"
            aria-label="Folder options"
          >
            <MoreVertical className="size-4" />
          </RACButton>
          <FolderMenu folderId={folderId} folderName={folderName} />
        </MenuTrigger>
      </div>
    </div>
  );
}
