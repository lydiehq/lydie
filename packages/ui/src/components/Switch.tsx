import React from "react";
import { Switch as AriaSwitch, type SwitchProps as AriaSwitchProps } from "react-aria-components";
import { tv } from "tailwind-variants";

import { composeTailwindRenderProps, focusRingFor } from "./utils";

export interface SwitchProps extends Omit<AriaSwitchProps, "children"> {
  children?: React.ReactNode;
}

// Also drawn by a menu item with `indicator="switch"`.
export const switchTrack = tv({
  extend: focusRingFor,
  base: "relative flex h-4 w-7 px-px items-center shrink-0 cursor-default rounded-full transition duration-200 ease-in-out border border-transparent",
  variants: {
    // On, the track is the primary button's flat gray.
    isSelected: {
      false: "bg-gray-400 group-pressed:bg-gray-500",
      // react-aria's hover, not :hover, so a disabled switch does not lighten under the pointer.
      true: "bg-gray-800 group-hovered:bg-gray-700 group-pressed:bg-gray-600 forced-colors:bg-[Highlight]!",
    },
    // Faded like a disabled button or field, on or off.
    isDisabled: {
      true: "cursor-not-allowed opacity-50 forced-colors:group-selected:bg-[GrayText]! forced-colors:border-[GrayText]",
    },
  },
});

// Raised like Numina's thumb (`surface-depth` on the elevated fill), in both states, but round.
export const switchHandle = tv({
  base: "surface-depth h-3 w-3 transform rounded-full bg-elevated outline -outline-offset-1 outline-transparent transition duration-200 ease-in-out",
  variants: {
    isSelected: {
      false: "translate-x-0",
      true: "translate-x-full",
    },
    isDisabled: {
      true: "forced-colors:outline-[GrayText]",
    },
  },
});

export function Switch({ children, ...props }: SwitchProps) {
  return (
    <AriaSwitch
      {...props}
      className={composeTailwindRenderProps(
        props.className,
        "group flex gap-2 items-center text-gray-800 disabled:cursor-not-allowed disabled:text-gray-300 forced-colors:disabled:text-[GrayText] text-sm transition",
      )}
    >
      {(renderProps) => (
        <>
          <div className={switchTrack(renderProps)}>
            <span className={switchHandle(renderProps)} />
          </div>
          {children && <span>{children}</span>}
        </>
      )}
    </AriaSwitch>
  );
}
