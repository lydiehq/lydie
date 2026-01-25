import { useAtom } from "jotai";
import { useEffect } from "react";
import { Heading } from "react-aria-components";

import { confirmDialogAtom, initConfirmDialog } from "@/stores/confirm-dialog";

import { Button } from "./Button";
import { Dialog } from "./Dialog";
import { Modal } from "./Modal";

export function ConfirmDialog() {
  const [state, setState] = useAtom(confirmDialogAtom);

  useEffect(() => {
    initConfirmDialog(setState);
  }, [setState]);

  const handleClose = () => {
    setState({
      isOpen: false,
      title: "Confirm",
      message: "",
      onConfirm: undefined,
    });
  };

  const handleConfirm = () => {
    state.onConfirm?.();
    handleClose();
  };

  return (
    <Modal isOpen={state.isOpen} onOpenChange={handleClose} isDismissable size="sm">
      <Dialog role="alertdialog">
        <div className="p-4 flex flex-col gap-y-3">
          <Heading slot="title" className="text-lg font-medium text-gray-900">
            Confirm
          </Heading>
          <p className="text-sm text-slate-600">{state.message}</p>
          <div className="flex gap-x-1.5 justify-end">
            <Button intent="secondary" onPress={handleClose} size="sm">
              Cancel
            </Button>
            <Button onPress={handleConfirm} size="sm" autoFocus>
              Confirm
            </Button>
          </div>
        </div>
      </Dialog>
    </Modal>
  );
}
