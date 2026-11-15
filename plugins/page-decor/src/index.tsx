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

// How far the cover sits from the view's sides: the gap the side panel and the sidebar's peek keep
// inside the content card.
const COVER_INSET = 4;

// Corners concentric with the rounded box the cover sits in (the tab's card, the side panel): its
// radius less its border and the inset, per top corner; the bottom corners take the larger.
// Written to the element: they are only measured once it is in place.
function useConcentricCorners(box: RefObject<HTMLElement | null>) {
  useLayoutEffect(() => {
    const cover = box.current;
    let el = cover?.parentElement?.parentElement ?? null;
    while (el && Number.parseFloat(getComputedStyle(el).borderTopRightRadius) === 0) {
      el = el.parentElement;
    }
    if (!cover || !el) return;
    const style = getComputedStyle(el);
    const border = Number.parseFloat(style.borderTopWidth) || 0;
    const inner = (radius: string) => Math.max(0, Number.parseFloat(radius) - border - COVER_INSET);
    const left = inner(style.borderTopLeftRadius);
    const right = inner(style.borderTopRightRadius);
    const bottom = `${Math.max(left, right)}px`;
    Object.assign(cover.style, {
      borderTopLeftRadius: `${left}px`,
      borderTopRightRadius: `${right}px`,
      borderBottomLeftRadius: bottom,
      borderBottomRightRadius: bottom,
    });
  }, [box]);
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
  const start = useRef<{ y: number; pos: number } | null>(null);
  const actions = useRef<HTMLDivElement>(null);
  const box = useRef<HTMLDivElement>(null);
  const shown = dragging ?? position;
  useConcentricCorners(box);
  // Under the page's bar, inset from the view's sides, with corners following the container's.
  return (
    <div className="shrink-0" style={{ paddingInline: COVER_INSET }}>
      <div
        ref={box}
        className={`group relative h-48 w-full overflow-hidden ${fill ? fill.className : "bg-gray-100"}`}
        style={fill?.style}
        data-testid="page-cover"
        data-cover-color={fill ? cover.toLowerCase() : undefined}
      >
        {fill ? null : url ? (
          <img
            src={url}
            alt=""
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
                onPick={onColor}
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
  // The picker stays open, so colours can be tried one after another; Escape or a press outside
  // closes it. The preview stays until the page has the colour, so the cover does not flash back.
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
          onPick={setCover}
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
