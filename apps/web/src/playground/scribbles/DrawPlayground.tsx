import { useApp } from "@lydie/plugin-api";
import {
  Button,
  Copy2Regular,
  SCRIBBLE_PAPER,
  SCRIBBLE_PENS,
  ScribbleIcon,
  SCRIBBLES,
  SQUIRCLE_PATH,
  WithTooltip,
} from "@lydie/plugin-api/ui";
import { useRef, useState } from "react";
import type { PointerEvent } from "react";

const STORAGE_KEY = "doodle";
const CANVAS = 280;

type P = [number, number];
type Doodle = { pen: string; strokes: P[][] };

const EMPTY: Doodle = { pen: SCRIBBLE_PENS[0]!, strokes: [] };

const n = (v: number) => Math.round(v * 10) / 10;

// A stroke through its points, smoothed by running quadratics through the midpoints.
function strokePath(points: P[]): string {
  const [first, ...rest] = points;
  if (!first) return "";
  if (rest.length === 0) return `M${n(first[0])} ${n(first[1])}l0.01 0`;
  let d = `M${n(first[0])} ${n(first[1])}`;
  for (let i = 0; i < rest.length - 1; i++) {
    const [x, y] = rest[i]!;
    const [nx, ny] = rest[i + 1]!;
    d += `Q${n(x)} ${n(y)} ${n((x + nx) / 2)} ${n((y + ny) / 2)}`;
  }
  const last = rest[rest.length - 1]!;
  return `${d}L${n(last[0])} ${n(last[1])}`;
}

function DoodleIcon({ doodle, size }: { doodle: Doodle; size: number }) {
  return (
    <svg viewBox="0 0 100 100" width={size} height={size} aria-hidden className="shrink-0">
      <path d={SQUIRCLE_PATH} fill={SCRIBBLE_PAPER} />
      <g
        fill="none"
        stroke={doodle.pen}
        strokeWidth={Math.max(4.6, (1.3 * 100) / size)}
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        {doodle.strokes.map((points, i) => (
          <path key={i} d={strokePath(points)} />
        ))}
      </g>
    </svg>
  );
}

// Draw your own workspace doodle: one pen, any number of strokes, previewed at icon sizes.
export function DrawPlayground() {
  const app = useApp();
  const [doodle, setDoodle] = useState<Doodle>(() => app.storage.get<Doodle>(STORAGE_KEY) ?? EMPTY);
  const [drawing, setDrawing] = useState<P[] | null>(null);
  const [copied, setCopied] = useState(false);
  const exported = useRef<HTMLDivElement>(null);

  const save = (next: Doodle) => {
    setDoodle(next);
    app.storage.set(STORAGE_KEY, next);
  };
  const point = (event: PointerEvent<SVGSVGElement>): P => {
    const box = event.currentTarget.getBoundingClientRect();
    return [
      ((event.clientX - box.left) / box.width) * 100,
      ((event.clientY - box.top) / box.height) * 100,
    ];
  };
  const down = (event: PointerEvent<SVGSVGElement>) => {
    event.currentTarget.setPointerCapture(event.pointerId);
    setDrawing([point(event)]);
  };
  const move = (event: PointerEvent<SVGSVGElement>) => {
    if (!drawing) return;
    const p = point(event);
    const last = drawing[drawing.length - 1]!;
    // Skip jitter under half a unit, so the line stays smooth.
    if (Math.hypot(p[0] - last[0], p[1] - last[1]) < 0.6) return;
    setDrawing([...drawing, p]);
  };
  const up = () => {
    if (drawing) save({ ...doodle, strokes: [...doodle.strokes, drawing] });
    setDrawing(null);
  };
  const shown: Doodle = drawing ? { ...doodle, strokes: [...doodle.strokes, drawing] } : doodle;

  const copy = async () => {
    const svg = exported.current?.querySelector("svg");
    if (!svg) return;
    await navigator.clipboard.writeText(svg.outerHTML);
    setCopied(true);
    setTimeout(() => setCopied(false), 1200);
  };

  return (
    <div className="flex min-h-0 grow overflow-y-auto" data-testid="draw-playground">
      <div className="m-auto flex flex-col items-center gap-6 p-8">
        <svg
          viewBox="0 0 100 100"
          width={CANVAS}
          height={CANVAS}
          aria-label="Drawing area"
          className="cursor-crosshair touch-none"
          onPointerDown={down}
          onPointerMove={move}
          onPointerUp={up}
          onPointerCancel={up}
        >
          <path d={SQUIRCLE_PATH} fill={SCRIBBLE_PAPER} />
          <g
            fill="none"
            stroke={shown.pen}
            strokeWidth={4.6}
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            {shown.strokes.map((points, i) => (
              <path key={i} d={strokePath(points)} />
            ))}
          </g>
        </svg>

        <div className="flex items-end gap-3" ref={exported}>
          {[64, 40, 24, 16].map((size) => (
            <DoodleIcon key={size} doodle={shown} size={size} />
          ))}
        </div>

        <div className="flex items-center gap-2">
          {SCRIBBLE_PENS.map((pen) => (
            <button
              key={pen}
              type="button"
              aria-label={`Pen ${pen}`}
              aria-pressed={doodle.pen === pen}
              onClick={() => save({ ...doodle, pen })}
              className="size-6 rounded-full outline-offset-2 transition-transform hover:scale-110 aria-pressed:outline-2 aria-pressed:outline-gray-800"
              style={{ background: pen }}
            />
          ))}
        </div>

        <div className="flex items-center gap-1.5">
          <Button
            size="xs"
            variant="secondary"
            isDisabled={doodle.strokes.length === 0}
            onPress={() => save({ ...doodle, strokes: doodle.strokes.slice(0, -1) })}
          >
            Undo
          </Button>
          <Button
            size="xs"
            variant="secondary"
            isDisabled={doodle.strokes.length === 0}
            onPress={() => save({ ...doodle, strokes: [] })}
          >
            Clear
          </Button>
          <Button size="xs" variant="secondary" onPress={() => void copy()}>
            <Copy2Regular data-icon="inline-start" />
            {copied ? "Copied" : "Copy SVG"}
          </Button>
        </div>

        <div className="flex flex-wrap justify-center gap-2">
          {SCRIBBLES.map((scribble) => (
            <WithTooltip key={scribble.id} label={`Start from ${scribble.name.toLowerCase()}`}>
              <button
                type="button"
                aria-label={`Start from ${scribble.name.toLowerCase()}`}
                onClick={() => save({ ...doodle, strokes: scribble.strokes() })}
                className="rounded-[9px] opacity-70 transition-opacity hover:opacity-100"
              >
                <ScribbleIcon choice={{ scribble, pen: doodle.pen, seed: scribble.id }} size={28} />
              </button>
            </WithTooltip>
          ))}
        </div>
      </div>
    </div>
  );
}
