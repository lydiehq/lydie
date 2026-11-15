// Page icons and covers, stored as frontmatter properties (see `PAGE_ICON_KEY` in the plugin API)
// so files stay portable: `icon: 🚀` and `cover: blue` (a colour). A cover written by hand may
// also be an image (an attachment's file name or an https URL, with `cover-position: 0–100`): it
// shows and can be repositioned, but the app only sets colours for now. Changes are
// `doc.setProperties` operations, so Mod+Z undoes them.
import {
  COVER_COLORS,
  coverFillOf,
  definePlugin,
  docIdOf,
  PAGE_COVER_KEY,
  PAGE_COVER_POSITION_KEY,
  PAGE_ICON_KEY,
  pageColumnClass,
  pageCoverOf,
  pageFullWidthOf,
  PageIcon,
  pageIconOf,
  useCoverUrl,
  useOps,
  useQuerySelect,
} from "@lydie/plugin-api";
import type { AppApi, CoverColor, DocumentSlotProps } from "@lydie/plugin-api";
import {
  AriaDialog,
  Button,
  EmojiRegular,
  focusRingClass,
  IconPicker,
  PicRegular,
  Popover,
  WithTooltip,
} from "@lydie/plugin-api/ui";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { ReactNode, RefObject } from "react";

// Emoji a page is often about, offered first on the picker's emoji tab.
const SUGGESTED =
  "📄 📝 📌 📎 📚 📖 🗂️ 🗓️ ✅ ⭐ 🔥 🚀 💡 🎯 🧭 🧪 🛠️ 🔒 🌱 🌍 🏠 🏢 💼 💰 📈 📊 ⏰ 🎨 🎵 🎬 📷 ❤️ 😀 🤔 👋 🙌 🐛 🧠 🍀 ☕".split(
    " ",
  );

function isUrl(value: string) {
  return /^https?:\/\//i.test(value);
}

// "Set page icon" and "Set page cover" live in the palette, while the pickers open on the page:
// the request waits here until that page's decor takes it.
type Picker = "icon" | "cover";
let requested: { docId: string; picker: Picker } | null = null;
const takers = new Set<() => void>();

function openPicker(app: AppApi, docId: string, picker: Picker) {
  requested = { docId, picker };
  for (const take of takers) take();
  // Not on screen: open the page, whose decor takes the request.
  if (requested) app.openDoc(docId);
}

// The shared popover. It closes on Escape and on a press outside, and returns focus.
function DecorPopover({
  anchor,
  isOpen,
  onClose,
  label,
  placement,
  className,
  children,
}: {
  anchor: RefObject<HTMLElement | null>;
  isOpen: boolean;
  onClose: () => void;
  label: string;
  placement: "bottom start" | "top end";
  className?: string;
  children: ReactNode;
}) {
  return (
    <Popover
      triggerRef={anchor}
      isOpen={isOpen}
      onOpenChange={(open) => !open && onClose()}
      placement={placement}
    >
      <AriaDialog aria-label={label} className={`p-2 outline-none ${className ?? ""}`}>
        {children}
      </AriaDialog>
    </Popover>
  );
}

// Focus starts on the first choice.
function FocusFirst({ children }: { children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    ref.current?.querySelector<HTMLElement>("button, input")?.focus();
  }, []);
  return (
    <div ref={ref} className="contents">
      {children}
    </div>
  );
}

function IconPopover({
  anchor,
  isOpen,
  icon,
  onPick,
  onRecolor,
  onRemove,
  onClose,
}: {
  anchor: RefObject<HTMLElement | null>;
  isOpen: boolean;
  icon: string | null;
  onPick: (icon: string) => void;
  onRecolor: (icon: string) => void;
  onRemove?: () => void;
  onClose: () => void;
}) {
  return (
    <DecorPopover
      anchor={anchor}
      isOpen={isOpen}
      onClose={onClose}
      label="Choose an icon"
      placement="bottom start"
    >
      <IconPicker
        value={icon}
        onPick={onPick}
        onRecolor={onRecolor}
        onRemove={onRemove}
        suggested={SUGGESTED}
      />
    </DecorPopover>
  );
}

