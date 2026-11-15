// Page icons and covers, stored as frontmatter properties (see `PAGE_ICON_KEY` in the plugin API)
// so files stay portable: `icon: 🚀`, `cover: banner.png` (an attachment), an https URL or a
// colour (`cover: blue`), and `cover-position: 0–100` for images. Changes are `doc.setProperties` operations, so Mod+Z undoes them.
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
  useApp,
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

async function pickImage(): Promise<File | null> {
  return new Promise((resolve) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "image/*";
    input.addEventListener("change", () => resolve(input.files?.[0] ?? null));
    input.addEventListener("cancel", () => resolve(null));
    input.click();
  });
}

export async function uploadCover(app: AppApi, docId: string, file: File) {
  const attachment = await app.backend.attachments.add(
    {
      workspaceId: app.workspace.workspaceId,
      documentId: docId,
      filename: file.name,
      contentType: file.type || "image/png",
      data: new Uint8Array(await file.arrayBuffer()),
    },
    { scope: app.historyScope() },
  );
  await app.backend.ops.doc.setProperties(
    { id: docId, set: { [PAGE_COVER_KEY]: attachment.filename, [PAGE_COVER_POSITION_KEY]: 50 } },
    { scope: app.historyScope(), label: "Add cover" },
  );
}

// The shared popover, anchored to the element the old inline popovers sat under (or above), so
// they open where they did. It closes on Escape and on a press outside, and returns focus.
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

// Focus starts on the first choice, or the URL field, as the inline popovers did for the grids.
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
  const app = useApp();
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
            <Button
              size="xs"
              variant="secondary"
              onPress={() => void pickImage().then((file) => file && uploadCover(app, docId, file))}
            >
              {fill ? "Use an image" : "Change cover"}
            </Button>
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
  const app = useApp();
  const ops = useOps();
  const properties = useQuerySelect(
    "doc.get",
    { id: docId },
    (s) => s.data[0]?.document.properties ?? null,
  );
  const [picking, setPicking] = useState(false);
  const [urlMode, setUrlMode] = useState(false);
  const [colorMode, setColorMode] = useState(false);
  const iconAnchor = useRef<HTMLDivElement>(null);
  const actions = useRef<HTMLDivElement>(null);
  if (!properties) return null;
  const icon = pageIconOf(properties);
  const decor = pageCoverOf(properties);
  const column = pageColumnClass(pageFullWidthOf(properties));
  const cover = decor?.cover ?? null;
  const position = decor?.position ?? 50;
  const setIcon = (value: string | null) => {
    setPicking(false);
    void ops.doc.setProperties(
      value
        ? { id: docId, set: { [PAGE_ICON_KEY]: value } }
        : { id: docId, unset: [PAGE_ICON_KEY] },
      { label: value ? "Set page icon" : "Remove page icon" },
    );
  };
  return (
    <div className="flex flex-col" data-testid="page-decor">
      {cover && <Cover docId={docId} cover={cover} position={position} />}
      <div className={`group flex flex-col gap-1 ${column} ${cover ? "-mb-8" : "-mb-10 pt-6"}`}>
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
            <IconPicker
              anchor={iconAnchor}
              isOpen={picking}
              onPick={setIcon}
              onRemove={() => setIcon(null)}
              onClose={() => setPicking(false)}
            />
          </div>
        )}
        <div
          ref={actions}
          className="relative flex h-7 gap-1 opacity-0 group-hover:opacity-100 focus-within:opacity-100"
        >
          {!icon && (
            <Button size="xs" variant="ghost" onPress={() => setPicking(!picking)}>
              Add icon
            </Button>
          )}
          {!cover && (
            <Button
              size="xs"
              variant="ghost"
              onPress={() => void pickImage().then((file) => file && uploadCover(app, docId, file))}
            >
              Add cover
            </Button>
          )}
          {!cover && (
            <Button
              size="xs"
              variant="ghost"
              onPress={() => {
                setColorMode(false);
                setUrlMode(!urlMode);
              }}
            >
              Cover from URL
            </Button>
          )}
          {!cover && (
            <Button
              size="xs"
              variant="ghost"
              onPress={() => {
                setUrlMode(false);
                setColorMode(!colorMode);
              }}
            >
              Cover colour
            </Button>
          )}
          {!icon && (
            <IconPicker
              anchor={actions}
              isOpen={picking}
              onPick={setIcon}
              onClose={() => setPicking(false)}
            />
          )}
          {!cover && (
            <ColorPicker
              anchor={actions}
              isOpen={colorMode}
              current={null}
              placement="bottom start"
              onClose={() => setColorMode(false)}
              onPick={(color) => {
                setColorMode(false);
                void ops.doc.setProperties(
                  { id: docId, set: { [PAGE_COVER_KEY]: color } },
                  { label: "Add cover" },
                );
              }}
            />
          )}
          <DecorPopover
            anchor={actions}
            isOpen={urlMode}
            onClose={() => setUrlMode(false)}
            label="Cover from URL"
            placement="bottom start"
          >
            <form
              className="flex w-96 gap-1"
              onSubmit={(e) => {
                e.preventDefault();
                const value = (
                  (new FormData(e.currentTarget).get("url") as string | null) ?? ""
                ).trim();
                if (!isUrl(value)) return;
                setUrlMode(false);
                void ops.doc.setProperties(
                  { id: docId, set: { [PAGE_COVER_KEY]: value, [PAGE_COVER_POSITION_KEY]: 50 } },
                  { label: "Add cover" },
                );
              }}
            >
              <Input size="sm" name="url" aria-label="Cover image URL" placeholder="https://…" />
              <Button size="sm" variant="primary" type="submit">
                Add
              </Button>
            </form>
          </DecorPopover>
        </div>
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
