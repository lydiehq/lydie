import type { Ref } from "react";
import { Dialog as RACDialog, type DialogProps } from "react-aria-components";
import { twMerge } from "tailwind-merge";

export function Dialog(props: DialogProps & { ref?: Ref<HTMLElement> }) {
  return (
    <RACDialog
      {...props}
      className={twMerge("outline-0 max-h-[inherit] relative", props.className)}
    />
  );
}
