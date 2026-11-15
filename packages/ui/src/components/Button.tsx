import clsx from "clsx";
import type React from "react";
import {
  Button as RAButton,
  type ButtonProps as ReactAriaButtonProps,
  Link as RALink,
  type LinkProps as ReactAriaLinkProps,
} from "react-aria-components";
import { tv, type VariantProps } from "tailwind-variants";

import { Loading3Regular } from "../icons/mingcute";
import { Tooltip, type TooltipOptions, TooltipTrigger } from "./Tooltip";
import { focusRingClass } from "./utils";

// The button look, shared by Button, LinkButton and anything that has to be a plain element (a
// draggable tab, a row action) but should look like a button. An icon without a `size-*` class
// takes the size's icon size; `data-icon="inline-start"` (or `"inline-end"`) on it pulls the
// padding on that side in. `data-current` marks the selected item of a set (the open view).
export const buttonStyles = tv({
  base: [
    "relative isolate inline-flex shrink-0 items-center justify-center font-medium whitespace-nowrap no-underline select-none",
    "rounded-[var(--button-radius)]",
    "disabled:cursor-not-allowed disabled:opacity-50",
    "[&_svg]:pointer-events-none [&_svg]:shrink-0",
    focusRingClass,
  ].join(" "),
  variants: {
    variant: {
      // Flat very dark gray: no gradient, rim or shadow. The ramp mirrors in dark mode, so it
      // turns near-white there with a dark label.
      primary:
        "border border-transparent bg-gray-900 text-surface hover:bg-gray-800 pressed:bg-gray-700 disabled:opacity-40",
      // Raised on a hairline border that strengthens on hover (Numina's secondary button).
      secondary:
        "surface-depth bg-elevated text-gray-900 not-data-current:hover:border-gray-950/12 disabled:bg-gray-100 disabled:text-gray-500",
      // Selected (`data-current`) is a flat grey; hover is fainter, or every hovered item of the
      // set would look selected.
      ghost:
        "border border-transparent bg-transparent text-gray-700 hover:bg-gray-950/5 hover:text-gray-900 pressed:bg-gray-950/8 data-current:bg-gray-950/6 data-current:text-gray-900 data-current:hover:bg-gray-950/6",
      // The only danger button: ghost with red text, never a solid red block.
      destructive:
        "border border-transparent bg-transparent text-red-600 hover:bg-red-600/10 pressed:bg-red-600/15",
    },
    // Text sizes are 2px under Numina's (sm, default, lg); icon-2xs..icon-lg are Numina's
    // icon-2xs, icon-xs, icon-sm, icon, icon-lg. xs and the xl pair are Lydie's own.
    size: {
      xs: "h-5.5 gap-1 px-2 text-xs [--button-radius:var(--radius-md)] has-data-[icon=inline-end]:pr-1.5 has-data-[icon=inline-start]:pl-1.5 [&_svg:not([class*='size-'])]:size-3.5",
      sm: "h-7 gap-1 px-2.5 text-[0.8125rem] [--button-radius:var(--radius-md)] has-data-[icon=inline-end]:pr-1.5 has-data-[icon=inline-start]:pl-1.5 [&_svg:not([class*='size-'])]:size-4",
      md: "h-7.5 gap-1.5 px-2.5 text-[0.8125rem] [--button-radius:var(--radius-lg)] has-data-[icon=inline-end]:pr-2 has-data-[icon=inline-start]:pl-2 [&_svg:not([class*='size-'])]:size-4",
      lg: "h-8.5 gap-1.5 px-2.5 text-[0.8125rem] [--button-radius:var(--radius-lg)] has-data-[icon=inline-end]:pr-2 has-data-[icon=inline-start]:pl-2 [&_svg:not([class*='size-'])]:size-4",
      xl: "h-10.5 gap-2.5 px-8 text-sm [--button-radius:var(--radius-xl)] [&_svg:not([class*='size-'])]:size-5",
      "icon-2xs": "size-5 [--button-radius:var(--radius-sm)] [&_svg:not([class*='size-'])]:size-4",
      "icon-xs": "size-6 [--button-radius:var(--radius-md)] [&_svg:not([class*='size-'])]:size-4",
      "icon-sm": "size-7.5 [--button-radius:var(--radius-md)] [&_svg:not([class*='size-'])]:size-4",
      "icon-md": "size-8 [--button-radius:var(--radius-lg)] [&_svg:not([class*='size-'])]:size-4",
      "icon-lg": "size-9 [--button-radius:var(--radius-lg)] [&_svg:not([class*='size-'])]:size-4",
      "icon-xl": "size-11 [--button-radius:var(--radius-xl)] [&_svg:not([class*='size-'])]:size-5",
    },
    rounded: {
      true: "[--button-radius:9999px]",
      false: "",
    },
  },
  defaultVariants: {
    variant: "primary",
    size: "md",
    rounded: false,
  },
});

