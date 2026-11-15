// What a diverged publication item shows: why, and how the two versions differ. The server stores
// `reason`, `base`/`ours`/`theirs` (in the destination's format), the merge's `marked` text when it
// conflicts, and a pull request for connectors that open one.

export type DivergenceView = {
  reason: string;
  // Lines only in the destination's copy, and only in this document's version.
  theirs: string[];
  ours: string[];
  // The merge with conflict markers, when the two edits overlap.
  marked: string | null;
  pullRequest: string | null;
};

const REASONS: Record<string, string> = {
  both_changed: "The published copy was changed there, and this document changed here.",
  remote_changed: "The published copy was changed there.",
  remote_deleted: "The published copy was deleted there.",
};

const str = (value: unknown) => (typeof value === "string" ? value : null);

// Lines of one text that the other lacks (a multiset difference: enough to show what changed).
function only(a: string, b: string): string[] {
  const counts = new Map<string, number>();
  for (const line of b.split("\n")) counts.set(line, (counts.get(line) ?? 0) + 1);
  const out: string[] = [];
  for (const line of a.split("\n")) {
    const n = counts.get(line) ?? 0;
    if (n > 0) counts.set(line, n - 1);
    else if (line.trim()) out.push(line);
  }
  return out;
}

export function divergenceView(divergence: Record<string, unknown> | null): DivergenceView {
  const d = divergence ?? {};
  const reason = str(d.reason) ?? "";
  const ours = str(d.ours) ?? "";
  const theirs = str(d.theirs);
  return {
    reason: REASONS[reason] ?? "The published copy and this document both changed.",
    theirs: theirs === null ? [] : only(theirs, ours),
    ours: theirs === null ? [] : only(ours, theirs),
    marked: str(d.marked),
    pullRequest: str(d.pullRequest),
  };
}
