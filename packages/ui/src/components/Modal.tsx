import { Modal as RACModal, ModalOverlay, type ModalOverlayProps } from "react-aria-components";
import { tv, type VariantProps } from "tailwind-variants";

// Motion: the backdrop fades (150 ms) while the dialog pops in from 95 % (200 ms,
// ease-out-strong), and both reverse on close. CSS transitions driven by react-aria's
// isEntering/isExiting (its first frame is the starting state), and react-aria keeps the dialog
// mounted until the exit transition has finished. `starting:` (@starting-style) does not work
// here: react-aria reads the overlay's animations as it mounts, so the start is already past.
export const overlayStyles = tv({
  base: "fixed top-0 left-0 w-full h-(--visual-viewport-height) isolate z-40 bg-black/[15%] dark:bg-black/50 flex items-center justify-center p-4 text-center transition-opacity duration-150 ease-out",
  variants: {
    isEntering: { true: "opacity-0" },
    isExiting: { true: "opacity-0" },
  },
});

export const modalStyles = tv({
  base: "w-full max-h-full rounded-lg bg-elevated forced-colors:bg-[Canvas] text-left align-middle text-gray-700 shadow-dialog bg-clip-padding transition-[opacity,scale] duration-200 ease-out-strong",
  variants: {
    size: {
      sm: "max-w-sm",
      md: "max-w-md",
      lg: "max-w-lg",
      xl: "max-w-xl",
      // Nearly the whole window (settings).
      screen: "max-w-[92.5rem] h-full sm:mx-8 overflow-hidden",
    },
    isEntering: { true: "scale-95 opacity-0" },
    isExiting: { true: "pointer-events-none scale-95 opacity-0" },
  },
  defaultVariants: {
    size: "md",
  },
});

export function Modal(props: ModalOverlayProps & VariantProps<typeof modalStyles>) {
  const { children, size, ...rest } = props;
  return (
    <ModalOverlay {...rest} className={overlayStyles}>
      <RACModal className={(state) => modalStyles({ ...state, size })}>{children}</RACModal>
    </ModalOverlay>
  );
}