const COLOR_NAMES = Object.keys(COVER_COLORS) as CoverColor[];

const SWATCH = "size-6 rounded-full ring-1 ring-inset";
const swatchRing = (selected: boolean) => (selected ? "ring-gray-950/60" : "ring-gray-950/10");

// `#abc` as `#aabbcc`, the only form a colour input takes.
function longHex(hex: string) {
  return hex.length === 4 ? `#${[...hex.slice(1)].map((c) => c + c).join("")}` : hex;
}

// Any colour, from the system's picker: a colour input laid over a rainbow swatch (the colour
// itself once it is one), so a press on the swatch opens it. Kept as a hex (`cover: "#3b82f6"`).
// Each `input` while the picker is open is a preview (the cover follows, nothing is written);
// the colour is written once the picker closes (the input's `change`, which React does not
// expose: its onChange is every `input`).
function CustomColor({
  current,
  onPick,
  onPreview,
}: {
  current: string | null;
  onPick: (hex: string) => void;
  onPreview: (hex: string) => void;
}) {
  const swatch = useRef<HTMLSpanElement>(null);
  // On the swatch: `change` bubbles, and the tooltip wraps the input.
  useEffect(() => {
    const el = swatch.current;
    if (!el) return;
    const changed = (event: Event) => onPick((event.target as HTMLInputElement).value);
    el.addEventListener("change", changed);
    return () => el.removeEventListener("change", changed);
  }, [onPick]);
  const hex = current?.startsWith("#") ? longHex(current) : null;
  return (
    <span
      ref={swatch}
      className={`relative ${SWATCH} ${swatchRing(hex !== null)} has-focus-visible:outline-2 has-focus-visible:outline-offset-2 has-focus-visible:outline-blue-600`}
      style={{
        background: hex ?? "conic-gradient(red, yellow, lime, cyan, blue, magenta, red)",
      }}
    >
      <WithTooltip label="Any colour">
        <input
          type="color"
          aria-label="Any cover colour"
          defaultValue={hex ?? "#3b82f6"}
          onInput={(event) => onPreview(event.currentTarget.value)}
          className="absolute inset-0 size-full cursor-pointer opacity-0"
        />
      </WithTooltip>
    </span>
  );
}

function ColorPicker({
  anchor,
  isOpen,
  current,
  onPick,
  onPreview,
  onClose,
  placement,
}: {
  anchor: RefObject<HTMLElement | null>;
  isOpen: boolean;
  current: string | null;
  onPick: (color: string) => void;
  onPreview: (color: string) => void;
  onClose: () => void;
  placement: "bottom start" | "top end";
}) {
  return (
    <DecorPopover
      anchor={anchor}
      isOpen={isOpen}
      onClose={onClose}
      label="Choose a cover colour"
      placement={placement}
      className="flex gap-1.5"
    >
      <FocusFirst>
        {COLOR_NAMES.map((color) => (
          <button
            key={color}
            type="button"
            aria-label={`Cover colour ${color}`}
            aria-pressed={current === color}
            onClick={() => onPick(color)}
            className={`${SWATCH} ${swatchRing(current === color)} ${COVER_COLORS[color]} ${focusRingClass}`}
          />
        ))}
        <CustomColor current={current} onPick={onPick} onPreview={onPreview} />
      </FocusFirst>
    </DecorPopover>
  );
}

// The strip of the cover the page's top bar lies over (the doc view's 36 px bar).
const BAR_HEIGHT = 36;
// Lighter than this (relative luminance) and the bar's ink turns dark. Above WCAG's crossover
// (0.18) on purpose: white reads better on mid colours such as orange, and the bar has a fade.
const LIGHT_LUMINANCE = 0.42;

