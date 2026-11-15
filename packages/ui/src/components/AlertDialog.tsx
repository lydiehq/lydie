import { type DialogProps, Heading } from "react-aria-components";

import { AlertOctagonRegular, InformationRegular } from "../icons/mingcute";
import { Button } from "./Button";
import { Dialog } from "./Dialog";

interface AlertDialogProps extends Omit<DialogProps, "children"> {
  title: string;
  children: React.ReactNode;
  variant?: "info" | "destructive";
  actionLabel: string;
  cancelLabel?: string;
  onAction?: () => void;
}

export function AlertDialog({
  title,
  variant,
  cancelLabel,
  actionLabel,
  onAction,
  children,
  ...props
}: AlertDialogProps) {
  return (
    <Dialog role="alertdialog" className="p-4" {...props}>
      {({ close }) => (
        <>
          <Heading slot="title" className="text-base leading-5 font-medium text-gray-900 my-0">
            {title}
          </Heading>
          <div
            className={`size-5 absolute right-4 top-4 stroke-2 ${
              variant === "destructive" ? "text-red-500" : "text-blue-500"
            }`}
          >
            {variant === "destructive" ? (
              <AlertOctagonRegular aria-hidden />
            ) : (
              <InformationRegular aria-hidden />
            )}
          </div>
          <p className="mt-1 text-sm leading-relaxed text-pretty text-gray-500">{children}</p>
          <div className="mt-8 flex justify-end gap-2">
            <Button variant="secondary" onPress={close}>
              {cancelLabel || "Cancel"}
            </Button>
            <Button
              variant={variant === "destructive" ? "destructive" : "primary"}
              onPress={() => {
                onAction?.();
                close();
              }}
              autoFocus
            >
              {actionLabel}
            </Button>
          </div>
        </>
      )}
    </Dialog>
  );
}
