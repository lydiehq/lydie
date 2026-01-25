import { type ContentNode, renderWithBuilder } from "../content";
import { type TextDeserializeOptions, deserializeFromText } from "./plaintext-deserializer";
import { PlainTextSerializer } from "./plaintext-serializer";

export { PlainTextSerializer };
export { deserializeFromText };

export type { TextDeserializeOptions, TextDeserializeOptions as TextParseOptions };

export function serializeToPlainText(content: ContentNode): string {
  const serializer = new PlainTextSerializer();
  return renderWithBuilder(content, serializer);
}
