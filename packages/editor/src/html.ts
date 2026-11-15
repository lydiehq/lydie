// HTML into a Lydie document through the editor's own parse rules (what pasting does), for
// importers. Takes a DOM node, so it runs wherever a DOM does (the browser, happy-dom in tests); the
// module itself touches no DOM.
import type { JSONContent } from "@tiptap/core";
import { DOMParser } from "@tiptap/pm/model";

import { getLydieSchema } from "./schema";

export function parseHtml(node: Node): JSONContent {
  return DOMParser.fromSchema(getLydieSchema()).parse(node).toJSON() as JSONContent;
}
