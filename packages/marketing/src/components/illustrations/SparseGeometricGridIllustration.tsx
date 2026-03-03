import { cva } from "cva";

const SHAPE_TYPES = ["circle", "square", "half-circle"] as const;
const SHAPE_TONES = ["blue", "gray", "white"] as const;

type ShapeType = (typeof SHAPE_TYPES)[number];
type ShapeTone = (typeof SHAPE_TONES)[number];
type IllustrationRadius = "sm" | "md" | "lg";
type RandomFn = () => number;

type ShapeTile = {
  type: ShapeType;
  tone: ShapeTone;
};

type SparseGeometricGridIllustrationProps = {
  seed?: number | string;
  columns?: number;
  rows?: number;
  shapeCount?: number;
  radius?: IllustrationRadius;
};

const illustrationFrame = cva({
  base: "relative h-full w-full overflow-hidden",
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

function createShapeMap(
  totalTiles: number,
  shapeCount: number,
  random: RandomFn,
): Map<number, ShapeTile> {
  const indices = Array.from({ length: totalTiles }, (_, index) => index);

  for (let index = indices.length - 1; index > 0; index -= 1) {
    const randomIndex = Math.floor(random() * (index + 1));
    [indices[index], indices[randomIndex]] = [indices[randomIndex]!, indices[index]!];
  }

  const selected = indices.slice(0, Math.min(shapeCount, totalTiles));
  const map = new Map<number, ShapeTile>();

  for (const index of selected) {
    map.set(index, {
      type: SHAPE_TYPES[Math.floor(random() * SHAPE_TYPES.length)] ?? "circle",
      tone: SHAPE_TONES[Math.floor(random() * SHAPE_TONES.length)] ?? "blue",
    });
  }

  return map;
}

function Shape({ tone, type }: ShapeTile) {
  const shapeTone =
    tone === "white"
      ? "bg-white shadow-surface ring ring-black/4"
      : tone === "gray"
        ? "bg-gray-300"
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

export function SparseGeometricGridIllustration({
  seed,
  columns = 12,
  rows = 6,
  shapeCount = 5,
  radius,
}: SparseGeometricGridIllustrationProps) {
  const random = seed === undefined ? Math.random : createSeededRandom(seed);
  const totalTiles = columns * rows;
  const shapeMap = createShapeMap(totalTiles, shapeCount, random);

  return (
    <div className={illustrationFrame({ radius })}>
      <div className="absolute inset-0 flex items-center justify-center">
        <div
          className="grid"
          style={{
            gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))`,
            gridTemplateRows: `repeat(${rows}, minmax(0, 1fr))`,
            width: `min(100%, calc(${columns} * clamp(24px, 7vw, 48px)))`,
            height: `min(100%, calc(${rows} * clamp(24px, 7vw, 48px)))`,
            maskImage: "radial-gradient(ellipse at center, black 64%, transparent 100%)",
            WebkitMaskImage: "radial-gradient(ellipse at center, black 64%, transparent 100%)",
          }}
        >
          {Array.from({ length: totalTiles }, (_, index) => {
            const shape = shapeMap.get(index);
            const isLastColumn = (index + 1) % columns === 0;
            const isLastRow = index >= totalTiles - columns;
            const cellBorders = `${isLastColumn ? "" : "border-r"} ${isLastRow ? "" : "border-b"}`;

            return (
              <div
                key={index}
                className={`relative flex items-center justify-center border-black/[0.08] ${cellBorders}`}
              >
                {shape ? (
                  <div className="size-[68%] max-h-10 max-w-10 min-h-5 min-w-5">
                    <Shape tone={shape.tone} type={shape.type} />
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
