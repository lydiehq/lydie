import { renderWithBuilder, type ContentNode } from "../content";
import {
  PlainTextSerializer,
  PlainTextSerializer as PlainTextBuilder,
} from "./plaintext-serializer";
import {
  deserializeFromText,
  type TextDeserializeOptions,
} from "./text-deserializer";

export { PlainTextSerializer, PlainTextBuilder };

export {
  deserializeFromText,
  deserializeFromText as parseTextToTipTap,
};
export type {
  TextDeserializeOptions,
  TextDeserializeOptions as TextParseOptions,
};

export function serializeToPlainText(content: ContentNode): string {
  const serializer = new PlainTextSerializer();
  return renderWithBuilder(content, serializer);
}


