// One drawing per kind of collection view, made to sit small beside its name (`size="xs"`): the
// "New view" menu. Each is one or two plain objects in the shape of its view, with only the lines
// that tell it apart: no text, few parts.
import { Drawing, Enter, ink, reach, rect, Solid, tone, useLine } from "./kit";
import type { IllustrationProps, P3 } from "./kit";

// A band across the top of a w-wide face, rounded with it: a table's header, a calendar's month.
const topBand = (w: number, h: number, r: number) =>
  `M0 ${h} V${r} Q0 0 ${r} 0 H${w - r} Q${w} 0 ${w} ${r} V${h} Z`;

/** Table: a sheet lying flat, a header row and the lines between rows and columns. */
export function TableViewIllustration(props: IllustrationProps) {
  const line = useLine();
  const at: P3 = [0, 0, 2];
  return (
    <Drawing {...props} top={reach("floor", at, 48, 36, 2)}>
      <Enter delay={0}>
        <Solid plane="floor" at={at} depth={2} shape={rect(48, 36, 4)}>
          <path d={topBand(48, 9, 4)} fill={tone(2)} strokeWidth={line(1)} {...ink} />
          <path d="M0 18 h48 M0 27 h48 M18 9 v27" strokeWidth={line(1)} {...ink} />
        </Solid>
      </Enter>
    </Drawing>
  );
}

// Each column's length, in cards.
const BOARD_COLUMNS = [3, 2, 1];

/** Board: three columns side by side, holding fewer cards each. */
export function BoardViewIllustration(props: IllustrationProps) {
  const line = useLine();
  const columns = BOARD_COLUMNS.map((cards, index) => ({
    at: [index * 15, 0, 2] as P3,
    cards,
    length: 2.5 + cards * 8.5,
  }));
  return (
    <Drawing
      {...props}
      top={columns.flatMap(({ at, length }) => reach("floor", at, 12, length, 2))}
    >
      {columns.map(({ at, cards, length }, index) => (
        <Enter key={index} delay={index * 0.08} drop={12}>
          <Solid plane="floor" at={at} depth={2} shape={rect(12, length, 3)}>
            {Array.from({ length: cards }, (_, card) => (
              <rect
                key={card}
                x={2.5}
                y={2.5 + card * 8.5}
                width={7}
                height={6}
                rx={1.5}
                fill={tone(2)}
                strokeWidth={line(1)}
                {...ink}
              />
            ))}
          </Solid>
        </Enter>
      ))}
    </Drawing>
  );
}

/** List: three strips, one per page, stacked in turn. */
export function ListViewIllustration(props: IllustrationProps) {
  const line = useLine();
  const rows = [0, 10, 20];
  return (
    <Drawing {...props} top={reach("floor", [0, 0, 2], 44, 27, 2)}>
      {rows.map((v, index) => (
        <Enter key={v} delay={index * 0.07} drop={12}>
          <Solid plane="floor" at={[0, v, 2]} depth={2} shape={rect(44, 7, 2)}>
            <circle cx={4.5} cy={3.5} r={1.5} fill={tone(3)} strokeWidth={line(1)} {...ink} />
          </Solid>
        </Enter>
      ))}
    </Drawing>
  );
}

/** Calendar: a month standing up, its two rings on top and one day marked. */
export function CalendarViewIllustration(props: IllustrationProps) {
  const line = useLine();
  const at: P3 = [0, 36, 40];
  return (
    <Drawing {...props} top={[...reach("x", at, 36, 34, 3), [0, 36, 44]]}>
      <Enter delay={0}>
        <Solid plane="x" at={at} depth={3} shape={rect(36, 34, 4)}>
          <path d={topBand(36, 10, 4)} fill={tone(2)} strokeWidth={line(1)} {...ink} />
          <path d="M0 22 h36 M12 10 v24 M24 10 v24" strokeWidth={line(1)} {...ink} />
          <rect x={12} y={22} width={12} height={12} fill={tone(3)} stroke="none" />
          {/* The rings, the one stroke on the face in full ink. */}
          <path d="M10 -3 v6 M26 -3 v6" stroke="currentColor" strokeWidth={line(1.6)} {...ink} />
        </Solid>
      </Enter>
    </Drawing>
  );
}
