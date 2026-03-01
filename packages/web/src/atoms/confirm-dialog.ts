import { atom } from "jotai";

export interface ConfirmDialogState {
  isOpen: boolean;
  title: string;
  message: string;
  onConfirm?: () => void;
}

export const confirmDialogAtom = atom<ConfirmDialogState>({
  isOpen: false,
  title: "Confirm",
  message: "",
  onConfirm: undefined,
});

type ConfirmDialogSetter = (
  state: ConfirmDialogState | ((previousState: ConfirmDialogState) => ConfirmDialogState),
) => void;

let setConfirmDialog: ConfirmDialogSetter | null = null;

confirmDialogAtom.onMount = (setAtom) => {
  setConfirmDialog = setAtom;
  return () => {
    setConfirmDialog = null;
  };
};

export function confirmDialog(options: {
  title?: string;
  message: string;
  onConfirm: () => void;
}): void {
  if (!setConfirmDialog) {
    return;
  }

  setConfirmDialog({
    isOpen: true,
    title: options.title ?? "Confirm",
    message: options.message,
    onConfirm: options.onConfirm,
  });
}
