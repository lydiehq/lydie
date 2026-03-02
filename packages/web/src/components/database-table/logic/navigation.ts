export type GridPosition = { rowIndex: number; columnIndex: number };

export function getNextGridPosition(
  current: GridPosition,
  key: string,
  rowCount: number,
  columnCount: number,
): GridPosition {
  if (rowCount <= 0 || columnCount <= 0) {
    return current;
  }

  let nextRow = current.rowIndex;
  let nextColumn = current.columnIndex;

  if (key === "ArrowUp") {
    nextRow = Math.max(0, current.rowIndex - 1);
  }
  if (key === "ArrowDown") {
    nextRow = Math.min(rowCount - 1, current.rowIndex + 1);
  }
  if (key === "ArrowLeft") {
    nextColumn = Math.max(0, current.columnIndex - 1);
  }
  if (key === "ArrowRight") {
    nextColumn = Math.min(columnCount - 1, current.columnIndex + 1);
  }

  return { rowIndex: nextRow, columnIndex: nextColumn };
}
