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
  focusRingInsetClass,
  Input,
  PicRegular,
  Popover,
  WithTooltip,
} from "@lydie/plugin-api/ui";
import { useEffect, useRef, useState } from "react";
import type { ReactNode, RefObject } from "react";

const EMOJIS = [
  "📄",
  "📝",
  "📌",
  "📎",
  "📚",
  "📖",
  "🗂️",
  "🗒️",
  "✅",
  "☑️",
  "⭐",
  "🔥",
  "🚀",
  "💡",
  "🎯",
  "🧭",
  "🧪",
  "🛠️",
  "⚙️",
  "🔒",
  "🌱",
  "🌍",
  "🏠",
  "🏢",
  "💼",
  "💰",
  "📈",
  "📊",
  "🗓️",
  "⏰",
  "✈️",
  "🎨",
  "🎵",
  "🎬",
  "📷",
  "❤️",
  "😀",
  "🤔",
  "👋",
  "🙌",
  "🐛",
  "🧠",
  "🍀",
  "☕",
];

function isUrl(value: string) {
  return /^https?:\/\//i.test(value);
}

// "Set icon" and "Set cover" live in the page's menu and the palette, while the pickers open on
// the page: the request waits here until that page's decor takes it.
type Picker = "icon" | "cover";
let requested: { docId: string; picker: Picker } | null = null;
const takers = new Set<() => void>();

function openPicker(app: AppApi, docId: string, picker: Picker) {
  requested = { docId, picker };
  for (const take of takers) take();
  // Not on screen (the sidebar's row menu): open the page, whose decor takes the request.
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
        <FocusFirst>{children}</FocusFirst>
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

function IconPicker({
  anchor,
  isOpen,
  onPick,
  onRemove,
  onClose,
}: {
  anchor: RefObject<HTMLElement | null>;
  isOpen: boolean;
  onPick: (icon: string) => void;
  onRemove?: () => void;
  onClose: () => void;
}) {
  const [custom, setCustom] = useState("");
  return (
    <DecorPopover
      anchor={anchor}
      isOpen={isOpen}
      onClose={onClose}
      label="Choose an icon"
      placement="bottom start"
      className="flex w-72 flex-col gap-2"
    >
      <div className="grid grid-cols-8 gap-0.5">
        {EMOJIS.map((emoji) => (
          // Plain grid cells, not Buttons: a Button's padding and height scale would not fit 8 across.
          <button
            key={emoji}
            type="button"
            aria-label={`Icon ${emoji}`}
            onClick={() => onPick(emoji)}
            className={`rounded-md p-1 text-lg hover:bg-gray-950/5 ${focusRingInsetClass}`}
          >
            {emoji}
          </button>
        ))}
      </div>
      <form
        className="flex gap-1"
        onSubmit={(e) => {
          e.preventDefault();
          if (custom.trim()) onPick(custom.trim().slice(0, 8));
        }}
      >
        <Input
          size="sm"
          aria-label="Any emoji"
          value={custom}
          onChange={(e) => setCustom(e.target.value)}
          placeholder="Or type/paste any emoji"
        />
        {onRemove && (
          <Button size="sm" variant="ghost" onPress={onRemove}>
            Remove
          </Button>
        )}
      </form>
    </DecorPopover>
  );
}

const COLOR_NAMES = Object.keys(COVER_COLORS) as CoverColor[];

function ColorPicker({
  anchor,
  isOpen,
  current,
  onPick,
  onClose,
  placement,
}: {
  anchor: RefObject<HTMLElement | null>;
  isOpen: boolean;
  current: string | null;
  onPick: (color: CoverColor) => void;
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
      {COLOR_NAMES.map((color) => (
        <button
          key={color}
          type="button"
          aria-label={`Cover colour ${color}`}
          aria-pressed={current === color}
          onClick={() => onPick(color)}
          className={`size-6 rounded-full ring-1 ring-inset ${current === color ? "ring-gray-950/60" : "ring-gray-950/10"} ${COVER_COLORS[color]} ${focusRingClass}`}
        />
      ))}
    </DecorPopover>
  );
}

function Cover({ docId, cover, position }: { docId: string; cover: string; position: number }) {
  const ops = useOps();
  const url = useCoverUrl(cover);
  const fill = coverFillOf(cover);
  const [dragging, setDragging] = useState<number | null>(null);
  const [coloring, setColoring] = useState(false);
  const start = useRef<{ y: number; pos: number } | null>(null);
  const actions = useRef<HTMLDivElement>(null);
  const shown = dragging ?? position;
  return (
    <div
      className={`group relative h-48 w-full shrink-0 overflow-hidden ${fill ? fill.className : "bg-gray-100"}`}
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
              onClose={() => setColoring(false)}
              onPick={(color) => {
                setColoring(false);
                void ops.doc.setProperties(
                  {
                    id: docId,
                    set: { [PAGE_COVER_KEY]: color },
                    unset: [PAGE_COVER_POSITION_KEY],
                  },
                  { label: "Change cover" },
                );
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
  const cover = decor?.cover ?? null;
  const position = decor?.position ?? 50;
  const fill = coverFillOf(cover);
  const setIcon = (value: string | null) => {
    setPicking(false);
    void ops.doc.setProperties(
      value
        ? { id: docId, set: { [PAGE_ICON_KEY]: value } }
        : { id: docId, unset: [PAGE_ICON_KEY] },
      { label: value ? "Set page icon" : "Remove page icon" },
    );
  };
  // The buttons sit in the room the page already has above the title, so a page without an icon
  // or a cover is no taller for them.
  const barPlace = icon ? "translate-y-0.5" : cover ? "translate-y-3" : "translate-y-4";
  return (
    <div className="group/decor flex flex-col" data-testid="page-decor">
      {cover && <Cover docId={docId} cover={cover} position={position} />}
      <div className={`${column} ${icon ? (cover ? "-mb-8" : "-mb-4 pt-10") : ""}`}>
        {icon && (
          <div ref={iconAnchor} className={`relative w-fit ${cover ? "-mt-10" : ""}`}>
            <WithTooltip label="Change page icon">
              <button
                type="button"
                aria-label="Change page icon"
                onClick={() => setPicking(!picking)}
                className="rounded-lg px-1 text-5xl leading-tight hover:bg-gray-950/5"
              >
                {icon}
              </button>
            </WithTooltip>
          </div>
        )}
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
        <IconPicker
          anchor={icon ? iconAnchor : bar}
          isOpen={picking}
          onPick={setIcon}
          onRemove={icon ? () => setIcon(null) : undefined}
          onClose={() => setPicking(false)}
        />
        <ColorPicker
          anchor={bar}
          isOpen={coloring}
          current={fill && cover ? cover.toLowerCase() : null}
          placement="bottom start"
          onClose={() => setColoring(false)}
          onPick={(color) => {
            setColoring(false);
            void ops.doc.setProperties(
              { id: docId, set: { [PAGE_COVER_KEY]: color }, unset: [PAGE_COVER_POSITION_KEY] },
              { label: cover ? "Change cover" : "Add cover" },
            );
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
    ctx.documentMenu.register({
      id: "page-decor.setIcon",
      label: "Set icon",
      icon: <EmojiRegular />,
      group: "decor",
      order: 2,
      run: (doc, app) => openPicker(app, doc.id, "icon"),
    });
    ctx.documentMenu.register({
      id: "page-decor.setCover",
      label: "Set cover",
      icon: <PicRegular />,
      group: "decor",
      order: 2,
      run: (doc, app) => openPicker(app, doc.id, "cover"),
    });
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