function linear(channel: number) {
  const c = channel / 255;
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

// Whether what `draw` paints into a small canvas is light or dark on average. Null when it cannot
// be read: an image from another origin without CORS taints the canvas.
function toneOf(draw: (ctx: CanvasRenderingContext2D, w: number, h: number) => void) {
  const canvas = document.createElement("canvas");
  canvas.width = 16;
  canvas.height = 4;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) return null;
  try {
    draw(ctx, canvas.width, canvas.height);
    const { data } = ctx.getImageData(0, 0, canvas.width, canvas.height);
    let sum = 0;
    for (let i = 0; i < data.length; i += 4) {
      sum +=
        0.2126 * linear(data[i]!) + 0.7152 * linear(data[i + 1]!) + 0.0722 * linear(data[i + 2]!);
    }
    return sum / (data.length / 4) > LIGHT_LUMINANCE ? "light" : "dark";
  } catch {
    return null;
  }
}

// The part of an `object-fit: cover` image under the bar, at `position` (0–100, vertical).
function barToneOfImage(img: HTMLImageElement, position: number) {
  const { naturalWidth: iw, naturalHeight: ih, clientWidth: w, clientHeight: h } = img;
  if (!iw || !ih || !w || !h) return null;
  const scale = Math.max(w / iw, h / ih);
  const x = (w - iw * scale) / 2;
  const y = ((h - ih * scale) * position) / 100;
  return toneOf((ctx, cw, ch) =>
    ctx.drawImage(img, -x / scale, -y / scale, w / scale, BAR_HEIGHT / scale, 0, 0, cw, ch),
  );
}

function Cover({
  docId,
  cover,
  position,
  onColor,
  onPreview,
}: {
  docId: string;
  cover: string;
  position: number;
  onColor: (color: string) => void;
  onPreview: (color: string | null) => void;
}) {
  const ops = useOps();
  const url = useCoverUrl(cover);
  const fill = coverFillOf(cover);
  const [dragging, setDragging] = useState<number | null>(null);
  const [coloring, setColoring] = useState(false);
  const [tone, setTone] = useState<"light" | "dark" | null>(null);
  const [loaded, setLoaded] = useState<string | null>(null);
  const start = useRef<{ y: number; pos: number } | null>(null);
  const actions = useRef<HTMLDivElement>(null);
  const box = useRef<HTMLDivElement>(null);
  const img = useRef<HTMLImageElement>(null);
  const shown = dragging ?? position;
  // How light the cover is under the page's top bar, for the doc view to pick its ink
  // (`data-cover-tone`). A colour (or the placeholder while an image loads) by its computed
  // background, an image by the strip it shows there.
  useLayoutEffect(() => {
    const el = box.current;
    if (!el) return;
    const image = img.current;
    setTone(
      image && loaded === url
        ? barToneOfImage(image, shown)
        : toneOf((ctx, w, h) => {
            ctx.fillStyle = getComputedStyle(el).backgroundColor;
            ctx.fillRect(0, 0, w, h);
          }),
    );
  }, [cover, url, loaded, shown]);
  return (
    <div
      ref={box}
      className={`group relative h-48 w-full shrink-0 overflow-hidden ${fill ? fill.className : "bg-gray-100"}`}
      style={fill?.style}
      data-testid="page-cover"
      data-page-cover=""
      data-cover-tone={tone ?? undefined}
      data-cover-color={fill ? cover.toLowerCase() : undefined}
    >
      {fill ? null : url ? (
        <img
          ref={img}
          src={url}
          alt=""
          onLoad={() => setLoaded(url)}
          draggable={false}
          className={`size-full object-cover ${dragging !== null ? "cursor-grabbing" : ""}`}
          style={{ objectPosition: `50% ${shown}%` }}
          onPointerDown={(e) => {
            if (!(e.currentTarget.dataset.reposition === "true")) return;
            start.current = { y: e.clientY, pos: shown };
            e.currentTarget.setPointerCapture(e.pointerId);
          }}
          onPointerMove={(e) => {
            if (!start.current) return;
            const delta = ((start.current.y - e.clientY) / e.currentTarget.clientHeight) * 100;
            setDragging(Math.max(0, Math.min(100, Math.round(start.current.pos + delta))));
          }}
          onPointerUp={() => {
            start.current = null;
          }}
          data-reposition={dragging !== null ? "true" : "false"}
        />
      ) : (
        <div className="flex size-full items-center justify-center text-xs text-gray-400">
          {isUrl(cover) ? "Loading cover…" : `Cover not found: ${cover}`}
        </div>
      )}
      <div
        ref={actions}
        className="absolute right-3 bottom-2 flex gap-1 opacity-0 group-hover:opacity-100 focus-within:opacity-100"
      >
        {dragging === null ? (
          <>
            {!fill && (
              <Button size="xs" variant="secondary" onPress={() => setDragging(position)}>
                Reposition
              </Button>
            )}
            <Button size="xs" variant="secondary" onPress={() => setColoring(!coloring)}>
              Colour
            </Button>
            <ColorPicker
              anchor={actions}
              isOpen={coloring}
              current={fill ? cover.toLowerCase() : null}
              placement="top end"
              onClose={() => {
                setColoring(false);
                onPreview(null);
              }}
              onPreview={onPreview}
              onPick={(color) => {
                setColoring(false);
                onColor(color);
              }}
            />
            <Button
              size="xs"
              variant="secondary"
              onPress={() =>
                void ops.doc.setProperties(
                  { id: docId, unset: [PAGE_COVER_KEY, PAGE_COVER_POSITION_KEY] },
                  { label: "Remove cover" },
                )
              }
            >
              Remove
            </Button>
          </>
        ) : (
          <Button
            size="xs"
            variant="primary"
            onPress={() => {
              void ops.doc.setProperties(
                { id: docId, set: { [PAGE_COVER_POSITION_KEY]: dragging } },
                { label: "Reposition cover" },
              );
              setDragging(null);
            }}
          >
            Save position
          </Button>
        )}
      </div>
    </div>
  );
}

