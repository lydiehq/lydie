import type { VariantProps } from "cva";
import { cva } from "cva";
import { type JSX } from "react";
import { Heading as RACHeading } from "react-aria-components";

const styles = cva({
  base: "text-gray-950 dark:text-white leading-none font-heading",
  variants: {
    level: {
      1: "text-xl/none font-medium",
      2: "text-base/none font-medium",
      3: "text-lg/none font-semibold",
      4: "text-base/none font-semibold",
    },
  },
});

type Props = JSX.IntrinsicElements["h1"] & VariantProps<typeof styles>;

export function Heading({ children, level = 1, className, ...rest }: Props) {
  return (
    <RACHeading level={level} className={styles({ level, className })} {...rest}>
      {children}
    </RACHeading>
  );
}
