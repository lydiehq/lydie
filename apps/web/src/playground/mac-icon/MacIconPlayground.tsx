import { useApp } from "@lydie/plugin-api";
import { Button, StarFilled, StarRegular } from "@lydie/plugin-api/ui";
import { useRef, useState } from "react";

import { CANVAS, MacIcon, serialize, VARIANTS } from "./mac-icon.tsx";
import type { Variant } from "./mac-icon.tsx";

const STORAGE_KEY = "playground.macIcon";

const PRESETS = [
  { name: "Dusty pink", color: "#c9959b" },
  { name: "Rose clay", color: "#b47a80" },
  { name: "Blush", color: "#e2b4b1" },
  { name: "Mauve", color: "#a68598" },
  { name: "Terracotta", color: "#c47f66" },
  { name: "Sage", color: "#8ea592" },
  { name: "Slate", color: "#7d8ba3" },
];

type Settings = { color: string; markScale: number; favorite: string | null };
type Round = 1 | 2 | 3;

const DEFAULTS: Settings = { color: PRESETS[0]!.color, markScale: 0.56, favorite: null };

export function MacIconPlayground() {
  const app = useApp();
  const [settings, setSettings] = useState<Settings>(() => ({
    ...DEFAULTS,
    ...app.storage.get<Partial<Settings>>(STORAGE_KEY),
  }));
  // Not remembered: the page always opens on the latest round.
  const [round, setRound] = useState<Round>(3);
  const [dark, setDark] = useState(false);
  const update = (patch: Partial<Settings>) => {
    const next = { ...settings, ...patch };
    setSettings(next);
    app.storage.set(STORAGE_KEY, next);
  };
  const { color, markScale, favorite } = settings;
  const variants = VARIANTS.filter((variant) => variant.round === round);

  return (
    <div className="min-h-0 grow overflow-y-auto" data-testid="mac-icon-playground">
      <div className="mx-auto flex w-full max-w-[1040px] flex-col gap-8 px-8 pt-10 pb-16">
        <header className="flex flex-col gap-1">
          <h1 className="text-lg font-medium text-gray-900">Mac icon</h1>
          <p className="text-sm text-gray-500">
            Directions for the Lydie app icon on the macOS grid (1024 canvas, 824 body, continuous
            corners). Everything follows the theme colour. Exports are 1024 × 1024.
          </p>
        </header>

        <section aria-label="Theme" className="flex flex-wrap items-center gap-x-8 gap-y-4">
          <fieldset className="flex items-center gap-1" aria-label="Round">
            {([3, 2, 1] as const).map((r) => (
              <Button
                key={r}
                size="xs"
                variant="ghost"
                data-current={round === r || undefined}
                onPress={() => setRound(r)}
              >
                Round {r}
              </Button>
            ))}
          </fieldset>
          <div className="flex items-center gap-2">
            <span className="mr-1 text-sm text-gray-600">Theme colour</span>
            {PRESETS.map((preset) => (
              <button
                key={preset.color}
                type="button"
                aria-label={preset.name}
                aria-pressed={color === preset.color}
                title={preset.name}
                onClick={() => update({ color: preset.color })}
                className="size-6 rounded-full shadow-[inset_0_0_0_1px_rgb(0_0_0/0.1)] outline-offset-2 transition-transform hover:scale-110 aria-pressed:outline-2 aria-pressed:outline-gray-800"
                style={{ background: preset.color }}
              />
            ))}
            <label className="relative ml-1 flex items-center gap-2 text-sm text-gray-600">
              <input
                type="color"
                value={color}
                onChange={(event) => update({ color: event.target.value })}
                className="size-6 cursor-pointer rounded-full border-0 bg-transparent p-0 [&::-webkit-color-swatch]:rounded-full [&::-webkit-color-swatch]:border-gray-950/10 [&::-webkit-color-swatch-wrapper]:p-0"
                aria-label="Custom colour"
              />
              <span className="font-mono text-xs text-gray-500 tabular-nums">{color}</span>
            </label>
          </div>
          <label className="flex items-center gap-3 text-sm text-gray-600">
            Mark size
            <input
              type="range"
              min={0.4}
              max={0.72}
              step={0.01}
              value={markScale}
              onChange={(event) => update({ markScale: Number(event.target.value) })}
              className="w-36 accent-gray-800"
            />
            <span className="w-8 font-mono text-xs text-gray-500 tabular-nums">
              {Math.round(markScale * 100)}%
            </span>
          </label>
        </section>

        <Dock
          variants={variants}
          color={color}
          markScale={markScale}
          dark={dark}
          onToggle={() => setDark(!dark)}
        />

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {variants.map((variant) => (
            <VariantCard
              key={variant.id}
              variant={variant}
              color={color}
              markScale={markScale}
              favorite={favorite === variant.id}
              onFavorite={() => update({ favorite: favorite === variant.id ? null : variant.id })}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

// The icons as they would sit in the Dock, on a light or dark wallpaper.
function Dock({
  variants,
  color,
  markScale,
  dark,
  onToggle,
}: {
  variants: Variant[];
  color: string;
  markScale: number;
  dark: boolean;
  onToggle: () => void;
}) {
  return (
    <section
      aria-label="Dock preview"
      className="relative flex h-56 flex-col items-center justify-end overflow-hidden rounded-2xl pb-5"
      style={{
        background: dark
          ? "radial-gradient(120% 90% at 20% 0%, #3a3550 0%, #15151f 55%, #0b0b10 100%)"
          : "radial-gradient(120% 90% at 20% 0%, #fde6e2 0%, #e9e4f5 45%, #cfdcf0 100%)",
      }}
    >
      <Button size="xs" variant="secondary" className="absolute top-3 right-3" onPress={onToggle}>
        {dark ? "Light wallpaper" : "Dark wallpaper"}
      </Button>
      <div
        className={`flex items-end gap-2 rounded-[22px] border px-2.5 pt-2.5 pb-3 backdrop-blur-xl ${
          dark ? "border-white/15 bg-white/10" : "border-white/60 bg-white/35"
        }`}
      >
        {variants.map((variant) => (
          <div key={variant.id} className="flex flex-col items-center gap-1">
            <MacIcon variant={variant.id} color={color} markScale={markScale} size={72} />
            <span className={`size-1 rounded-full ${dark ? "bg-white/70" : "bg-gray-900/60"}`} />
          </div>
        ))}
      </div>
    </section>
  );
}

function VariantCard({
  variant,
  color,
  markScale,
  favorite,
  onFavorite,
}: {
  variant: Variant;
  color: string;
  markScale: number;
  favorite: boolean;
  onFavorite: () => void;
}) {
  const svg = useRef<SVGSVGElement>(null);
  const name = `lydie-icon-${variant.id}`;
  const exportSvg = () => {
    if (!svg.current) return;
    download(new Blob([serialize(svg.current)], { type: "image/svg+xml" }), `${name}.svg`);
  };
  const exportPng = async () => {
    if (!svg.current) return;
    const blob = await rasterize(serialize(svg.current));
    if (blob) download(blob, `${name}-1024.png`);
  };

  return (
    <article
      aria-label={variant.name}
      className={`flex flex-col gap-4 rounded-xl border bg-elevated p-5 ${
        favorite ? "border-gray-950/25" : "border-gray-950/8"
      }`}
    >
      <div className="flex items-center gap-6">
        <MacIcon
          ref={svg}
          variant={variant.id}
          color={color}
          markScale={markScale}
          size={200}
          className="-m-4 shrink-0"
        />
        <div className="flex min-w-0 grow flex-col gap-3">
          <div className="flex items-start gap-2">
            <div className="grow">
              <h2 className="text-sm font-medium text-gray-900">{variant.name}</h2>
              <p className="mt-0.5 text-sm text-gray-500">{variant.description}</p>
            </div>
            <Button
              size="icon-sm"
              variant="ghost"
              aria-label={favorite ? `Unpick ${variant.name}` : `Pick ${variant.name}`}
              onPress={onFavorite}
            >
              {favorite ? <StarFilled className="text-amber-500" /> : <StarRegular />}
            </Button>
          </div>
          {/* Legibility at the sizes macOS actually shows (Finder lists, menus, Spotlight). */}
          <div className="flex items-end gap-3">
            {[64, 32, 16].map((size) => (
              <MacIcon
                key={size}
                variant={variant.id}
                color={color}
                markScale={markScale}
                size={size}
              />
            ))}
          </div>
          <div className="flex gap-1.5">
            <Button size="xs" variant="secondary" onPress={exportSvg}>
              SVG
            </Button>
            <Button size="xs" variant="secondary" onPress={() => void exportPng()}>
              PNG 1024
            </Button>
          </div>
        </div>
      </div>
    </article>
  );
}

function download(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

async function rasterize(svgText: string): Promise<Blob | null> {
  const url = URL.createObjectURL(new Blob([svgText], { type: "image/svg+xml" }));
  try {
    const image = new Image();
    image.src = url;
    await image.decode();
    const canvas = document.createElement("canvas");
    canvas.width = CANVAS;
    canvas.height = CANVAS;
    canvas.getContext("2d")?.drawImage(image, 0, 0, CANVAS, CANVAS);
    return await new Promise((resolve) => canvas.toBlob(resolve, "image/png"));
  } finally {
    URL.revokeObjectURL(url);
  }
}
