import type { TooltipTriggerProps } from "react-aria";

import { cva } from "cva";
import React from "react";
import {
  Tooltip as AriaTooltip,
  type TooltipProps as AriaTooltipProps,
  TooltipTrigger as AriaTooltipTrigger,
  OverlayArrow,
  composeRenderProps,
} from "react-aria-components";

export interface TooltipProps extends Omit<AriaTooltipProps, "children"> {
  children: React.ReactNode;
  hotkeys?: string[];
}

const styles = cva({
  base: "group bg-black/85 text-white text-[12px] rounded-sm will-change-transform px-2 py-0.5",
  variants: {
    isEntering: {
      true: "animate-in fade-in placement-bottom:slide-in-from-top-1 placement-top:slide-in-from-bottom-1 placement-left:slide-in-from-right-1 placement-right:slide-in-from-left-1 ease-out duration-75",
    },
  },
});

export function Tooltip({ children, hotkeys, ...props }: TooltipProps) {
  return (
    <AriaTooltip
      {...props}
      offset={14}
      className={composeRenderProps(props.className, (className, renderProps) =>
        styles({ ...renderProps, className }),
      )}
    >
      <OverlayArrow>
        <svg
          width={8}
          height={8}
          viewBox="0 0 8 8"
          className="fill-black/85 forced-colors:fill-[Canvas] group-placement-bottom:rotate-180 group-placement-left:-rotate-90 group-placement-right:rotate-90"
        >
          <path d="M0 0 L4 4 L8 0" />
        </svg>
      </OverlayArrow>
      <div className="flex items-center gap-2">
        <span>{children}</span>
        {hotkeys && hotkeys.length > 0 && (
          <div className="flex items-center gap-0.5">
            {hotkeys.map((key, index) => (
              <kbd
                key={index}
                className="px-1 text-[10px] font-medium text-white/80 border border-white/20 rounded"
              >
                {key}
              </kbd>
            ))}
          </div>
        )}
      </div>
    </AriaTooltip>
  );
}

export function TooltipTrigger({
  children,
  ...props
}: TooltipTriggerProps & { children: React.ReactNode }) {
  return (
    <AriaTooltipTrigger {...props} delay={props.delay || 200} closeDelay={props.closeDelay || 0}>
      {children}
    </AriaTooltipTrigger>
  );
}
