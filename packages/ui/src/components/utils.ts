import { composeRenderProps } from "react-aria-components";
import { twMerge } from "tailwind-merge";
import { tv } from "tailwind-variants";

// The focus ring, the same on every focusable thing. `focus-visible:` matches react-aria's
// data-focus-visible on its components and the native pseudo-class elsewhere, so the classes work on
// plain elements too. The global fallback in styles/index.css draws the same ring.
export const focusRingClass =
  "outline-solid outline-0 outline-offset-2 outline-blue-600 focus-visible:outline-2";

// For things inside a container that clips (scrolling rows, table cells): drawn inside the edge.
export const focusRingInsetClass =
  "outline-solid outline-0 -outline-offset-2 outline-blue-600 focus-visible:outline-2";

export const focusRing = tv({ base: focusRingClass });

// For the visible part of a control whose focus is on a hidden input (a checkbox's box, a switch's
// track): react-aria's isFocusVisible render prop draws the ring.
export const focusRingFor = tv({
  base: "outline-solid outline-0 outline-offset-2 outline-blue-600",
  variants: {
    isFocusVisible: {
      true: "outline-2",
    },
  },
});

export function composeTailwindRenderProps<T>(
  className: string | ((v: T) => string) | undefined,
  tw: string | ((v: T) => string),
): string | ((v: T) => string) {
  return composeRenderProps(className, (className, renderProps) =>
    twMerge(typeof tw === "function" ? tw(renderProps) : tw, className),
  );
}

// Each style function accepts its own variant props; `never` lets any of them be passed in.
type ClassFn = (props: never) => string;

// Merges several variant functions into one render-props className function (what `compose` from
// the cva beta did in v1).
export function compose(...fns: ClassFn[]) {
  return (props: object = {}) => twMerge(...fns.map((fn) => fn(props as never)));
}
