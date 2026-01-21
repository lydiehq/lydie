import { renderWithBuilder, type ContentNode } from "../content"
import { HTMLSerializer, HTMLSerializer as HTMLBuilder } from "./html-serializer"
import { deserializeFromHTML, type HTMLDeserializeOptions } from "./html-deserializer"

export { HTMLSerializer, HTMLBuilder }
export { deserializeFromHTML }
export type { HTMLDeserializeOptions }

export function serializeToHTML(content: ContentNode, options?: { linkPrefix?: string }): string {
  const serializer = new HTMLSerializer(options)
  return renderWithBuilder(content, serializer)
}
