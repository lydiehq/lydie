import { operations } from "@lydie/contract";
import type { Operations } from "@lydie/contract";
import { coreHandlers } from "@lydie/runtime";

// The contract's operations that this runtime can run. The contract can be ahead of the runtime
// while a feature is being built; those operations stay out until their handlers land.
export function handledOperations(handlers: Record<string, unknown> = coreHandlers): Operations {
  return Object.fromEntries(
    Object.entries(operations).filter(([id]) => id in handlers),
  ) as unknown as Operations;
}
