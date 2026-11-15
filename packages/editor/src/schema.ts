// Headless entry point: no React, no DOM. Safe to import from Node, workers and @lydie/markdown.
import { getSchema } from "@tiptap/core";
import type { Schema } from "@tiptap/pm/model";

import { createLydieExtensions } from "./extensions";

export { LYDIE_MARK_NAMES, LYDIE_NODE_NAMES } from "./extensions";
export type { LydieMarkName, LydieNodeName } from "./extensions";

let cached: Schema | undefined;

// The ProseMirror schema of a Lydie document, built from the same extensions the editor uses.
export function getLydieSchema(): Schema {
  cached ??= getSchema(createLydieExtensions());
  return cached;
}
