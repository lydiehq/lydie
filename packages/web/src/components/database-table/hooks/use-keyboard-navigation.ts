import { useCallback } from "react";

import { getNextGridPosition } from "../logic/navigation";

export function useKeyboardNavigation({
  rowCount,
  columnCount,
  focusCell,
}: {
  rowCount: number;
  columnCount: number;
  focusCell: (rowIndex: number, columnIndex: number) => void;
}) {
  return useCallback(
    (event: React.KeyboardEvent, rowIndex: number, columnIndex: number) => {
      if (
        event.key !== "ArrowUp" &&
        event.key !== "ArrowDown" &&
        event.key !== "ArrowLeft" &&
        event.key !== "ArrowRight"
      ) {
        return;
      }

      event.preventDefault();
      const next = getNextGridPosition({ rowIndex, columnIndex }, event.key, rowCount, columnCount);
      focusCell(next.rowIndex, next.columnIndex);
    },
    [columnCount, focusCell, rowCount],
  );
}
