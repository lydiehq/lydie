import clsx from "clsx";

import { DOODLE_COLORS, DOODLE_VIEW_BOX, doodlePaths, doodleStrokeWidth } from "./doodles";
import type { Doodle, DoodleColor } from "./doodles";

type Props = {
  doodle: Doodle;
  color?: DoodleColor;
  // In px; without it the doodle is as tall as the text (1em), with the line of a small icon.
  size?: number;
  className?: string | undefined;
};

// A pen doodle as an icon: a few wobbly strokes in one of the doodle colours, no paper behind.
export function DoodleIcon({ doodle, color = "gray", size, className }: Props) {
  const { paths, transform } = doodlePaths(doodle);
  return (
    <svg
      viewBox={DOODLE_VIEW_BOX}
      width={size ?? "1em"}
      height={size ?? "1em"}
      aria-hidden
      data-doodle={doodle.id}
      className={clsx("shrink-0", DOODLE_COLORS[color], className)}
    >
      <g
        transform={transform}
        fill="none"
        stroke="currentColor"
        strokeWidth={doodleStrokeWidth(size ?? 16)}
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        {paths.map((d, i) => (
          <path key={i} d={d} />
        ))}
      </g>
    </svg>
  );
}
