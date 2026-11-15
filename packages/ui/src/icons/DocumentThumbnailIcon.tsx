import clsx from "clsx";
import { tv, type VariantProps } from "tailwind-variants";

// v1's document icon: a small page with lines of text. Spans, so it can sit inline (links, mentions).
const wrapperStyles = tv({
  base: "shadow-surface bg-paper flex flex-col z-1 relative justify-center",
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

const barStyles = tv({
  base: "block transition-all duration-200 rounded-xs shrink-0 h-0.5",
  variants: {
    active: {
      true: "bg-gray-950/30",
      false: "bg-gray-950/30",
    },
  },
  defaultVariants: {
    active: false,
  },
});

// A page with pages inside: the same page, shorter, with another popping out up and to the right.
const stackStyles = tv({
  slots: {
    box: "relative block",
    behind: "absolute top-0 shadow-surface bg-paper",
    front: "absolute bottom-0 left-0 flex flex-col justify-center shadow-surface bg-paper",
  },
  variants: {
    size: {
      sm: {
        box: "h-[15px] w-3.5",
        behind: "-right-px left-[2px] h-[10px] rounded-[2.5px]",
        front: "right-px h-[12px] rounded-[2.5px] p-[2px] gap-px",
      },
      md: {
        box: "h-[15px] w-3.5",
        behind: "-right-px left-[2px] h-[10px] rounded-[2.5px]",
        front: "right-px h-[12px] rounded-[2.5px] p-[2px] gap-px",
      },
      lg: {
        box: "h-[21px] w-5",
        behind: "-right-px left-[3px] h-[14px] rounded-[4px]",
        front: "right-px h-[17px] rounded-[4px] p-1 gap-0.5",
      },
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
  // A page with pages inside: a shorter page with another popping out behind it.
  showFoldDecoration?: boolean;
};

const bars = [75, 60, 90, 65];

export function DocumentThumbnailIcon({
  className,
  active = false,
  showFoldDecoration = false,
  size = "md",
}: Props) {
  if (showFoldDecoration) {
    const stack = stackStyles({ size });
    return (
      <span aria-hidden className={clsx(stack.box(), className)}>
        <span className={stack.behind()} />
        <span className={stack.front()}>
          {bars.slice(0, 3).map((bar) => (
            <span key={bar} className={barStyles({ active })} style={{ width: `${bar}%` }} />
          ))}
        </span>
      </span>
    );
  }

  return (
    <span aria-hidden className={clsx("relative block", className)}>
      <span className={wrapperStyles({ size })}>
        {bars.map((bar) => (
          <span key={bar} className={barStyles({ active })} style={{ width: `${bar}%` }} />
        ))}
      </span>
    </span>
  );
}
