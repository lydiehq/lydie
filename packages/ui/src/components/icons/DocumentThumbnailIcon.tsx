import { COLORS } from "@lydie/core/colors";
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
      true: "bg-black/15",
      false: "bg-black/15",
    },
  },
  defaultVariants: {
    active: false,
  },
});

export type DocumentThumbnailIconVariants = VariantProps<typeof wrapperStyles>;

type Props = DocumentThumbnailIconVariants & {
  className?: string;
  active?: boolean;
  showFoldDecoration?: boolean;
};

const bars = [75, 60, 90, 65];

const COLOR = COLORS[0].value;

/** Darken a hex color by a factor 0–1 (e.g. 0.2 = 20% darker). */
function darkenHex(hex: string, amount: number): string {
  const n = hex.replace("#", "");
  const r = Math.max(0, Math.round(parseInt(n.slice(0, 2), 16) * (1 - amount)));
  const g = Math.max(0, Math.round(parseInt(n.slice(2, 4), 16) * (1 - amount)));
  const b = Math.max(0, Math.round(parseInt(n.slice(4, 6), 16) * (1 - amount)));
  return "#" + [r, g, b].map((x) => x.toString(16).padStart(2, "0")).join("");
}

const FOLD_SHADOW_AMOUNT = 0.2;

export function DocumentThumbnailIcon({
  className,
  active = false,
  showFoldDecoration = false,
  size = "md",
}: Props) {
  if (showFoldDecoration) {
    return (
      <div className={clsx("relative", className)}>
        <div className="absolute -left-[2px] inset-y-1 z-10 flex flex-col justify-between">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="h-[1.5px] w-[5px] shrink-0 rounded-full bg-gray-300 relative" />
          ))}
        </div>
        <div className={wrapperStyles({ size })} />
      </div>
    );
  }

  // if (showFoldDecoration) {
  //   const darker = darkenHex(COLOR, FOLD_SHADOW_AMOUNT);
  //   return (
  //     <div className={clsx("relative", className)}>
  //       <div
  //         className="absolute -top-0.5 w-2 left-0 h-0.5 rounded-t-lg"
  //         style={{ backgroundColor: darker }}
  //       />
  //       <div
  //         className="h-[12px] w-[13px] rounded-b-[3px] rounded-r-[1.5px]"
  //         style={{ backgroundColor: darker }}
  //       ></div>
  //       <div
  //         className="absolute ring border border-black/10 ring-[#f8f8f8] left-px -right-[2px] bottom-0 top-[3px] -skew-x-14 rounded-[2px]"
  //         style={{ backgroundColor: COLOR }}
  //       ></div>
  //     </div>
  //   );
  // }

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
