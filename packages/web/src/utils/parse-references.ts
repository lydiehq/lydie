export type ReferenceType = "document" | "landmark";

export interface Reference {
  type: ReferenceType;
  id: string;
  startIndex: number;
  endIndex: number;
  raw: string;
}

export interface ParsedTextSegment {
  type: "text" | "reference";
  content: string;
  reference?: Reference;
}

const REFERENCE_PATTERN = /\[reference_(\w+):id:([^\]]+)\]/g;

export function parseReferences(text: string): ParsedTextSegment[] {
  const segments: ParsedTextSegment[] = [];
  let lastIndex = 0;

  const matches = text.matchAll(REFERENCE_PATTERN);

  for (const match of matches) {
    const [fullMatch, type, id] = match;
    const startIndex = match.index!;

    if (startIndex > lastIndex) {
      segments.push({
        type: "text",
        content: text.slice(lastIndex, startIndex),
      });
    }

    segments.push({
      type: "reference",
      content: fullMatch,
      reference: {
        type: type as ReferenceType,
        id,
        startIndex,
        endIndex: startIndex + fullMatch.length,
        raw: fullMatch,
      },
    });

    lastIndex = startIndex + fullMatch.length;
  }

  if (lastIndex < text.length) {
    segments.push({
      type: "text",
      content: text.slice(lastIndex),
    });
  }

  if (segments.length === 0) {
    segments.push({
      type: "text",
      content: text,
    });
  }

  return segments;
}

export function hasReferences(text: string): boolean {
  return REFERENCE_PATTERN.test(text);
}

export function getReferenceDocumentIds(text: string): string[] {
  const segments = parseReferences(text);
  const ids = new Set<string>();

  for (const segment of segments) {
    if (segment.type === "reference" && segment.reference?.type === "document") {
      ids.add(segment.reference.id);
    }
  }

  return Array.from(ids);
}
