import { GridRegular, ListRegular } from "@fluentui/react-icons";
import { cva } from "cva";
import { Button } from "react-aria-components";

type Props = {
  viewMode: "grid" | "list";
  onViewModeChange: (mode: "grid" | "list") => void;
};

const styles = cva({
  base: "px-2 py-1",
  variants: {
    state: {
      active: "rounded-md ring ring-black/4 shadow-sm bg-white text-gray-700",
      inactive: "text-gray-500",
    },
  },
});

export function ViewModeToggle({ viewMode, onViewModeChange }: Props) {
  return (
    <div className="border border-black/10 rounded-lg p-0.5 bg-gray-100 flex">
      <Button
        onPress={() => onViewModeChange("grid")}
        className={styles({
          state: viewMode === "grid" ? "active" : "inactive",
        })}
        aria-label="Grid view"
      >
        <GridRegular className="size-3.5 text-inherit" />
      </Button>
      <Button
        onPress={() => onViewModeChange("list")}
        className={styles({
          state: viewMode === "list" ? "active" : "inactive",
        })}
        aria-label="List view"
      >
        <ListRegular className="size-3.5 text-inherit" />
      </Button>
    </div>
  );
}
