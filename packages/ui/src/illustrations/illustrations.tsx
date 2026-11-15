// One drawing per empty state in the app, each standing on its own: pass one to
// `EmptyState`'s `illustration`.
import { useId } from "react";

import { MARK_PIECES } from "../identity/cut";
import {
  BAR,
  BoxEdge,
  Dashed,
  Drawing,
  Enter,
  fadedInk,
  FOLD,
  ink,
  INNER,
  Marks,
  n1,
  path,
  planeMatrix,
  proj,
  reach,
  rect,
  Rise,
  sheet,
  Solid,
  TextLines,
  tone,
} from "./kit";
import type { IllustrationProps, P3, Shape } from "./kit";

// A pencil lying along x in a 36 × 6 box, its tip to the right.
const PENCIL = path("M2 0 H27 L36 3 L27 6 H2 Q0 6 0 4 V2 Q0 0 2 0 Z");

/** Home, nothing written yet: a blank page with the caret waiting, a pencil set down before it. */
export function FirstDocumentIllustration(props: IllustrationProps) {
  const page: P3 = [16, 44, 48];
  const pencil: P3 = [24, 30, 3];
  return (
    <Drawing
      {...props}
      top={[
        ...reach("x", [0, 36, 40], 30, 40),
        ...reach("x", page, 36, 48, 3),
        ...reach("floor", pencil, 36, 6, 3),
      ]}
    >
      <Enter delay={0.22} from={[-12, -7]}>
        <Dashed plane="x" at={[0, 36, 40]} shape={path(sheet(30, 40))} />
      </Enter>
      <Enter delay={0}>
        <Solid plane="x" at={page} depth={3} shape={path(sheet(36, 48))}>
          <path d={FOLD(36)} fill={tone(2)} {...ink} />
          <path d="M7 8 v9" stroke="currentColor" strokeWidth={1.4} {...ink} />
        </Solid>
      </Enter>
      <Enter delay={0.12} drop={16}>
        <Solid plane="floor" at={pencil} depth={3} shape={PENCIL}>
          {/* The ferrule, where the wood starts, and the lead. */}
          <Marks d="M6 0 V6 M27 0 V6" />
          <path d="M33 2 L36 3 L33 4 Z" fill="currentColor" stroke="none" />
        </Solid>
      </Enter>
    </Drawing>
  );
}

/** Trash: a ribbed bin standing open and empty, its far inner walls in shadow. */
export function TrashIllustration(props: IllustrationProps) {
  const clip = useId();
  const [w, depth, r, rim, sink] = [36, 38, 8, 3, 24];
  const at: P3 = [0, 0, depth];
  const inner = w - rim * 2;
  // Ribs down the two sides that face the viewer, clear of the rim and the foot.
  const line = (a: P3, b: P3) => {
    const [[x1, y1], [x2, y2]] = [proj(a), proj(b)];
    return `M${n1(x1)} ${n1(y1)} L${n1(x2)} ${n1(y2)}`;
  };
  const ribs = [12, 18, 24]
    .flatMap((t) => [line([t, w, depth - 7], [t, w, 6]), line([w, t, depth - 7], [w, t, 6])])
    .join(" ");
  return (
    <Drawing {...props} top={reach("floor", at, w, w, depth)}>
      <Rise at={at} w={w} h={w} depth={depth} shape={rect(w, w, r)} delay={0}>
        <Solid
          plane="floor"
          at={at}
          depth={depth}
          shape={rect(w, w, r)}
          sideLines={
            <>
              <BoxEdge at={at} w={w} h={w} depth={depth} r={r} />
              <path d={ribs} stroke={INNER} strokeWidth={1} {...ink} />
            </>
          }
        >
          <clipPath id={clip}>
            <rect x={rim} y={rim} width={inner} height={inner} rx={r - rim} />
          </clipPath>
          <rect
            x={rim}
            y={rim}
            width={inner}
            height={inner}
            rx={r - rim}
            fill={tone(3)}
            stroke="none"
          />
          <g clipPath={`url(#${clip})`}>
            {/* The bottom, sunk out of sight but for its near corner. */}
            <rect
              x={rim + sink}
              y={rim + sink}
              width={inner}
              height={inner}
              rx={r - rim}
              fill={tone(1)}
              strokeWidth={1}
              {...ink}
            />
            {/* Where the two far walls meet, straight down. */}
            <path d={`M${rim + 1.5} ${rim + 1.5} l${sink} ${sink}`} strokeWidth={1} {...ink} />
          </g>
          <rect
            x={rim}
            y={rim}
            width={inner}
            height={inner}
            rx={r - rim}
            fill="none"
            strokeWidth={1}
            {...ink}
          />
        </Solid>
      </Rise>
    </Drawing>
  );
}

