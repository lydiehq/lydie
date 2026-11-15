import React from "react";
import {
  composeRenderProps,
  OverlayArrow,
  Popover as AriaPopover,
  PopoverContext,
  type PopoverProps as AriaPopoverProps,
  useSlottedContext,
} from "react-aria-components";
import { tv } from "tailwind-variants";

export interface PopoverProps extends Omit<AriaPopoverProps, "children"> {
  showArrow?: boolean;
  children: React.ReactNode;
}

const styles = tv({
  // Numina's popup motion: 150 ms both ways, fading and scaling from 97 % towards the trigger.
  base: "bg-elevated shadow-popover rounded-lg bg-clip-padding text-gray-700 origin-(--trigger-anchor-point)",
  variants: {
    isEntering: {
      true: "animate-in fade-in motion-safe:zoom-in-97 duration-150 ease-out-strong",
    },
    isExiting: {
      true: "animate-out fade-out motion-safe:zoom-out-97 duration-150 ease-out-strong",
    },
  },
});

export function Popover({ children, showArrow, className, ...props }: PopoverProps) {
  let popoverContext = useSlottedContext(PopoverContext)!;
  let isSubmenu = popoverContext?.trigger === "SubmenuTrigger";
  let offset = showArrow ? 12 : 8;
  offset = isSubmenu ? offset - 6 : offset;
  return (
    <AriaPopover
      offset={offset}
      {...props}
      className={composeRenderProps(className, (className, renderProps) =>
        styles({ ...renderProps, className }),
      )}
    >
      {showArrow && (
        <OverlayArrow className="group">
          <svg
            width={12}
            height={12}
            viewBox="0 0 12 12"
            className="block fill-elevated forced-colors:fill-[Canvas] stroke-1 stroke-gray-950/10  forced-colors:stroke-[ButtonBorder] group-placement-bottom:rotate-180 group-placement-left:-rotate-90 group-placement-right:rotate-90"
          >
            <path d="M0 0 L6 6 L12 0" />
          </svg>
        </OverlayArrow>
      )}
      {children}
    </AriaPopover>
  );
}
