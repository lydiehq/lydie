import {
  GridListItem,
  MenuTrigger,
  Button as RACButton,
} from "react-aria-components";
import { Checkbox } from "@/components/generic/Checkbox";
import { useNavigate } from "@tanstack/react-router";
import { composeTailwindRenderProps, focusRing } from "../generic/utils";
import { formatDistanceToNow } from "date-fns";
import { DocumentMenu } from "./DocumentMenu";
import { DocumentIcon, MoreVerticalIcon } from "@/icons";

type DocumentItemProps = {
  id: string;
  name: string;
  updated_at?: number | string | null;
  viewMode: "grid" | "list";
  isSelected?: boolean;
};

export function DocumentItem({
  id,
  name,
  updated_at,
  viewMode,
}: DocumentItemProps) {
  const navigate = useNavigate();

  const handleNavigate = () => {
    navigate({
      to: "/w/$organizationSlug/$id",
      params: { id },
      from: "/w/$organizationSlug",
    });
  };

  if (viewMode === "list") {
    return (
      <GridListItem
        id={id}
        textValue={name}
        onAction={handleNavigate}
        className={composeTailwindRenderProps(
          focusRing,
          "flex items-center gap-3 p-3 hover:bg-gray-50"
        )}
      >
        {/* <ChecIconkbox slot="selection" /> */}
        <DocumentIcon className="size-3.5 text-gray-400" />
        <span className="text-sm font-medium text-gray-900 flex-1 text-left">
          {name}
        </span>
        {updated_at && (
          <span className="text-xs text-gray-500">
            {new Date(
              typeof updated_at === "number" ? updated_at : updated_at
            ).toLocaleDateString()}
          </span>
        )}
        <MenuTrigger>
          <RACButton
            className="p-1 rounded hover:bg-gray-200"
            aria-label="Document options"
          >
            <MoreVerticalIcon className="size-4" />
          </RACButton>
          <DocumentMenu documentId={id} documentName={name} />
        </MenuTrigger>
      </GridListItem>
    );
  }

  return (
    <GridListItem
      id={id}
      textValue={name}
      onAction={handleNavigate}
      className={composeTailwindRenderProps(
        focusRing,
        "flex flex-col p-1 rounded-lg border border-gray-200 hover:border-gray-300 hover:bg-gray-50 relative group"
      )}
    >
      <Checkbox slot="selection" className="hidden" />
      <div className="h-28 w-full bg-gray-100 rounded-t-md rounded-b-sm p-2"></div>
      <div className="flex flex-col gap-y-1 w-full p-2">
        <div className="flex items-center gap-x-2">
          <File className="size-3.5 text-gray-400" />
          <span className="text-sm font-medium text-gray-700 truncate w-full">
            {name}
          </span>
        </div>

        {updated_at && (
          <span className="text-xs text-gray-500">
            Edited{" "}
            {formatDistanceToNow(new Date(updated_at), { addSuffix: true })}
          </span>
        )}
      </div>
      <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity">
        <MenuTrigger>
          <RACButton
            className="p-1 rounded hover:bg-gray-200"
            aria-label="Document options"
          >
            <MoreVertical className="size-4" />
          </RACButton>
          <DocumentMenu documentId={id} documentName={name} />
        </MenuTrigger>
      </div>
    </GridListItem>
  );
}
