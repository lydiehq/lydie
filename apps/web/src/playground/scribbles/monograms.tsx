import { SCRIBBLE_PAPER, SQUIRCLE_PATH } from "@lydie/plugin-api/ui";

import { catmullRom, inkPath } from "./gestures.tsx";
import type { P } from "./gestures.tsx";

// Initials written as a signature: drawn by hand as the points a pen passes through, never set
// in a font. Each monogram is one or more strokes in the same even ink as the v2 flourishes.

export type Monogram = { initials: string; strokes: P[][] };

export const MONOGRAMS: Monogram[] = [
  {
    initials: "LS",
    strokes: [
      catmullRom(
        [
          // L: a lead-in rising to a small loop at the top…
          [34, 30],
          [44, 17],
          [51, 9],
          [48, 6],
          [43, 11],
          // …one long slanted downstroke…
          [38, 30],
          [31, 54],
          [24, 76],
          // …a round loop at the foot…
          [18, 84],
          [12, 81],
          [15, 75],
          [24, 75],
          // …then along the baseline and steeply up into the S.
          [38, 78],
          [50, 70],
          [60, 50],
          [69, 28],
          [75, 15],
          // S: a hook at the top…
          [73, 10],
          [66, 13],
          [63, 23],
          // …the spine down and round…
          [68, 37],
          [75, 51],
          [73, 66],
          [62, 74],
          [51, 73],
          // …and a loop under itself into a long flourish.
          [44, 74],
          [44, 81],
          [58, 86],
          [74, 84],
          [90, 76],
        ],
        20,
      ),
    ],
  },
];

export function MonogramIcon({ monogram, size }: { monogram: Monogram; size: number }) {
  // Finer than the flourishes: about 1.8 px at 40 px, a hairline-to-pen line when large.
  const width = Math.max(3.6, (1.8 * 100) / size);
  return (
    <svg viewBox="0 0 100 100" width={size} height={size} aria-hidden className="shrink-0">
      <path d={SQUIRCLE_PATH} fill={SCRIBBLE_PAPER} />
      {monogram.strokes.map((points, i) => (
        <path key={i} d={inkPath(points, width)} fill="#1b1c1f" />
      ))}
    </svg>
  );
}
