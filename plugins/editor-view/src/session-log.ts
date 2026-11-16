// What the editor did since the updates it sent to the file session (LYD-269): main computes disk
// steps against the document of update `basedOn` with its own earlier steps applied, which may be
// older than the last update sent. The log maps such steps to the editor's document.
import { Mapping } from "@lydie/plugin-api/editor";
import type { Step } from "@lydie/plugin-api/editor";

type Entry =
  | { kind: "update"; seq: number }
  | { kind: "local"; mapping: Mapping }
  // Steps from main as received, and the mapping of what they did once rebased and applied.
  | { kind: "remote"; steps: readonly Step[]; applied: Mapping };

export class SessionLog {
  private entries: Entry[] = [];

  local(mapping: Mapping) {
    const last = this.entries.at(-1);
    if (last?.kind === "local") last.mapping.appendMapping(mapping);
    else this.entries.push({ kind: "local", mapping: mapping.slice() });
  }

  // An update (or save) with this seq left for main; returns a setter for a seq known later.
  update(seq: number): (seq: number) => void {
    const entry: Entry = { kind: "update", seq };
    this.entries.push(entry);
    return (known) => {
      entry.seq = known;
    };
  }

  remote(steps: readonly Step[], applied: Mapping) {
    this.entries.push({ kind: "remote", steps, applied });
  }

  // Mapping from main's base for steps based on update `basedOn` (null: as opened) to the editor's
  // document: undo main's steps received since that update, then redo everything the editor did.
  since(basedOn: number | null | undefined): Mapping {
    const from = this.start(basedOn);
    const tail = this.entries.slice(from);
    const mapping = new Mapping();
    const remotes = tail.filter(
      (e): e is Extract<Entry, { kind: "remote" }> => e.kind === "remote",
    );
    for (let r = remotes.length - 1; r >= 0; r--) {
      const steps = remotes[r]!.steps;
      for (let i = steps.length - 1; i >= 0; i--) mapping.appendMap(steps[i]!.getMap().invert());
    }
    for (const entry of tail) {
      if (entry.kind === "local") mapping.appendMapping(entry.mapping);
      else if (entry.kind === "remote") mapping.appendMapping(entry.applied);
    }
    return mapping;
  }

  // Steps based on an update never arrive after steps based on a later one: forget what is older.
  prune(basedOn: number | null | undefined) {
    const from = this.start(basedOn);
    if (from > 0) this.entries = this.entries.slice(from);
  }

  // A save main took as current (not `stale`): it had no steps the editor lacked, so whatever it
  // sends later is based on this save or a later update. Without disk changes nothing else prunes,
  // and the log would keep every edit of the session.
  saved(seq: number) {
    this.prune(seq);
  }

  hasLocal(): boolean {
    return this.entries.some((e) => e.kind === "local");
  }

  private start(basedOn: number | null | undefined): number {
    if (basedOn === null || basedOn === undefined) return 0;
    const index = this.entries.findIndex((e) => e.kind === "update" && e.seq === basedOn);
    return index === -1 ? 0 : index + 1;
  }
}
