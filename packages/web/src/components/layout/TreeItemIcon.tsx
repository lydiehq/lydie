import { AppFolder16Filled } from "@fluentui/react-icons";
import { sidebarItemIconStyles } from "@lydie/ui/components/editor/styles";
import { CollapseArrow } from "@lydie/ui/components/icons/CollapseArrow";
import { DocumentThumbnailIcon } from "@lydie/ui/components/icons/DocumentThumbnailIcon";
import { Button } from "react-aria-components";

export type TreeItemIconProps = {
  type: "document" | "collection" | "folder";
  isExpanded: boolean;
  hasChildren: boolean;
  isMenuOpen: boolean;
  inTabRegistry?: boolean;
  onToggle?: () => void;
};

export function TreeItemIcon({
  type,
  isExpanded,
  hasChildren,
  isMenuOpen,
  inTabRegistry,
  onToggle,
}: TreeItemIconProps) {
  if (!hasChildren) {
    return (
      <div className="text-gray-500 p-1 -ml-1 flex">
        {type === "collection" ? (
          <AppFolder16Filled className="size-4 text-gray-500" />
        ) : (
          <DocumentThumbnailIcon active={inTabRegistry} />
        )}
      </div>
    );
  }

  return (
    <Button
      className="text-gray-500 p-1 -ml-1 flex items-center relative size-5 rounded-md hover:bg-black/5 group/chevron group-hover:text-gray-700"
      slot={onToggle ? "trigger" : "chevron"}
      onPress={onToggle}
    >
      {type === "collection" ? (
        <AppFolder16Filled
          className={`size-4 absolute transition-opacity ${isMenuOpen ? "opacity-0" : "group-hover:opacity-0"}`}
        />
      ) : (
        <DocumentThumbnailIcon
          className={isMenuOpen ? "opacity-0" : "group-hover:opacity-0 transition-opacity"}
          active={inTabRegistry}
          showFoldDecoration
        />
      )}
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
