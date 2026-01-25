import { cva } from "cva";
import { composeRenderProps } from "react-aria-components";
import { twMerge } from "tailwind-merge";

const focusStyles = "outline outline-blue-500 dark:outline-blue-500 outline-offset-2";

export const focusVisibleStyles = `outline-0 ${focusStyles} focus-visible:outline-2 focus:outline-0`;

export const focusRing = cva({
  base: focusStyles,
  variants: {
    isFocusVisible: {
      false: "outline-0",
      true: "outline-2",
    },
  },
});

export function composeTailwindRenderProps<T>(
  className: string | ((v: T) => string) | undefined,
  tw: string,
): string | ((v: T) => string) {
  return composeRenderProps(className, (className) => twMerge(tw, className));
}
