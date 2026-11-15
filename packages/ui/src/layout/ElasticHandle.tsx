// The focusable splitter of an elastic panel (role separator with a value, from the hook).
/* oxlint-disable jsx-a11y/prefer-tag-over-role */
import clsx from "clsx";

import type { ElasticPanel } from "./use-elastic-panel.ts";

type Props = {
  panel: Pick<ElasticPanel, "handleProps">;
  label: string;
  // id of the panel element the handle resizes.
  controls: string;
  className?: string;
};

export function ElasticHandle({ panel, label, controls, className }: Props) {
  const disabled = panel.handleProps["aria-disabled"];
  return (
    <div
      aria-label={label}
      aria-controls={controls}
      data-testid={`${controls}-handle`}
      {...panel.handleProps}
      className={clsx(
        // Wider on touch screens, where a 12px target is too small to hit.
        "group/handle relative z-20 -mx-1.5 w-3 shrink-0 touch-none outline-none pointer-coarse:-mx-4 pointer-coarse:w-8",
        disabled ? "pointer-events-none" : "cursor-ew-resize",
        className,
      )}
    >
      {/* Nothing shows on hover or while dragging (the cursor says it all); a full-height line
          when focused from the keyboard. */}
      <div
        aria-hidden
        className="absolute top-1/2 left-1/2 hidden h-full w-0.5 -translate-1/2 rounded-full bg-blue-400 group-focus-visible/handle:block"
      />
    </div>
  );
}
