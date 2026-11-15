import { useState } from "react";
import { Heading } from "react-aria-components";

import { AlertRegular } from "../icons/mingcute";
import { Button } from "./Button";
import { Dialog } from "./Dialog";
import { Modal } from "./Modal";

export type ConfirmOptions = {
  message: string;
  detail?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  // A red confirm button and a warning mark, for actions that delete or take something away.
  destructive?: boolean;
};

type Props = {
  // The open request, null when closed. A new object is a new request.
  request: ConfirmOptions | null;
  onResolve: (confirmed: boolean) => void;
};

// An in-app replacement for `window.confirm`, on the shared Modal: Enter confirms; Escape, Cancel
// or a click outside cancels; focus returns to where it was. Controlled, so a host can queue
// requests and resolve promises from `onResolve`.
export function ConfirmDialog({ request, onResolve }: Props) {
  // The last request stays rendered while the dialog animates out, so the content does not
  // vanish before the exit transition has run.
  const [shown, setShown] = useState(request);
  if (request && request !== shown) setShown(request);
  const content = request ?? shown;
  // Ignore presses that land while the dialog is leaving.
  const resolve = (confirmed: boolean) => {
    if (request) onResolve(confirmed);
  };
  return (
    <Modal
      isOpen={request !== null}
      onOpenChange={(open) => !open && resolve(false)}
      isDismissable
      size="md"
    >
      <Dialog
        role="alertdialog"
        className="flex flex-col gap-8 p-4"
        // The dialog itself takes focus, so no button shows a focus ring until Tab is pressed;
        // Enter there confirms (on a focused button, it presses that button). A native listener:
        // react-aria's Dialog does not pass keyboard handlers through.
        ref={(element) => {
          if (!element) return;
          const onKeyDown = (event: KeyboardEvent) => {
            if (event.key !== "Enter" || event.target !== element) return;
            event.preventDefault();
            resolve(true);
          };
          element.addEventListener("keydown", onKeyDown);
          return () => element.removeEventListener("keydown", onKeyDown);
        }}
      >
        {content && (
          <>
            <div className="flex items-start gap-4">
              {/* Only a warning earns an icon; a generic info mark says nothing. */}
              {content.destructive && (
                <span
                  aria-hidden
                  className="flex size-10 shrink-0 items-center justify-center rounded-[28%] bg-red-50 text-red-600 supports-[corner-shape:squircle]:rounded-[50%] supports-[corner-shape:squircle]:[corner-shape:squircle] [&_svg]:size-5"
                >
                  <AlertRegular />
                </span>
              )}
              <div className="flex min-w-0 flex-col gap-1">
                <Heading slot="title" className="text-base leading-5 font-medium text-gray-900">
                  {content.message}
                </Heading>
                {content.detail && (
                  <p className="text-sm leading-relaxed text-pretty text-gray-500">
                    {content.detail}
                  </p>
                )}
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="secondary" onPress={() => resolve(false)}>
                {content.cancelLabel ?? "Cancel"}
              </Button>
              <Button
                variant={content.destructive ? "destructive" : "primary"}
                onPress={() => resolve(true)}
              >
                {content.confirmLabel ?? "OK"}
              </Button>
            </div>
          </>
        )}
      </Dialog>
    </Modal>
  );
}