/** Versions, none kept yet: the page as it is, the versions to come sketched behind it. */
export function VersionsIllustration(props: IllustrationProps) {
  const front: P3 = [32, 46, 46];
  return (
    <Drawing {...props} top={[...reach("x", [0, 46, 46], 34, 46), ...reach("x", front, 34, 46, 3)]}>
      <Enter delay={0.24} from={[-14, -8]}>
        <Dashed plane="x" at={[0, 46, 46]} shape={path(sheet(34, 46))} strength={30} />
      </Enter>
      <Enter delay={0.14} from={[-10, -6]}>
        <Dashed plane="x" at={[16, 46, 46]} shape={path(sheet(34, 46))} />
      </Enter>
      <Enter delay={0}>
        <Solid plane="x" at={front} depth={3} shape={path(sheet(34, 46))}>
          <path d={FOLD(34)} fill={tone(2)} {...ink} />
          <TextLines u={7} v={11} widths={[14, 18, 10]} />
          <TextLines u={7} v={33} widths={[16, 9]} />
        </Solid>
      </Enter>
    </Drawing>
  );
}

/** Templates, none yet: a filled page behind, and in front a page of blanks to fill in. */
export function TemplatesIllustration(props: IllustrationProps) {
  const back: P3 = [0, 34, 40];
  const front: P3 = [18, 44, 48];
  return (
    <Drawing {...props} top={[...reach("x", back, 30, 40, 3), ...reach("x", front, 36, 48, 3)]}>
      <Enter delay={0}>
        <Solid plane="x" at={back} depth={3} shape={path(sheet(30, 40))} face={tone(2)}>
          <TextLines u={6} v={9} widths={[14, 10]} />
          <TextLines u={6} v={24} widths={[16, 12]} />
        </Solid>
      </Enter>
      <Enter delay={0.1}>
        <Solid plane="x" at={front} depth={3} shape={path(sheet(36, 48))}>
          <path d={FOLD(36)} fill={tone(2)} {...ink} />
          <g strokeDasharray="2.5 3" strokeWidth={1}>
            <rect x={7} y={8} width={16} height={6} rx={1.5} {...ink} />
            <rect x={7} y={19} width={22} height={13} rx={2} {...ink} />
          </g>
          <TextLines u={7} v={38} widths={[18, 10]} />
        </Solid>
      </Enter>
    </Drawing>
  );
}

// A magnifying glass in a 36-unit box: the ring (its hole wound the other way) and the handle.
const LENS = path(
  "M0 14 A14 14 0 1 1 28 14 A14 14 0 1 1 0 14 Z M4 14 A10 10 0 1 0 24 14 A10 10 0 1 0 4 14 Z M21.1 25.3 L25.3 21.1 L35.2 31 Q35.6 33.1 33.1 35.2 Q31.6 35.6 31 35.2 Z",
);

function Lens({ delay }: { delay: number }) {
  return (
    <Enter delay={delay}>
      <Solid plane="x" at={[20, 44, 36]} depth={4} shape={LENS} />
    </Enter>
  );
}

const SEARCH_TOP = [...reach("x", [0, 40, 46], 34, 46, 3), ...reach("x", [20, 44, 36], 36, 36, 4)];

/** Search, nothing typed yet: a lens over a page of text. */
export function SearchIllustration(props: IllustrationProps) {
  return (
    <Drawing {...props} top={SEARCH_TOP}>
      <g color="color-mix(in oklab, currentColor 55%, var(--color-surface))">
        <Enter delay={0.06} drop={20}>
          <Solid plane="x" at={[0, 40, 46]} depth={3} shape={path(sheet(34, 46))}>
            <path d={FOLD(34)} fill={tone(2)} {...ink} />
            <TextLines u={7} v={11} widths={[14, 18, 10, 16, 12]} />
          </Solid>
        </Enter>
      </g>
      <Lens delay={0} />
    </Drawing>
  );
}

/** Search, no results: the lens over where a page would be. */
export function NoResultsIllustration(props: IllustrationProps) {
  return (
    <Drawing {...props} top={SEARCH_TOP}>
      <Enter delay={0.1} drop={20}>
        <Dashed plane="x" at={[0, 40, 46]} shape={path(sheet(34, 46))} />
      </Enter>
      <Lens delay={0} />
    </Drawing>
  );
}

