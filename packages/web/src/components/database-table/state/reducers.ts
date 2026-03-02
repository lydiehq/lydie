export type EditingCell = {
  rowId: string;
  columnId: string;
  seed?: string;
} | null;

export type TableCellState = {
  focusedCell: { rowId: string; columnId: string } | null;
  editingCell: EditingCell;
};

export type TableCellAction =
  | { type: "focus"; rowId: string; columnId: string }
  | { type: "startEdit"; rowId: string; columnId: string; seed?: string }
  | { type: "stopEdit" }
  | { type: "reset" };

export const initialTableCellState: TableCellState = {
  focusedCell: null,
  editingCell: null,
};

export function tableCellStateReducer(
  state: TableCellState,
  action: TableCellAction,
): TableCellState {
  if (action.type === "focus") {
    return {
      ...state,
      focusedCell: { rowId: action.rowId, columnId: action.columnId },
    };
  }

  if (action.type === "startEdit") {
    return {
      ...state,
      focusedCell: { rowId: action.rowId, columnId: action.columnId },
      editingCell: { rowId: action.rowId, columnId: action.columnId, seed: action.seed },
    };
  }

  if (action.type === "stopEdit") {
    return {
      ...state,
      editingCell: null,
    };
  }

  if (action.type === "reset") {
    return initialTableCellState;
  }

  return state;
}
