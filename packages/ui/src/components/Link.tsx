import type { LinkProps as AriaLinkProps } from "react-aria-components";
import { composeRenderProps, Link as AriaLink } from "react-aria-components";
import { tv } from "tailwind-variants";

import { focusRing } from "./utils";

interface LinkProps extends AriaLinkProps {
  variant?: "primary" | "secondary";
}

const styles = tv({
  extend: focusRing,
  base: "underline disabled:no-underline disabled:cursor-default forced-colors:disabled:text-[GrayText] transition rounded-xs [-webkit-tap-highlight-color:transparent]",
  variants: {
    variant: {
      primary: "text-blue-600 underline decoration-blue-600/60 hover:decoration-blue-600",
      secondary: "text-gray-700 underline decoration-gray-700/50 hover:decoration-gray-700",
    },
  },
  defaultVariants: {
    variant: "primary",
  },
});

export function Link(props: LinkProps) {
  return (
    <AriaLink
      {...props}
      className={composeRenderProps(props.className, (className, renderProps) =>
        styles({ ...renderProps, className, variant: props.variant }),
      )}
    />
  );
}
