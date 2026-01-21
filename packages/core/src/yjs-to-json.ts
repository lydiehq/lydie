import * as Y from "yjs"
import { prosemirrorJSONToYDoc, yXmlFragmentToProseMirrorRootNode } from "@tiptap/y-tiptap"
import { getSchema } from "@tiptap/core"
import { getDocumentEditorExtensions } from "@lydie/editor/document-editor"
import { base64ToUint8Array, uint8ArrayToBase64 } from "./lib/base64"

// Cache the schema to avoid recreating it every time
let cachedSchema: ReturnType<typeof getSchema> | null = null

function getEditorSchema() {
  if (cachedSchema) {
    return cachedSchema
  }

  // Get all content extensions without collaboration (not needed for conversion)
  const extensions = getDocumentEditorExtensions({
    collaboration: undefined,
  })

  // Extract the schema from the extensions
  cachedSchema = getSchema(extensions)
  return cachedSchema
}

export function yDocToJson(ydoc: Y.Doc) {
  const pmNode = yXmlFragmentToProseMirrorRootNode(ydoc.getXmlFragment("default"), getEditorSchema())
  // Convert ProseMirror Node to plain JSON object
  // ProseMirror nodes have special content structures that aren't plain arrays
  return pmNode.toJSON()
}

export function convertYjsToJson(yjsStateBase64: string | null | undefined) {
  if (!yjsStateBase64) {
    // Return empty document structure for new/empty documents
    return { type: "doc", content: [] }
  }

  try {
    const ydoc = new Y.Doc()
    Y.applyUpdate(ydoc, base64ToUint8Array(yjsStateBase64))
    return yDocToJson(ydoc)
  } catch (error) {
    console.error("Error converting Yjs to JSON:", error)
    // Return empty document on error as fallback
    return { type: "doc", content: [] }
  }
}

export function convertJsonToYjs(jsonContent: any): string | null {
  if (!jsonContent) {
    return null
  }

  try {
    const schema = getEditorSchema()
    const ydoc = prosemirrorJSONToYDoc(schema, jsonContent, "default")
    const base64State = uint8ArrayToBase64(Y.encodeStateAsUpdate(ydoc))

    return base64State
  } catch (error) {
    console.error("Error converting JSON to Yjs:", error)
    return null
  }
}