function PageDecor({ docId }: DocumentSlotProps) {
  const ops = useOps();
  const properties = useQuerySelect(
    "doc.get",
    { id: docId },
    (s) => s.data[0]?.document.properties ?? null,
  );
  const [picking, setPicking] = useState(false);
  const [coloring, setColoring] = useState(false);
  // A colour shown while the system's colour picker is open, before it is written.
  const [preview, setPreview] = useState<string | null>(null);
  const iconAnchor = useRef<HTMLDivElement>(null);
  const bar = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const take = () => {
      if (requested?.docId !== docId) return;
      const { picker } = requested;
      requested = null;
      if (picker === "icon") setPicking(true);
      else setColoring(true);
    };
    take();
    takers.add(take);
    return () => {
      takers.delete(take);
    };
  }, [docId]);
  if (!properties) return null;
  const icon = pageIconOf(properties);
  const decor = pageCoverOf(properties);
  const column = pageColumnClass(pageFullWidthOf(properties));
  const cover = preview ?? decor?.cover ?? null;
  const position = decor?.position ?? 50;
  const fill = coverFillOf(cover);
  // The preview stays until the page has the colour, so the cover does not flash back.
  const setCover = (color: string) => {
    void ops.doc
      .setProperties(
        { id: docId, set: { [PAGE_COVER_KEY]: color }, unset: [PAGE_COVER_POSITION_KEY] },
        { label: decor ? "Change cover" : "Add cover" },
      )
      .finally(() => setPreview(null));
  };
  const setIcon = (value: string | null, keepOpen = false) => {
    if (!keepOpen) setPicking(false);
    void ops.doc.setProperties(
      value
        ? { id: docId, set: { [PAGE_ICON_KEY]: value } }
        : { id: docId, unset: [PAGE_ICON_KEY] },
      { label: value ? "Set page icon" : "Remove page icon" },
    );
  };
  // The buttons sit in the room the page already has above the title, or above the icon when
  // there is one (the icon is close to the title), so a page is no taller for them.
  const barPlace = icon ? "-translate-y-8" : cover ? "translate-y-3" : "translate-y-4";
  return (
    <div className="group/decor flex flex-col" data-testid="page-decor">
      {cover && (
        <Cover
          docId={docId}
          cover={cover}
          position={position}
          onColor={setCover}
          onPreview={setPreview}
        />
      )}
      {/* The icon is 16 px above the title (whose own room above is 48 px), with or without a cover. */}
      <div className={`${column} ${icon ? `-mb-8 ${cover ? "" : "pt-10"}` : ""}`}>
        {/* Hidden until the pointer is on them, the cover or the title (`data-page-title`, the
            doc view's), as in Notion; they stay while one of their pickers is open. Always
            rendered: the pickers the page menu asks for open here too. */}
        <div
          ref={bar}
          className={`relative -mb-7 -ml-1.5 flex h-7 w-fit gap-1 transition-opacity duration-100 ${barPlace} ${
            picking || coloring
              ? "opacity-100"
              : "opacity-0 group-hover/decor:opacity-100 group-has-[~*_[data-page-title]:hover]/decor:opacity-100 focus-within:opacity-100"
          }`}
        >
          {!icon && (
            <Button size="xs" variant="ghost" onPress={() => setPicking(!picking)}>
              Add icon
            </Button>
          )}
          {!cover && (
            <Button size="xs" variant="ghost" onPress={() => setColoring(!coloring)}>
              Add cover
            </Button>
          )}
        </div>
        {icon && (
          <div ref={iconAnchor} className={`relative w-fit ${cover ? "-mt-10" : ""}`}>
            <WithTooltip label="Change page icon">
              <button
                type="button"
                aria-label="Change page icon"
                data-page-icon={icon}
                onClick={() => setPicking(!picking)}
                className="flex size-15 items-center justify-center rounded-lg text-5xl leading-none hover:bg-gray-950/5"
              >
                <PageIcon icon={icon} size={48} />
              </button>
            </WithTooltip>
          </div>
        )}
        <IconPopover
          anchor={icon ? iconAnchor : bar}
          isOpen={picking}
          icon={icon}
          onPick={setIcon}
          onRecolor={(value) => setIcon(value, true)}
          {...(icon ? { onRemove: () => setIcon(null) } : {})}
          onClose={() => setPicking(false)}
        />
        <ColorPicker
          anchor={bar}
          isOpen={coloring}
          current={fill && cover ? cover.toLowerCase() : null}
          placement="bottom start"
          onClose={() => {
            setColoring(false);
            setPreview(null);
          }}
          onPreview={setPreview}
          onPick={(color) => {
            setColoring(false);
            setCover(color);
          }}
        />
      </div>
    </div>
  );
}