/** No document open: an empty pane, a page sketched where one would show. */
export function NoDocumentIllustration(props: IllustrationProps) {
  const at: P3 = [0, 48, 40];
  return (
    <Drawing {...props} top={reach("x", at, 48, 40, 3)}>
      <Enter delay={0}>
        <Solid plane="x" at={at} depth={3} shape={rect(48, 40, 4)}>
          {/* The title bar and its three dots. */}
          <Marks d="M0 9 h48" />
          {[5, 10, 15].map((x) => (
            <circle key={x} cx={x} cy={4.5} r={1.4} fill={tone(2)} {...ink} />
          ))}
          <path
            d={sheet(16, 20)}
            transform="translate(16 14)"
            strokeDasharray="2.5 3"
            strokeWidth={1}
            {...ink}
          />
        </Solid>
      </Enter>
    </Drawing>
  );
}

/** Backlinks, none: the open page lying flat, the link to it and the page linking still dashed. */
export function BacklinksIllustration(props: IllustrationProps) {
  const page: P3 = [44, 12, 3];
  return (
    <Drawing
      {...props}
      top={[...reach("floor", [0, 0, 0], 26, 32), ...reach("floor", page, 26, 32, 3)]}
    >
      <Enter delay={0.12} drop={16}>
        <Dashed plane="floor" at={[0, 0, 0]} shape={rect(26, 32, 3)}>
          <path d="M26 14 C36 14 34 26 44 26" {...ink} />
        </Dashed>
      </Enter>
      <Enter delay={0}>
        <Solid plane="floor" at={page} depth={3} shape={rect(26, 32, 3)}>
          <TextLines u={5} v={7} widths={[12, 16, 9]} />
          <TextLines u={5} v={26} widths={[14]} />
        </Solid>
      </Enter>
    </Drawing>
  );
}

/** Outline, no headings: a page of plain text, the heading it lacks sketched at the top. */
export function NoHeadingsIllustration(props: IllustrationProps) {
  const at: P3 = [0, 36, 48];
  return (
    <Drawing {...props} top={reach("x", at, 36, 48, 3)}>
      <Enter delay={0}>
        <Solid plane="x" at={at} depth={3} shape={path(sheet(36, 48))}>
          <path d={FOLD(36)} fill={tone(2)} {...ink} />
          <rect
            x={7}
            y={8}
            width={18}
            height={6}
            rx={1.5}
            strokeDasharray="2.5 3"
            strokeWidth={1}
            {...ink}
          />
          <TextLines u={7} v={22} widths={[20, 16, 22]} />
          <TextLines u={7} v={40} widths={[12]} />
        </Solid>
      </Enter>
    </Drawing>
  );
}

// A cloud in a 44 × 28 box, flat along the bottom.
const CLOUD = path("M11 28 A9 9 0 0 1 9.5 10.2 A13 13 0 0 1 34 9 A9.5 9.5 0 0 1 34.5 28 Z");

/** Not signed in: a page here, the cloud it could sync to further back. */
export function SyncIllustration(props: IllustrationProps) {
  const cloud: P3 = [0, 52, 54];
  const page: P3 = [26, 40, 40];
  return (
    <Drawing {...props} top={[...reach("x", cloud, 44, 28, 4), ...reach("x", page, 30, 40, 3)]}>
      <g color="color-mix(in oklab, currentColor 50%, var(--color-surface))">
        <Enter delay={0.08} from={[-24, -14]} duration={3.8}>
          <Solid plane="x" at={cloud} depth={4} shape={CLOUD}>
            <Marks d="M22 22 v-9 M18.5 16.5 L22 13 L25.5 16.5" />
          </Solid>
        </Enter>
      </g>
      <Enter delay={0}>
        <Solid plane="x" at={page} depth={3} shape={path(sheet(30, 40))}>
          <path d={FOLD(30)} fill={tone(2)} {...ink} />
          <TextLines u={6} v={10} widths={[12, 16, 9]} />
          <TextLines u={6} v={30} widths={[14]} />
        </Solid>
      </Enter>
    </Drawing>
  );
}

const CARDS: P3[] = [
  [8, 9, 6],
  [50, 7, 6],
  [28, 22, 6],
  [10, 33, 6],
  [52, 34, 6],
];

