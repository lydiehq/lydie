// A stored Markdown body as the editor's Yjs document (field "default"), for the hand-off: the
// server receives bodies as collaborative documents, exactly as the editor would have written them.
import { getLydieSchema } from "@lydie/editor";
import { parse } from "@lydie/markdown";
import { prosemirrorJSONToYDoc } from "@tiptap/y-tiptap";
import * as Y from "yjs";

export function markdownToYjs(markdown: string): Uint8Array {
  const schema = getLydieSchema();
  let ydoc: Y.Doc;
  try {
    ydoc = prosemirrorJSONToYDoc(schema, parse(markdown).doc.toJSON(), "default");
  } catch {
    // A construct the editor's schema does not take yet (LYD-156): keep the text, one paragraph per
    // line, rather than lose the body.
    const lines = markdown.split("\n");
    ydoc = prosemirrorJSONToYDoc(
      schema,
      {
        type: "doc",
        content: lines.map((line) =>
          line
            ? { type: "paragraph", content: [{ type: "text", text: line }] }
            : { type: "paragraph" },
        ),
      },
      "default",
    );
  }
  const update = Y.encodeStateAsUpdate(ydoc);
  ydoc.destroy();
  return update;
}
