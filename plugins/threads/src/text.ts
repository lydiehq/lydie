// The editor's document as one plain text, with the document position of every character, so a
// thread's anchor (a quote and the text around it) can be found in it and a selection turned into
// one. Blocks are joined by a line break, as in the text the anchors were taken from.
import { describeQuote, findQuote } from "@lydie/plugin-api";
import type { ThreadAnchor } from "@lydie/plugin-api";
import { wikiLinkLabel } from "@lydie/plugin-api/editor";
import type { ProseMirrorNode, WikiLinkAttrs } from "@lydie/plugin-api/editor";

export type DocText = {
  text: string;
  // Document positions of each character's start and end.
  starts: number[];
  ends: number[];
};

export type Range = { from: number; to: number };

function atomText(node: ProseMirrorNode): string {
  if (node.type.name === "wikiLink") return wikiLinkLabel(node.attrs as WikiLinkAttrs);
  return node.type.spec.leafText?.(node) ?? "";
}

export function docText(doc: ProseMirrorNode): DocText {
  let text = "";
  const starts: number[] = [];
  const ends: number[] = [];
  doc.descendants((block, blockPos) => {
    if (!block.isTextblock) return true;
    if (block.content.size === 0) return false;
    if (text) {
      text += "\n";
      starts.push(blockPos);
      ends.push(blockPos);
    }
    block.descendants((child, offset) => {
      const pos = blockPos + 1 + offset;
      if (child.isText) {
        const value = child.text ?? "";
        text += value;
        for (let i = 0; i < value.length; i++) {
          starts.push(pos + i);
          ends.push(pos + i + 1);
        }
      } else if (child.isLeaf) {
        const value = atomText(child);
        text += value;
        for (let i = 0; i < value.length; i++) {
          starts.push(pos);
          ends.push(pos + child.nodeSize);
        }
      }
      return true;
    });
    return false;
  });
  return { text, starts, ends };
}

// Where an anchor's passage is in the document, or null when it is not there any more.
export function rangeOf(text: DocText, anchor: ThreadAnchor): Range | null {
  const found = findQuote(text.text, anchor);
  if (!found) return null;
  const from = text.starts[found.start];
  const to = text.ends[found.end - 1];
  return from === undefined || to === undefined || from >= to ? null : { from, to };
}

// The anchor for a range of the document (a selection), or null when it holds no text.
export function anchorAt(text: DocText, range: Range): ThreadAnchor | null {
  let start = text.starts.findIndex((pos, i) => pos >= range.from && text.ends[i]! <= range.to);
  if (start === -1) return null;
  let end = start;
  while (end < text.text.length && text.ends[end]! <= range.to) end++;
  while (start < end && /\s/.test(text.text[start]!)) start++;
  while (end > start && /\s/.test(text.text[end - 1]!)) end--;
  return start < end ? describeQuote(text.text, { start, end }) : null;
}
