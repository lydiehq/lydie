import { LydieError } from "@lydie/contract";
import { generateKeyBetween } from "fractional-indexing";

import type { DbRead, SlotAnchor, SlotKeys } from "./ports.ts";

export type Placement = { afterId?: string; beforeId?: string; sortKey?: string };

// Picks a fractional key for a document placed among the live children of `parentId`.
// `excludeId` is the document being moved, which must not count as its own sibling.
export async function placeKey(
  tx: DbRead,
  workspaceId: string,
  parentId: string | null,
  placement: Placement,
  excludeId?: string,
): Promise<string> {
  if (placement.sortKey) return placement.sortKey;
  const slot = (anchor: SlotAnchor, field: string, id: string) =>
    keysAround(tx, workspaceId, parentId, anchor, excludeId).then((keys) => {
      if (!keys) {
        throw new LydieError(
          "invalid_input",
          `${field} ${id} is not a sibling under the target parent`,
        );
      }
      return keys;
    });

  let lower: string | null;
  let upper: string | null;
  if (placement.afterId && placement.beforeId) {
    lower = (await slot({ afterId: placement.afterId }, "afterId", placement.afterId)).lower;
    upper = (await slot({ beforeId: placement.beforeId }, "beforeId", placement.beforeId)).upper;
    if (lower === null || upper === null || lower >= upper) {
      throw new LydieError("invalid_input", "afterId must come before beforeId");
    }
  } else if (placement.afterId) {
    ({ lower, upper } = await slot({ afterId: placement.afterId }, "afterId", placement.afterId));
  } else if (placement.beforeId) {
    ({ lower, upper } = await slot(
      { beforeId: placement.beforeId },
      "beforeId",
      placement.beforeId,
    ));
  } else {
    ({ lower, upper } = (await keysAround(tx, workspaceId, parentId, { end: true }, excludeId))!);
  }
  return generateKeyBetween(lower, upper);
}

// For `{ afterId }`: lower is the anchor's key, upper the next distinct key. For `{ beforeId }`:
// upper is the anchor's key, lower the previous distinct key. For `{ end }`: lower is the last key.
// Concurrent inserts can leave equal keys, hence "distinct".
async function keysAround(
  tx: DbRead,
  workspaceId: string,
  parentId: string | null,
  anchor: SlotAnchor,
  excludeId: string | undefined,
): Promise<SlotKeys | null> {
  if (tx.docs.slotKeys) return tx.docs.slotKeys(workspaceId, parentId, anchor, excludeId);
  const siblings = (await tx.docs.children(workspaceId, parentId)).filter(
    (d) => d.id !== excludeId,
  );
  const keys = siblings.map((d) => d.sortKey);
  if ("end" in anchor) return { lower: keys.at(-1) ?? null, upper: null };
  const id = "afterId" in anchor ? anchor.afterId : anchor.beforeId;
  const index = siblings.findIndex((d) => d.id === id);
  if (index === -1) return null;
  const key = keys[index]!;
  if ("afterId" in anchor) return { lower: key, upper: keys.find((k) => k > key) ?? null };
  const lower = keys.filter((k) => k < key);
  return { lower: lower[lower.length - 1] ?? null, upper: key };
}
