// Where comments go beside the text, as in Google Docs: a column right of the text, each card
// level with its passage. Plain numbers, no DOM.

export const CARD_WIDTH = 256;
// From the text column's box (which has its own 1rem padding) to a card.
const CARD_GAP = 12;
const EDGE = 16;
const MARKER = 24;
const MARKER_GAP = 4;
// Below this the text would be too narrow beside cards: markers instead, which open a card.
const MIN_TEXT = 440;

export type MarginMode = "cards" | "markers";

export type MarginGeometry = {
  mode: MarginMode;
  // Room taken on the right of the page, so the text moves left only as far as it must.
  reserve: number;
  // The margin's left edge, from the page's left edge.
  left: number;
};

const roomFor = (mode: MarginMode) =>
  mode === "cards" ? CARD_GAP + CARD_WIDTH + EDGE : MARKER_GAP + MARKER + EDGE / 2;

// `width`: the page (the scroll container); `column`: the text column's widest, or null when the
// page is full width.
export function marginGeometry(width: number, column: number | null): MarginGeometry {
  const place = (mode: MarginMode): MarginGeometry & { text: number } => {
    const room = roomFor(mode);
    // The column stays centred in what is left; it moves only when the gutter is too narrow.
    const reserve =
      column === null ? room : Math.min(room, Math.max(0, 2 * room - (width - column)));
    const text = column === null ? width - reserve : Math.min(column, width - reserve);
    const right = (width - reserve + text) / 2;
    return { mode, reserve, left: right + (mode === "cards" ? CARD_GAP : MARKER_GAP), text };
  };
  const cards = place("cards");
  const { mode, reserve, left } = cards.text >= MIN_TEXT ? cards : place("markers");
  return { mode, reserve, left };
}

export type Wanted = { id: string; top: number; height: number };

// Tops for boxes that each want to sit at `top`, in that order, `gap` apart and never above
// `floor`. The active one sits at its own top: the ones before it move up to make room, the
// ones after it down (Google Docs' margin).
export function stack(
  boxes: readonly Wanted[],
  activeId: string | null,
  gap: number,
  floor = 0,
): Map<string, number> {
  const tops = boxes.map((b) => b.top);
  const pivot = Math.max(
    0,
    boxes.findIndex((b) => b.id === activeId),
  );
  // The ones after `from` go down as far as they must; `from` stays.
  const down = (from: number) => {
    for (let i = from + 1; i < boxes.length; i++) {
      tops[i] = Math.max(boxes[i]!.top, tops[i - 1]! + boxes[i - 1]!.height + gap);
    }
  };
  down(pivot);
  for (let i = pivot - 1; i >= 0; i--) {
    tops[i] = Math.min(boxes[i]!.top, tops[i + 1]! - gap - boxes[i]!.height);
  }
  // Pushed past the floor: everything goes down from there instead.
  if (tops[0] !== undefined && tops[0] < floor) {
    tops[0] = floor;
    down(0);
  }
  return new Map(boxes.map((b, i) => [b.id, tops[i]!]));
}
