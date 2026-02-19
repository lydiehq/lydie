import { type VariantProps, cva } from "cva";
import { ModalOverlay, type ModalOverlayProps, Modal as RACModal } from "react-aria-components";
import { twMerge } from "tailwind-merge";

import { overlayStyles } from "./Modal";

export const drawerStyles = cva({
  base: "h-full w-full bg-white dark:bg-zinc-800/70 dark:backdrop-saturate-200 forced-colors:bg-[Canvas] text-left text-slate-700 dark:text-zinc-300 shadow-2xl bg-clip-padding ring-l ring-black/10 dark:ring-white/10 overflow-y-auto",
  variants: {
    size: {
      sm: "max-w-sm",
      md: "max-w-md",
      lg: "max-w-lg",
      xl: "max-w-xl",
    },
    isEntering: {
      true: "animate-in ease-out duration-150 slide-in-from-right-8",
    },
    isExiting: {
      true: "animate-out ease-in duration-100 slide-out-to-right-8",
    },
  },
  defaultVariants: {
    size: "md",
  },
});

export function Drawer(props: ModalOverlayProps & VariantProps<typeof drawerStyles>) {
  const { children, size, ...rest } = props;

  return (
    <ModalOverlay
      {...rest}
      className={({ isEntering, isExiting }) =>
        twMerge(overlayStyles({ isEntering, isExiting }), "items-stretch justify-end p-0")
      }
    >
      <RACModal className={drawerStyles({ size })}>{children}</RACModal>
    </ModalOverlay>
  );
}
