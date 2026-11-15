// When live queries re-run. Every commit that touches a watched table would otherwise re-run every
// live query once; in a burst of writes those reads queue on the database connection (in the
// browser a single one, shared with the writes) and whatever the user does next (open a document)
// waits behind them.
//
// Leading and trailing: the first change after a quiet window re-runs at once, so a single edit
// repaints in the same frame; changes during the window collapse into one run at its end. Runs of
// one query never overlap (changes during a run schedule exactly one more).
//
// The default window is 0: back-to-back edits (an operation, its repaint, the next operation)
// must each repaint within a frame, and a window delays the repaint of an edit that follows the
// previous run too closely. Measured on a burst of 50 writes, the window added little to what
// skipping unrelated re-runs (live-view.ts) and the one-pending rule already save.
export type Rerun = {
  // A watched table changed.
  changed(): void;
  dispose(): void;
};

export const DEFAULT_COALESCE_MS = 0;

export function coalescedRerun(run: () => Promise<void>, windowMs: number): Rerun {
  let running = false;
  let pending = false;
  let disposed = false;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let lastStart = Number.NEGATIVE_INFINITY;

  const fire = async () => {
    timer = null;
    if (disposed) return;
    if (running) {
      pending = true;
      return;
    }
    running = true;
    lastStart = performance.now();
    try {
      await run();
    } finally {
      running = false;
      if (pending && !disposed) {
        pending = false;
        changed();
      }
    }
  };

  const changed = () => {
    if (disposed || timer) return;
    if (running) {
      pending = true;
      return;
    }
    const wait = lastStart + windowMs - performance.now();
    if (wait <= 0) void fire();
    else timer = setTimeout(() => void fire(), wait);
  };

  return {
    changed,
    dispose() {
      disposed = true;
      if (timer) clearTimeout(timer);
      timer = null;
    },
  };
}
