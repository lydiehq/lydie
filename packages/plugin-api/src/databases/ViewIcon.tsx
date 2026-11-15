import type { ViewType } from "@lydie/contract";
import { CalendarRegular, Columns2Regular, Rows3Regular, TableRegular } from "@lydie/ui";
import type { Icon } from "@lydie/ui";

// Shared by the collection's view tabs and the sidebar tree, which lists a collection's views.
export const VIEW_LABELS: Record<ViewType, string> = {
  table: "Table",
  board: "Board",
  list: "List",
  calendar: "Calendar",
};

export const VIEW_ICONS: Record<ViewType, Icon> = {
  table: TableRegular,
  board: Columns2Regular,
  list: Rows3Regular,
  calendar: CalendarRegular,
};
