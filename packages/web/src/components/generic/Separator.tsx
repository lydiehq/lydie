import { cva } from "cva";
import { Separator as RACSeparator, type SeparatorProps } from "react-aria-components";

const styles = cva({
  base: "bg-black/3 border-black/3",
  variants: {
    orientation: {
      horizontal: "h-px",
      vertical: "w-px",
    },
  },
  defaultVariants: {
    orientation: "horizontal",
  },
});

export function Separator(props: SeparatorProps) {
  return (
    <RACSeparator
      {...props}
      className={styles({
        orientation: props.orientation,
        className: props.className,
      })}
    />
  );
}
