// One drawing per kind of collection view, made to sit small beside its name (`size="xs"`): the
// "New view" menu. Each lies flat on the floor in the same footprint, so the five read as a set.
import {
  Dashed,
  Drawing,
  Enter,
  ink,
  Marks,
  reach,
  rect,
  Rise,
  Solid,
  TextLines,
  tone,
} from "./kit";
import type { IllustrationProps, P3 } from "./kit";

const [W, H, DEPTH] = [56, 44, 3];
const BASE: P3 = [0, 0, DEPTH];
const FOOTPRINT = reach("floor", BASE, W, H, DEPTH);

// A band across the top of a w-wide face, rounded with it: a table's header, a card's cover.
const topBand = (w: number, h: number, r: number) =>
  `M0 ${h} V${r} Q0 0 ${r} 0 H${w - r} Q${w} 0 ${w} ${r} V${h} Z`;

/** Table: a sheet of rows and columns, one cell lifted as if being edited. */
export function TableViewIllustration(props: IllustrationProps) {
  const cell: P3 = [19, 22, DEPTH + 2.5];
  return (
    <Drawing {...props} top={[...FOOTPRINT, ...reach("floor", cell, 19, 11, 2.5)]}>
      <Rise at={BASE} w={W} h={H} depth={DEPTH} shape={rect(W, H, 4)} delay={0}>
        <Solid plane="floor" at={BASE} depth={DEPTH} shape={rect(W, H, 4)}>
          <path d={topBand(W, 11, 4)} fill={tone(2)} strokeWidth={1} {...ink} />
          <Marks d="M0 22 h56 M0 33 h56 M19 0 v44 M38 0 v44" />
          <TextLines u={4} v={16.5} widths={[10, 8]} gap={11} />
          <TextLines u={23} v={16.5} widths={[7]} />
          <TextLines u={42} v={16.5} widths={[9, 6, 8]} gap={11} />
        </Solid>
      </Rise>
      <Enter delay={0.18} drop={14}>
        <Solid plane="floor" at={cell} depth={2.5} shape={rect(19, 11, 2)}>
          <TextLines u={4} v={5.5} widths={[9]} />
        </Solid>
      </Enter>
    </Drawing>
  );
}

// Columns of cards, sorted: u is the column's left edge, v each card's top.
const BOARD_COLUMNS = [
  { u: 2.5, cards: [5, 16, 27] },
  { u: 21, cards: [5, 16] },
  { u: 39.5, cards: [5] },
];

/** Board: cards sorted into columns, dropping into place one column after another. */
export function BoardViewIllustration(props: IllustrationProps) {
  const cards = BOARD_COLUMNS.flatMap(({ u, cards }, column) =>
    cards.map((v, row) => ({
      at: [u, v, DEPTH + 2] as P3,
      delay: 0.12 + column * 0.1 + row * 0.05,
    })),
  );
  return (
    <Drawing {...props} top={[...FOOTPRINT, [W, H, DEPTH + 2]]}>
      <Rise at={BASE} w={W} h={H} depth={DEPTH} shape={rect(W, H, 4)} delay={0}>
        <Solid plane="floor" at={BASE} depth={DEPTH} shape={rect(W, H, 4)}>
          <Marks d="M18.7 4 v36 M37.3 4 v36" />
        </Solid>
      </Rise>
      {cards.map(({ at, delay }) => (
        <Enter key={at.join()} delay={delay} drop={14}>
          <Solid plane="floor" at={at} depth={2} shape={rect(14, 9, 2)}>
            <TextLines u={3} v={3.5} widths={[7]} />
          </Solid>
        </Enter>
      ))}
    </Drawing>
  );
}

/** List: pages one per line, each a strip with its icon and title, stacked in turn. */
export function ListViewIllustration(props: IllustrationProps) {
  const rows = [0, 11.5, 23, 34.5];
  return (
    <Drawing {...props} top={reach("floor", [0, 0, 2.5], W, H, 2.5)}>
      {rows.map((v, index) => (
        <Enter key={v} delay={index * 0.07} drop={12}>
          <Solid plane="floor" at={[0, v, 2.5]} depth={2.5} shape={rect(W, 9.5, 2.5)}>
            <rect
              x={4}
              y={2.5}
              width={4.5}
              height={4.5}
              rx={1}
              fill={tone(2)}
              strokeWidth={1}
              {...ink}
            />
            <TextLines u={12} v={4.75} widths={[[22, 30, 18, 26][index] ?? 20]} />
          </Solid>
        </Enter>
      ))}
    </Drawing>
  );
}

/** Calendar: a month of days, two events set down on them. */
export function CalendarViewIllustration(props: IllustrationProps) {
  const long: P3 = [15, 23.5, DEPTH + 2];
  const short: P3 = [43, 35, DEPTH + 2];
  return (
    <Drawing {...props} top={[...FOOTPRINT, ...reach("floor", long, 26, 6.5, 2)]}>
      <Rise at={BASE} w={W} h={H} depth={DEPTH} shape={rect(W, H, 4)} delay={0}>
        <Solid plane="floor" at={BASE} depth={DEPTH} shape={rect(W, H, 4)}>
          <path d={topBand(W, 10, 4)} fill={tone(2)} strokeWidth={1} {...ink} />
          <Marks d="M0 21.3 h56 M0 32.6 h56 M14 10 v34 M28 10 v34 M42 10 v34" />
        </Solid>
      </Rise>
      <Enter delay={0.16} drop={14}>
        <Solid plane="floor" at={long} depth={2} shape={rect(26, 6.5, 2)}>
          <TextLines u={3} v={3.25} widths={[10]} />
        </Solid>
      </Enter>
      <Enter delay={0.26} drop={14}>
        <Solid plane="floor" at={short} depth={2} shape={rect(11, 6.5, 2)} />
      </Enter>
    </Drawing>
  );
}

// The hills on a card's cover.
const COVER = "M3 11 L9 6 L13 9 L17 5.5 L23 11";

/** Gallery: cards with covers in a grid, the last one still to come. */
export function GalleryViewIllustration(props: IllustrationProps) {
  const cards: P3[] = [
    [0, 0, 2.5],
    [30, 0, 2.5],
    [0, 24, 2.5],
  ];
  return (
    <Drawing {...props} top={reach("floor", [0, 0, 2.5], W, H, 2.5)}>
      <Enter delay={0.3} drop={8}>
        <Dashed plane="floor" at={[30, 24, 0]} shape={rect(26, 20, 3)} />
      </Enter>
      {cards.map((at, index) => (
        <Enter key={at.join()} delay={index * 0.08} drop={14}>
          <Solid plane="floor" at={at} depth={2.5} shape={rect(26, 20, 3)}>
            <path d={topBand(26, 12, 3)} fill={tone(2)} strokeWidth={1} {...ink} />
            <path d={COVER} strokeWidth={1} {...ink} />
            <TextLines u={4} v={16} widths={[12]} />
          </Solid>
        </Enter>
      ))}
    </Drawing>
  );
}