export type ButtonVariants = VariantProps<typeof buttonStyles>;

type StyleProps = ButtonVariants & {
  className?: string;
  children?: React.ReactNode;
};

export type ButtonProps = Omit<ReactAriaButtonProps, "className" | "children"> &
  StyleProps & {
    isPending?: boolean;
    ref?: React.Ref<HTMLButtonElement>;
    // Shown on hover and keyboard focus. An icon size shows its `aria-label` without being asked,
    // since nothing else says what the button does; `false` turns that off.
    tooltip?: React.ReactNode | false;
    tooltipOptions?: TooltipOptions;
  };

export function Button({
  className,
  children,
  variant,
  size,
  rounded,
  tooltip,
  tooltipOptions,
  ...props
}: ButtonProps) {
  const button = (
    <RAButton
      {...props}
      className={buttonStyles({ variant, size, rounded, className })}
      data-variant={variant ?? "primary"}
    >
      <PendingContent isPending={props.isPending} size={size}>
        {children}
      </PendingContent>
    </RAButton>
  );

  const tip = tooltip ?? (size?.startsWith("icon-") ? props["aria-label"] : undefined);
  if (tip === undefined || tip === false || tip === "") return button;
  const { delay, ...options } = tooltipOptions ?? {};
  return (
    <TooltipTrigger delay={delay ?? 500}>
      {button}
      <Tooltip {...options}>{tip}</Tooltip>
    </TooltipTrigger>
  );
}

export type LinkButtonProps = Omit<ReactAriaLinkProps, "className" | "children"> &
  StyleProps & {
    ref?: React.Ref<HTMLAnchorElement>;
  };

// A link that looks like a button: it navigates, it does not act.
export function LinkButton({
  className,
  children,
  variant,
  size,
  rounded,
  ...props
}: LinkButtonProps) {
  return (
    <RALink
      {...props}
      className={buttonStyles({ variant, size, rounded, className })}
      data-variant={variant ?? "primary"}
    >
      {children}
    </RALink>
  );
}

// While pending the label fades and a spinner takes its place, so the button keeps its width.
function PendingContent({
  children,
  isPending,
  size,
}: {
  children: React.ReactNode;
  isPending: boolean | undefined;
  size: ButtonVariants["size"];
}) {
  if (isPending === undefined) return children;
  return (
    <span className="relative inline-flex items-center justify-center gap-[inherit]">
      <span
        className={clsx(
          "inline-flex items-center justify-center gap-[inherit] transition-[opacity,scale,filter] duration-200 ease-out",
          isPending && "scale-75 opacity-0 blur-[4px]",
        )}
      >
        {children}
      </span>
      {isPending && (
        <span aria-hidden className="absolute inset-0 flex items-center justify-center">
          <Loading3Regular className={clsx(spinnerSize(size), "animate-spin")} />
        </span>
      )}
    </span>
  );
}

function spinnerSize(size: ButtonVariants["size"]) {
  switch (size) {
    case "xs":
    case "icon-2xs":
      return "size-3.5";
    case "xl":
    case "icon-xl":
      return "size-5";
    default:
      return "size-4";
  }
}
