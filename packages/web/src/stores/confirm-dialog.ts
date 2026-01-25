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

let setConfirmDialog: (state: ConfirmDialogState) => void;

export function initConfirmDialog(setter: (state: ConfirmDialogState) => void) {
  setConfirmDialog = setter;
}

export function confirmDialog(options: {
  title?: string;
  message: string;
  onConfirm: () => void;
}): void {
  setConfirmDialog({
    isOpen: true,
    title: options.title ?? "Confirm",
    message: options.message,
    onConfirm: options.onConfirm,
  });
}
