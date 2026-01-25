import { getDocumentEditorExtensions } from "@lydie/editor/document-editor";
import { getSchema } from "@tiptap/core";
import { prosemirrorJSONToYDoc, yXmlFragmentToProseMirrorRootNode } from "@tiptap/y-tiptap";
import * as Y from "yjs";

import { base64ToUint8Array, uint8ArrayToBase64 } from "./lib/base64";

let cachedSchema: ReturnType<typeof getSchema> | null = null;

function getEditorSchema() {
  if (cachedSchema) {
    return cachedSchema;
  }

  const extensions = getDocumentEditorExtensions({
    collaboration: undefined,
  });

  cachedSchema = getSchema(extensions);
  return cachedSchema;
}

export function yDocToJson(ydoc: Y.Doc) {
  const pmNode = yXmlFragmentToProseMirrorRootNode(
    ydoc.getXmlFragment("default"),
    getEditorSchema(),
  );
  return pmNode.toJSON();
}

export function convertYjsToJson(yjsStateBase64: string | null | undefined) {
  if (!yjsStateBase64) {
    return { type: "doc", content: [] };
  }

  try {
    const ydoc = new Y.Doc();
    Y.applyUpdate(ydoc, base64ToUint8Array(yjsStateBase64));
    return yDocToJson(ydoc);
  } catch (error) {
    console.error("Error converting Yjs to JSON:", error);
    return { type: "doc", content: [] };
  }
}

export function convertJsonToYjs(jsonContent: any): string | null {
  if (!jsonContent) {
    return null;
  }

  try {
    const schema = getEditorSchema();
    const ydoc = prosemirrorJSONToYDoc(schema, jsonContent, "default");
    const base64State = uint8ArrayToBase64(Y.encodeStateAsUpdate(ydoc));

    return base64State;
  } catch (error) {
    console.error("Error converting JSON to Yjs:", error);
    return null;
  }
}
