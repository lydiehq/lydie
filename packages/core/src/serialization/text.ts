import { renderWithBuilder, type ContentNode } from "../content";
import { PlainTextSerializer } from "./plaintext-serializer";
import {
  deserializeFromText,
  type TextDeserializeOptions,
} from "./plaintext-deserializer";

export { PlainTextSerializer };
export { deserializeFromText };

export type {
  TextDeserializeOptions,
  TextDeserializeOptions as TextParseOptions,
};

export function serializeToPlainText(content: ContentNode): string {
  const serializer = new PlainTextSerializer();
  return renderWithBuilder(content, serializer);
}
