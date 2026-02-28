import { cva } from "cva";

const SHAPE_TYPES = ["circle", "square", "half-circle"] as const;
const CHARACTER_EMOTES = ["happy", "focused", "sleepy"] as const;

type ShapeType = (typeof SHAPE_TYPES)[number];
type CharacterEmote = (typeof CHARACTER_EMOTES)[number];

type Tile =
  | {
      kind: "shape";
      tone: "blue" | "gray" | "white";
      type: ShapeType;
    }
  | {
      kind: "character";
      emote: CharacterEmote;
    };

type RandomFn = () => number;
type IllustrationRadius = "sm" | "md" | "lg";

const illustrationFrame = cva({
  base: "h-full w-full ring ring-black/6 bg-gray-50",
  variants: {
    radius: {
      sm: "rounded-lg",
      md: "rounded-xl",
      lg: "rounded-2xl",
    },
  },
  defaultVariants: {
    radius: "md",
  },
});

type GeometricPatternIllustrationProps = {
  seed?: number | string;
  columns?: number;
  rows?: number;
  minWhiteShapes?: number;
  radius?: IllustrationRadius;
};

function hashSeed(seed: number | string): number {
  const value = String(seed);
  let hash = 2166136261;

  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }

  return hash >>> 0;
}

function createSeededRandom(seed: number | string): RandomFn {
  let state = hashSeed(seed);

  return () => {
    state += 0x6d2b79f5;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function randomShapeType(random: RandomFn): ShapeType {
  return SHAPE_TYPES[Math.floor(random() * SHAPE_TYPES.length)] ?? "circle";
}

function randomCharacterEmote(random: RandomFn): CharacterEmote {
  return CHARACTER_EMOTES[Math.floor(random() * CHARACTER_EMOTES.length)] ?? "happy";
}

function randomBaseTone(random: RandomFn): "blue" | "gray" {
  return random() < 0.3 ? "gray" : "blue";
}

function areTouching(indexA: number, indexB: number, columns: number): boolean {
  const rowA = Math.floor(indexA / columns);
  const colA = indexA % columns;
  const rowB = Math.floor(indexB / columns);
  const colB = indexB % columns;

  return Math.abs(rowA - rowB) <= 1 && Math.abs(colA - colB) <= 1;
}

function shuffle(values: number[], random: RandomFn): number[] {
  const copy = [...values];

  for (let index = copy.length - 1; index > 0; index -= 1) {
    const randomIndex = Math.floor(random() * (index + 1));
    [copy[index], copy[randomIndex]] = [copy[randomIndex]!, copy[index]!];
  }

  return copy;
}

function createWhiteShapeIndices(
  total: number,
  columns: number,
  minWhiteShapes: number,
  random: RandomFn,
): Set<number> {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    const candidates = shuffle(
      Array.from({ length: total }, (_, index) => index),
      random,
    );
    const selected: number[] = [];

    for (const candidate of candidates) {
      const touchesAnotherWhite = selected.some((current) =>
        areTouching(candidate, current, columns),
      );

      if (!touchesAnotherWhite) {
        selected.push(candidate);
      }

      if (selected.length >= minWhiteShapes) {
        return new Set(selected);
      }
    }
  }

  return new Set([0, 2, 4]);
}

function Shape({ tone, type }: { tone: "blue" | "gray" | "white"; type: ShapeType }) {
  const shapeTone =
    tone === "white"
      ? "bg-white shadow-surface ring ring-black/4"
      : tone === "gray"
        ? "bg-gray-200"
        : "bg-blue-500";

  if (type === "circle") {
    return <div className={`size-full rounded-full ${shapeTone}`} />;
  }

  if (type === "square") {
    return <div className={`size-full rounded-[16%] ${shapeTone}`} />;
  }

  return (
    <div className="size-full flex items-end">
      <div className={`h-1/2 w-full rounded-t-full ${shapeTone}`} />
    </div>
  );
}

function Character({ emote }: { emote: CharacterEmote }) {
  const eyeClass =
    emote === "sleepy"
      ? "h-[7%] w-[7%] rounded-full bg-blue-950/70"
      : "h-[9%] w-[9%] rounded-full bg-blue-950";

  return (
    <div className="relative size-full">
      <div className="absolute left-[12%] top-[8%] h-[36%] w-[14%] -rotate-12 rounded-full bg-blue-500" />
      <div className="absolute right-[12%] top-[8%] h-[36%] w-[14%] rotate-12 rounded-full bg-blue-500" />

      <div className="absolute inset-x-[18%] bottom-[16%] h-[56%] rounded-[40%] bg-blue-500">
        <div className="absolute left-[26%] top-[28%] flex h-full w-[48%] justify-between">
          <span className={eyeClass} />
          <span className={eyeClass} />
        </div>

        {emote === "happy" ? (
          <div className="absolute left-1/2 top-[56%] h-[16%] w-[28%] -translate-x-1/2 rounded-b-full border-b-2 border-blue-950" />
        ) : null}

        {emote === "focused" ? (
          <div className="absolute left-1/2 top-[60%] h-[4%] w-[24%] -translate-x-1/2 rounded-full bg-blue-950" />
        ) : null}

        {emote === "sleepy" ? (
          <div className="absolute left-1/2 top-[58%] h-[12%] w-[18%] -translate-x-1/2 rounded-full border border-blue-950/75" />
        ) : null}
      </div>

      <div className="absolute bottom-[8%] left-[28%] h-[8%] w-[14%] rounded-full bg-blue-600" />
      <div className="absolute bottom-[8%] right-[28%] h-[8%] w-[14%] rounded-full bg-blue-600" />
    </div>
  );
}

function pickCharacterIndex(columns: number, totalShapes: number, random: RandomFn): number {
  const candidates = Array.from({ length: totalShapes }, (_, index) => index).filter(
    (index) => index >= columns,
  );

  if (candidates.length === 0) {
    return Math.floor(totalShapes / 2);
  }

  return candidates[Math.floor(random() * candidates.length)] ?? columns;
}

function createTiles(
  totalShapes: number,
  columns: number,
  minWhiteShapes: number,
  seed?: number | string,
): Tile[] {
  const random = seed === undefined ? Math.random : createSeededRandom(seed);
  const whiteShapeIndices = createWhiteShapeIndices(totalShapes, columns, minWhiteShapes, random);
  const characterIndex = pickCharacterIndex(columns, totalShapes, random);
  const supportBlockIndex = characterIndex - columns;
  const characterEmote = randomCharacterEmote(random);

  return Array.from({ length: totalShapes }, (_, index) => {
    if (index === characterIndex) {
      return {
        kind: "character",
        emote: characterEmote,
      };
    }

    if (index === supportBlockIndex && supportBlockIndex >= 0) {
      return {
        kind: "shape",
        tone: "white",
        type: "square",
      };
    }

    return {
      kind: "shape",
      tone: whiteShapeIndices.has(index) ? "white" : randomBaseTone(random),
      type: randomShapeType(random),
    };
  });
}

export function GeometricPatternIllustration({
  seed,
  columns = 6,
  rows = 3,
  minWhiteShapes = 3,
  radius,
}: GeometricPatternIllustrationProps) {
  const totalShapes = columns * rows;
  const tiles = createTiles(totalShapes, columns, minWhiteShapes, seed);

  return (
    <div className={illustrationFrame({ radius })}>
      <div
        className="grid gap-0.5 h-full w-full"
        style={{
          gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))`,
        }}
      >
        {tiles.map((tile, index) => (
          <div key={index} className="aspect-square w-full">
            {tile.kind === "character" ? (
              <Character emote={tile.emote} />
            ) : (
              <Shape tone={tile.tone} type={tile.type} />
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
