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
    // On, the track is the primary button (`button-primary`); the handle takes its label colour.
    isSelected: {
      false: "bg-gray-400 shadow-inner group-pressed:bg-gray-500",
      true: "button-primary group-hover:[--button-primary-overlay:rgb(40_80_170/0.2)] group-pressed:[--button-primary-overlay:rgb(32_66_150/0.36)] forced-colors:bg-[Highlight]!",
    },
    isDisabled: {
      true: "bg-gray-200 forced-colors:group-selected:bg-[GrayText]! forced-colors:border-[GrayText]",
    },
  },
});

export const switchHandle = tv({
  base: "h-3 w-3 transform rounded-full outline -outline-offset-1 outline-transparent shadow-xs transition duration-200 ease-in-out",
  variants: {
    isSelected: {
      false: "translate-x-0 bg-surface",
      true: "translate-x-full bg-current",
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
        "group flex gap-2 items-center text-gray-800 disabled:text-gray-300 forced-colors:disabled:text-[GrayText] text-sm transition",
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