export const pageDecorPlugin = definePlugin({
  id: "page-decor",
  name: "Page icons and covers",
  description: "An emoji icon and a cover image per page, kept as frontmatter properties.",
  activate(ctx) {
    ctx.documents.register({ id: "page-decor", slot: "top", order: 0, component: PageDecor });
    for (const [picker, title, icon] of [
      ["icon", "Set page icon", <EmojiRegular key="icon" />],
      ["cover", "Set page cover", <PicRegular key="cover" />],
    ] as const) {
      ctx.commands.register({
        id: `page-decor.set${picker === "icon" ? "Icon" : "Cover"}`,
        title,
        icon,
        group: "Document",
        scope: "document",
        when: (app) => docIdOf(app.activeTab()?.path) !== null,
        run: ({ app }) => {
          const docId = docIdOf(app.activeTab()?.path);
          if (docId) openPicker(app, docId, picker);
        },
      });
    }
    ctx.commands.register({
      id: "page-decor.removeIcon",
      title: "Remove page icon",
      icon: <EmojiRegular />,
      group: "Document",
      scope: "document",
      when: (app) => docIdOf(app.activeTab()?.path) !== null,
      run: ({ app }) => {
        const docId = docIdOf(app.activeTab()?.path);
        if (!docId) return;
        void app.backend.ops.doc.setProperties(
          { id: docId, unset: [PAGE_ICON_KEY] },
          { scope: app.historyScope(), label: "Remove page icon" },
        );
      },
    });
  },
});

export default pageDecorPlugin;
