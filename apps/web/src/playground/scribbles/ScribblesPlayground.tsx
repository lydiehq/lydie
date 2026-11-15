import { SCRIBBLE_PENS, ScribbleIcon, SCRIBBLES } from "@lydie/plugin-api/ui";

import { GestureIcon, GESTURES } from "./gestures.tsx";
import { MonogramIcon, MONOGRAMS } from "./monograms.tsx";

// The ten doodles, small, and nothing else; under them v2, ten signature flourishes in black, and
// initials written as a signature.
export function ScribblesPlayground() {
  return (
    <div
      className="flex min-h-0 grow items-center justify-center overflow-y-auto"
      data-testid="scribbles-playground"
    >
      <div className="flex flex-col items-center gap-4 p-8">
        <div className="flex flex-wrap justify-center gap-4">
          {SCRIBBLES.map((scribble, i) => (
            <ScribbleIcon
              key={scribble.id}
              choice={{
                scribble,
                pen: SCRIBBLE_PENS[i % SCRIBBLE_PENS.length]!,
                seed: scribble.id,
              }}
              size={40}
            />
          ))}
        </div>
        <div className="flex flex-wrap justify-center gap-4">
          {GESTURES.map((points, i) => (
            <GestureIcon key={i} points={points} size={40} />
          ))}
        </div>
        <div className="flex flex-wrap justify-center gap-4">
          {MONOGRAMS.map((monogram) => (
            <MonogramIcon key={monogram.initials} monogram={monogram} size={40} />
          ))}
        </div>
      </div>
    </div>
  );
}
