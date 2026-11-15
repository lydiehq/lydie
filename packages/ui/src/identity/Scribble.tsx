import clsx from "clsx";

import {
  SCRIBBLE_LIGHTS,
  SCRIBBLE_PAPER,
  SCRIBBLE_PENS,
  SCRIBBLE_SCREEN,
  scribbleFor,
  scribbleOutline,
  strokesFor,
} from "./scribbles";
import type { ScribbleChoice, ScribbleShape } from "./scribbles";

type Props = {
  seed?: string;
  // "paper" for people and places; "screen" for machines (MCP clients, API tokens, the CLI).
  ink?: "paper" | "screen";
  // A given doodle and pen instead of the seed's.
  choice?: ScribbleChoice;
  size?: number;
  shape?: ScribbleShape;
  className?: string | undefined;
};

// A doodle on beige paper, round (a person) or a squircle (a place).
export function ScribbleIcon({
  seed = "",
  ink = "paper",
  choice,
  size = 20,
  shape = "squircle",
  className,
}: Props) {
  const picked = choice ?? scribbleFor(seed);
  const screen = ink === "screen";
  const pen = screen
    ? (SCRIBBLE_LIGHTS[SCRIBBLE_PENS.indexOf(picked.pen) % SCRIBBLE_LIGHTS.length] ??
      SCRIBBLE_LIGHTS[0]!)
    : picked.pen;
  const { paths, transform } = strokesFor(picked);
  // About 1.3 px wide when small, so the line still reads at 16 px.
  const width = Math.max(4.6, (1.3 * 100) / size);
  const outline = scribbleOutline(shape);
  return (
    <svg
      viewBox="0 0 100 100"
      width={size}
      height={size}
      aria-hidden
      className={clsx("shrink-0", className)}
    >
      <path d={outline} fill={screen ? SCRIBBLE_SCREEN : SCRIBBLE_PAPER} />
      <g
        transform={transform}
        fill="none"
        stroke={pen}
        strokeWidth={width}
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
