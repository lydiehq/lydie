// Stable document ids without writing into users' files.
//
// The id of a document at key K is, in order of precedence:
//   1. `.lydie/ids.json[K]`, the sidecar map;
//   2. the id in the file's `id:` frontmatter (written only on documents Lydie creates, plan §3);
//   3. `deriveId(workspaceId, K)`, a hash of the key.
// The bridge keeps the invariant that every document whose id differs from what 2–3 give is listed
// in the sidecar (a pristine note Lydie renamed, a copy that duplicated another note's `id:`).
// Rebuilding the index from the folder therefore gives every document the same id again.
import { createHash } from "node:crypto";

import { hashSpelling, uuidFromBits } from "@lydie/contract";

// 128 bits from a hash of the key: three of the first byte, then the bytes after it (the layout
// ids had as ULIDs, so a note keeps the id it was given then).
export function deriveId(workspaceId: string, key: string, attempt = 0): string {
  const digest = createHash("sha256")
    .update(`${hashSpelling(workspaceId)}\u0000${key.normalize("NFC")}\u0000${attempt}`)
    .digest();
  let bits = BigInt(digest[0]! & 7);
  for (let i = 1; i <= 16; i++) bits = (bits << 8n) | BigInt(digest[i]!);
  return uuidFromBits(bits >> 3n);
}

// The id rule 2–3 gives a key, ignoring the sidecar.
export function defaultId(workspaceId: string, key: string, frontmatterId: string | null): string {
  return frontmatterId ?? deriveId(workspaceId, key);
}

// Picks the id for a document seen at `key`, avoiding ids in `taken`.
export function assignId(
  workspaceId: string,
  key: string,
  frontmatterId: string | null,
  sidecar: Record<string, string>,
  taken: (id: string) => boolean,
): string {
  const listed = sidecar[key];
  if (listed && !taken(listed)) return listed;
  if (frontmatterId && !taken(frontmatterId)) return frontmatterId;
  for (let attempt = 0; ; attempt++) {
    const id = deriveId(workspaceId, key, attempt);
    if (!taken(id)) return id;
  }
}
