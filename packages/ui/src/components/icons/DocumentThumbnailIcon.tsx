import { Database16Filled } from "@fluentui/react-icons";
import clsx from "clsx";
import { type VariantProps, cva } from "cva";

const wrapperStyles = cva({
  base: "shadow-surface bg-white flex flex-col z-1 relative",
  variants: {
    size: {
      md: "h-4 w-3.5 rounded-[3px] p-0.5 gap-px",
      lg: "h-6 w-6 rounded-[4px] p-1 gap-0.5",
    },
  },
  defaultVariants: {
    size: "md",
  },
});

const barStyles = cva({
  base: "transition-all duration-200 rounded-xs",
  variants: {
    size: {
      md: "h-0.5",
      lg: "h-1",
    },
    active: {
      true: "bg-black/40",
      false: "bg-black/20",
    },
  },
  defaultVariants: {
    size: "md",
    active: false,
  },
});

const iconStyles = cva({
  base: "text-black/35 absolute top-1/2 -translate-y-1/2 left-1/2 -translate-x-1/2",
  variants: {
    size: {
      md: "size-[11px]",
      lg: "size-4",
    },
  },
  defaultVariants: {
    size: "md",
  },
});

export type DocumentThumbnailIconVariants = VariantProps<typeof wrapperStyles>;

type Props = DocumentThumbnailIconVariants & {
  className?: string;
  active?: boolean;
  showFoldDecoration?: boolean;
};

const bars = [40, 80, 70, 90, 60];

export function DocumentThumbnailIcon({
  className,
  active = false,
  showFoldDecoration = false,
  size = "md",
}: Props) {
  // if (showFoldDecoration) {
  //   return (
  //     <div className={clsx("relative", className)}>
  //       <div className={wrapperStyles({ size })}>
  //         <Database16Filled className={iconStyles({ size })} />
  //       </div>
  //     </div>
  //   );
  // }

  return (
    <div className={clsx("relative", className)}>
      <div className={wrapperStyles({ size })}>
        {bars.map((bar) => (
          <div key={bar} className={barStyles({ size, active })} style={{ width: `${bar}%` }} />
        ))}
      </div>
    </div>
  );
}
