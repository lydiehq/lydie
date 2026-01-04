import * as Y from "yjs";
import {
  prosemirrorJSONToYDoc,
  yXmlFragmentToProseMirrorRootNode,
} from "@tiptap/y-tiptap";
import { getSchema } from "@tiptap/core";
import { getDocumentEditorExtensions } from "@lydie/editor/document-editor";

// Cache the schema to avoid recreating it every time
let cachedSchema: ReturnType<typeof getSchema> | null = null;

function getEditorSchema() {
  if (cachedSchema) {
    return cachedSchema;
  }

  // Get all content extensions without collaboration (not needed for conversion)
  const extensions = getDocumentEditorExtensions({
    collaboration: undefined,
  });

  // Extract the schema from the extensions
  cachedSchema = getSchema(extensions);
  return cachedSchema;
}

export function yDocToJson(ydoc: Y.Doc) {
  return yXmlFragmentToProseMirrorRootNode(
    ydoc.getXmlFragment("default"),
    getEditorSchema()
  );
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

export function convertJsonToYjs(jsonContent: any): string | null {
  if (!jsonContent) {
    return null;
  }

  try {
    const schema = getEditorSchema();

    // Convert TipTap JSON to Yjs document using "default" fragment name
    // This matches what the Collaboration extension expects
    const ydoc = prosemirrorJSONToYDoc(schema, jsonContent, "default");

    // Get the Yjs state as Uint8Array
    const yjsState = Y.encodeStateAsUpdate(ydoc);

    // Convert to base64 string for storage
    const base64State = Buffer.from(yjsState).toString("base64");

    return base64State;
  } catch (error) {
    console.error("Error converting JSON to Yjs:", error);
    return null;
  }
}