/** A board with no grouping: cards loose on it, the columns they could fall into dashed. */
export function BoardIllustration(props: IllustrationProps) {
  const at: P3 = [0, 0, 4];
  return (
    <Drawing {...props} top={[...reach("floor", at, 74, 52, 4), [74, 52, 8]]}>
      <Rise at={at} w={74} h={52} depth={4} delay={0}>
        <Solid plane="floor" at={at} depth={4} shape={rect(74, 52, 5)}>
          <path d="M24.7 5 v42 M49.3 5 v42" strokeDasharray="2.5 3" strokeWidth={1} {...ink} />
        </Solid>
      </Rise>
      {CARDS.map((card, index) => (
        <Enter key={card.join()} delay={0.12 + index * 0.06} drop={14}>
          <Solid plane="floor" at={card} depth={2} shape={rect(15, 10, 2)}>
            <TextLines u={3.5} v={3.5} widths={[8]} />
            <path d="M3.5 7 h5" stroke={BAR} strokeWidth={1.6} {...ink} />
          </Solid>
        </Enter>
      ))}
    </Drawing>
  );
}

// A padlock's shackle in a 16 × 14 box: a U with its inside cut away.
const SHACKLE = path("M0 14 V8 A8 8 0 0 1 16 8 V14 H12 V8 A4 4 0 0 0 4 8 V14 Z");

/** No access: the page faded behind a padlock. */
export function NoAccessIllustration(props: IllustrationProps) {
  const page: P3 = [0, 40, 46];
  const body: P3 = [20, 44, 22];
  return (
    <Drawing
      {...props}
      top={[
        ...reach("x", page, 34, 46, 3),
        ...reach("x", [18, 40, 34], 16, 14, 3),
        ...reach("x", body, 24, 20, 6),
      ]}
    >
      <g color="color-mix(in oklab, currentColor 50%, var(--color-surface))">
        <Enter delay={0.08} drop={20}>
          <Solid plane="x" at={page} depth={3} shape={path(sheet(34, 46))}>
            <path d={FOLD(34)} fill={tone(2)} {...ink} />
            <TextLines u={7} v={11} widths={[14, 18, 10, 16, 12]} />
          </Solid>
        </Enter>
      </g>
      <Enter delay={0}>
        <Solid plane="x" at={[18, 40, 34]} depth={3} shape={SHACKLE} />
        <Solid plane="x" at={body} depth={6} shape={rect(24, 20, 4)}>
          <circle cx={12} cy={8.5} r={2.4} fill={tone(2)} strokeWidth={1} {...ink} />
          <Marks d="M12 11 v4" width={1.6} />
        </Solid>
      </Enter>
    </Drawing>
  );
}

/** The document does not exist: only its outline left, a question where its text was. */
export function NotFoundIllustration(props: IllustrationProps) {
  const at: P3 = [0, 36, 48];
  return (
    <Drawing {...props} top={reach("x", at, 36, 48)}>
      <Enter delay={0}>
        <Dashed plane="x" at={at} shape={path(sheet(36, 48))} strength={60}>
          <path d={FOLD(36)} {...ink} />
        </Dashed>
        <g transform={planeMatrix("x", at)} color={fadedInk(60)}>
          <path
            d="M13.5 19 A4.5 4.5 0 1 1 20.5 22.7 C19 23.6 18 24.5 18 26.5 M18 31 v0.1"
            strokeWidth={2}
            {...ink}
          />
        </g>
      </Enter>
    </Drawing>
  );
}

// The mark's two pieces (drawn in a 100 box) at the drawing's scale. Turned 45° so the box's sides
// run across and down the screen once on the floor: the mark lies the way the logo stands.
const MARK = 48;
const MARK_DEPTH = 4;
const markPiece =
  (d: string): Shape =>
  (props) => <path d={d} transform={`scale(${MARK / 100}) rotate(-45 50 50)`} {...props} />;
const [MARK_BODY, MARK_CRESCENT] = MARK_PIECES.map(markPiece) as [Shape, Shape];

/** Lydie itself, nothing in it yet: the mark's two pieces lying flat, one dropped after the other. */
export function MarkIllustration(props: IllustrationProps) {
  const at: P3 = [0, 0, MARK_DEPTH];
  return (
    <Drawing {...props} top={reach("floor", at, MARK, MARK, MARK_DEPTH)}>
      <Enter delay={0} drop={18}>
        <Solid plane="floor" at={at} depth={MARK_DEPTH} shape={MARK_BODY} />
      </Enter>
      <Enter delay={0.6} drop={18}>
        <Solid plane="floor" at={at} depth={MARK_DEPTH} shape={MARK_CRESCENT} />
      </Enter>
    </Drawing>
  );
}
