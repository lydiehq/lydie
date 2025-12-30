import * as Y from "yjs";
import { yDocToProsemirrorJSON } from "@tiptap/y-tiptap";

// todo: use non-deprecated util - would require us to provide the entire tiptap
// extensions array which currently exists in the web package.
export function yDocToJson(ydoc: Y.Doc) {
  return yDocToProsemirrorJSON(ydoc, "default");
}

export function convertYjsToJson(yjsStateBase64: string | null | undefined) {
  if (!yjsStateBase64) {
    return null;
  }

  try {
    // Convert base64 string to Uint8Array
    const buffer = Buffer.from(yjsStateBase64, "base64");
    const yjsState = new Uint8Array(buffer);

    // Create a new Y.Doc and apply the state
    const ydoc = new Y.Doc();
    Y.applyUpdate(ydoc, yjsState);

    return yDocToJson(ydoc);
  } catch (error) {
    console.error("Error converting Yjs to JSON:", error);
    return null;
  }
}
