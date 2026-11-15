import clsx from "clsx";
import { useState } from "react";
import type { PointerEvent } from "react";

import { drawnStrokePath, SCRIBBLE_PAPER, scribbleOutline } from "./scribbles";
import type { ScribblePoint, ScribbleShape } from "./scribbles";

type Props = {
  strokes: ScribblePoint[][];
  // Called with all strokes when one is finished.
  onChange: (strokes: ScribblePoint[][]) => void;
  pen: string;
  size?: number;
  shape?: ScribbleShape;
  label?: string;
  className?: string | undefined;
};

// Draw a doodle with the pointer on a scrap of paper, round or a squircle. Strokes are in the 100
// box, like the generated doodles; `drawnScribbleImage` turns them into a picture.
export function ScribbleCanvas({
  strokes,
  onChange,
  pen,
  size = 200,
  shape = "circle",
  label = "Drawing area",
  className,
}: Props) {
  const [drawing, setDrawing] = useState<ScribblePoint[] | null>(null);
  const point = (event: PointerEvent<SVGSVGElement>): ScribblePoint => {
    const box = event.currentTarget.getBoundingClientRect();
    return [
      ((event.clientX - box.left) / box.width) * 100,
      ((event.clientY - box.top) / box.height) * 100,
    ];
  };
  const finish = () => {
    if (drawing) onChange([...strokes, drawing]);
    setDrawing(null);
  };
  const shown = drawing ? [...strokes, drawing] : strokes;
  return (
    <svg
      viewBox="0 0 100 100"
      width={size}
      height={size}
      aria-label={label}
      className={clsx("shrink-0 cursor-crosshair touch-none", className)}
      onPointerDown={(event) => {
        event.currentTarget.setPointerCapture(event.pointerId);
        setDrawing([point(event)]);
      }}
      onPointerMove={(event) => {
        if (!drawing) return;
        const p = point(event);
        const last = drawing[drawing.length - 1]!;
        // Skip jitter under half a unit, so the line stays smooth.
        if (Math.hypot(p[0] - last[0], p[1] - last[1]) < 0.6) return;
        setDrawing([...drawing, p]);
      }}
      onPointerUp={finish}
      onPointerCancel={finish}
    >
      <path d={scribbleOutline(shape)} fill={SCRIBBLE_PAPER} />
      <g fill="none" stroke={pen} strokeWidth={5.5} strokeLinecap="round" strokeLinejoin="round">
        {shown.map((points, i) => (
          <path key={i} d={drawnStrokePath(points)} />
        ))}
      </g>
    </svg>
  );
}
