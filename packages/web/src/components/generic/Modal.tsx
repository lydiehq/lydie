import { type VariantProps, cva } from "cva";
import { ModalOverlay, type ModalOverlayProps, Modal as RACModal } from "react-aria-components";

export const overlayStyles = cva({
  base: "fixed top-0 left-0 w-full h-(--visual-viewport-height) isolate z-40 bg-black/[15%] flex items-center justify-center p-4 text-center",
  variants: {
    isEntering: {
      true: "animate-in fade-in duration-100 ease-out slide-in-from-bottom-1",
    },
    isExiting: {
      true: "animate-out fade-out duration-100 ease-in slide-out-to-bottom-0.5",
    },
  },
});

export const modalStyles = cva({
  base: "w-full max-h-full rounded-lg bg-white dark:bg-zinc-800/70 dark:backdrop-saturate-200 forced-colors:bg-[Canvas] text-left align-middle text-slate-700 dark:text-zinc-300 shadow-2xl bg-clip-padding ring ring-black/10 dark:ring-white/10",
  variants: {
    size: {
      sm: "max-w-sm",
      md: "max-w-md",
      lg: "max-w-lg",
      xl: "max-w-xl",
    },
    isEntering: {
      true: "animate-in zoom-in-98 ease-out duration-100",
    },
    isExiting: {
      true: "animate-out zoom-out-98 ease-in duration-100",
    },
  },
  defaultVariants: {
    size: "md",
  },
});

export function Modal(props: ModalOverlayProps & VariantProps<typeof modalStyles>) {
  const { children, size, ...rest } = props;
  return (
    <ModalOverlay {...rest} className={overlayStyles}>
      <RACModal className={modalStyles({ size })}>{children}</RACModal>
    </ModalOverlay>
  );
}
