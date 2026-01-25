import { type VariantProps, cva } from "cva";
import React from "react";
import { Toolbar as RACToolbar, ToolbarProps, composeRenderProps } from "react-aria-components";
import { twMerge } from "tailwind-merge";

const styles = cva({
  base: "flex gap-2",
  variants: {
    orientation: {
      horizontal: "flex-row",
      vertical: "flex-col items-start",
    },
  },
  defaultVariants: {
    orientation: "horizontal",
  },
});

export function Toolbar({
  className,
  orientation,
  ...props
}: ToolbarProps & VariantProps<typeof styles>) {
  return (
    <RACToolbar
      {...props}
      className={composeRenderProps(className, (className, renderProps) =>
        twMerge(styles({ orientation, className })),
      )}
    />
  );
}
