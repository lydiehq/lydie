import clsx from "clsx";
import { type VariantProps, cva } from "cva";

const wrapperStyles = cva({
  base: "shadow-surface bg-white flex flex-col z-1 relative justify-center",
  variants: {
    size: {
      sm: "aspect-[12/14] w-3.5 rounded-[2.5px] p-[2px] gap-px",
      md: "aspect-[12/15] w-3.5 rounded-[3px] p-[2px] gap-px",
      lg: "aspect-[12/15] w-5 rounded-[4px] p-1 gap-0.5",
    },
  },
  defaultVariants: {
    size: "md",
  },
});

const barStyles = cva({
  base: "transition-all duration-200 rounded-xs shrink-0 h-0.5",
  variants: {
    active: {
      true: "bg-black/25",
      false: "bg-black/15",
    },
  },
  defaultVariants: {
    active: false,
  },
});

export type CollectionItemIconVariants = VariantProps<typeof wrapperStyles>;

type Props = CollectionItemIconVariants & {
  className?: string;
  active?: boolean;
};

const bars = [75, 60, 90, 60];

export function CollectionItemIcon({ className, active = false, size = "md" }: Props) {
  return (
    <div className="grid grid-cols-2 gap-[2px]">
      {[...Array(4)].map((_, index) => (
        <div key={index} className="bg-white shadow-surface rounded-[1.5px] size-[6px]" />
      ))}
    </div>
  );

  return (
    <div className={clsx("relative", className)}>
      <div className={wrapperStyles({ size })}>
        {bars.map((bar) => (
          <div key={bar} className={barStyles({ active })} style={{ width: `${bar}%` }} />
        ))}
      </div>
    </div>
  );
}
