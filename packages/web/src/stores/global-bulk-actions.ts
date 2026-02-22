import { atom } from "jotai";

type BulkActionIntent = "primary" | "secondary" | "ghost" | "danger";

export type GlobalBulkAction = {
  id: string;
  label: string;
  onAction: () => void;
  intent?: BulkActionIntent;
  isDisabled?: boolean;
};

export type GlobalBulkActionsState = {
  isOpen: boolean;
  ownerId: string | null;
  selectionCount: number;
  selectionLabelSingular: string;
  selectionLabelPlural: string;
  actions: GlobalBulkAction[];
};

const DEFAULT_STATE: GlobalBulkActionsState = {
  isOpen: false,
  ownerId: null,
  selectionCount: 0,
  selectionLabelSingular: "item",
  selectionLabelPlural: "items",
  actions: [],
};

export const globalBulkActionsAtom = atom<GlobalBulkActionsState>(DEFAULT_STATE);

type GlobalBulkActionsSetter = (
  state:
    | GlobalBulkActionsState
    | ((previousState: GlobalBulkActionsState) => GlobalBulkActionsState),
) => void;

let setGlobalBulkActions: GlobalBulkActionsSetter | null = null;

export function initGlobalBulkActions(setter: GlobalBulkActionsSetter) {
  setGlobalBulkActions = setter;
}

export function showGlobalBulkActions(options: {
  ownerId: string;
  selectionCount: number;
  selectionLabelSingular?: string;
  selectionLabelPlural?: string;
  actions: GlobalBulkAction[];
}) {
  if (!setGlobalBulkActions) {
    return;
  }

  const selectionLabelSingular = options.selectionLabelSingular ?? "item";
  const selectionLabelPlural = options.selectionLabelPlural ?? `${selectionLabelSingular}s`;

  setGlobalBulkActions({
    isOpen: options.selectionCount > 0,
    ownerId: options.ownerId,
    selectionCount: options.selectionCount,
    selectionLabelSingular,
    selectionLabelPlural,
    actions: options.actions,
  });
}

export function hideGlobalBulkActions(ownerId?: string) {
  if (!setGlobalBulkActions) {
    return;
  }

  if (ownerId) {
    setGlobalBulkActions((previousState) => {
      if (previousState.ownerId !== ownerId) {
        return previousState;
      }

      return DEFAULT_STATE;
    });
    return;
  }

  setGlobalBulkActions(DEFAULT_STATE);
}
