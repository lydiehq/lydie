import { expect, test } from "bun:test";

import { operations } from "@lydie/contract";
import type { AnyOperation } from "@lydie/contract";
import { coreHandlers } from "@lydie/runtime";

// The host offers every mutation with `ui.commandPalette` as a command without asking the runtime
// (whose handlers it does not load): give an operation palette metadata once it has a handler.
test("every operation the palette offers has a runtime handler", () => {
  const offered = (Object.values(operations) as AnyOperation[]).filter(
    (op) => op.ui?.commandPalette && op.kind === "mutation",
  );
  expect(offered.length).toBeGreaterThan(0);
  expect(offered.map((op) => op.id).filter((id) => !(id in coreHandlers))).toEqual([]);
});
