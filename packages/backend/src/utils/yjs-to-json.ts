import * as Y from "yjs";
import { yDocToProsemirrorJSON } from "@tiptap/y-tiptap";

/**
 * Converts Yjs binary state (base64 string) to ProseMirror JSON format
 * Uses @tiptap/y-tiptap for proper conversion of Tiptap documents
 *
 * Note: We use the deprecated `yDocToProsemirrorJSON` function because:
 * 1. The non-deprecated `yXmlFragmentToProseMirrorRootNode` requires a ProseMirror Schema
 * 2. Creating a schema would require duplicating all Tiptap extensions (including custom ones) in the backend
 * 3. We only need JSON output, not a ProseMirror Node, so the deprecated function is sufficient
 *
 * @param yjsStateBase64 - Base64 encoded Yjs state string from database
 * @returns ProseMirror JSON object or null if conversion fails
 */
export function convertYjsToJson(
  yjsStateBase64: string | null | undefined
): any | null {
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

    // Convert Y.Doc to ProseMirror JSON using @tiptap/y-tiptap
    // Using deprecated function to avoid needing to duplicate all Tiptap extensions for schema creation
    return yDocToProsemirrorJSON(ydoc);
  } catch (error) {
    console.error("Error converting Yjs to JSON:", error);
    return null;
  }
}
