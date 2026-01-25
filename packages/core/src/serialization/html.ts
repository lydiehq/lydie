import { type ContentNode, renderWithBuilder } from "../content";
import { deserializeFromHTML } from "./html-deserializer";
import { HTMLSerializer as HTMLBuilder, HTMLSerializer } from "./html-serializer";

export { HTMLSerializer, HTMLBuilder };
export { deserializeFromHTML };

export function serializeToHTML(content: ContentNode, options?: { linkPrefix?: string }): string {
  const serializer = new HTMLSerializer(options);
  return renderWithBuilder(content, serializer);
}
