import { useEffect, useMemo, useRef, useState } from "react";
import type { KeyboardEvent, ReactNode } from "react";
import { Tab, TabList, TabPanel, Tabs } from "react-aria-components";

import { loadEmoji, searchEmoji } from "../emoji/emoji";
import type { Emoji, EmojiGroup } from "../emoji/emoji";
import { DoodleIcon } from "../identity/Doodle";
import { DOODLE_COLORS, doodleIcon, DOODLES, parseDoodleIcon } from "../identity/doodles";
import type { Doodle, DoodleColor } from "../identity/doodles";
import { Button } from "./Button";
import { SearchField } from "./SearchField";
import { WithTooltip } from "./Tooltip";
import { focusRingClass, focusRingInsetClass } from "./utils";

export type IconPickerProps = {
  // The icon now: an emoji, a doodle (`doodle:star:blue`) or none.
  value?: string | null | undefined;
  // Something was chosen: the host sets it and closes the picker.
  onPick: (icon: string) => void;
  // The doodle that is the icon now, in another colour. The picker stays open.
  onRecolor?: ((icon: string) => void) | undefined;
  // Shows "Remove".
  onRemove?: (() => void) | undefined;
  // Emoji offered first on the emoji tab.
  suggested?: readonly string[] | undefined;
};

type TabId = "doodles" | "emoji";

const COLUMNS = "grid grid-cols-8";
// `scroll-mt`: a cell reached with the keyboard is not left under a sticky section title.
const cellClass = `flex size-9 scroll-mt-7 items-center justify-center rounded-md hover:bg-gray-950/5 aria-pressed:bg-gray-950/10 ${focusRingInsetClass}`;
const titleClass = "sticky top-0 z-10 bg-elevated px-1 py-1.5 text-xs font-medium text-gray-500";
const tabClass = `cursor-default rounded-md px-2 py-1 text-[13px] font-medium text-gray-500 hover:text-gray-800 selected:bg-gray-950/5 selected:text-gray-900 ${focusRingClass}`;

const COLOR_NAMES = Object.keys(DOODLE_COLORS) as DoodleColor[];

// One emoji standing for each group, on the buttons that jump to it.
const GROUP_MARKS: Record<string, string> = {
  "Smileys and people": "😀",
  "Animals and nature": "🐻",
  "Food and drink": "🍎",
  "Travel and places": "✈️",
  Activities: "⚽",
  Objects: "💡",
  Symbols: "💛",
  Flags: "🏁",
};

const bare = (text: string) => text.replaceAll("️", "");

function searchDoodles(query: string): Doodle[] {
  const words = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  if (words.length === 0) return DOODLES;
  return DOODLES.filter((doodle) => {
    const text = ` ${doodle.name} ${doodle.id} ${doodle.keywords}`.toLowerCase();
    return words.every((word) => text.includes(` ${word}`));
  });
}

// Arrow keys move between the cells as they are laid out, across sections; up from the top row
// goes back to the search field.
function moveBetweenCells(event: KeyboardEvent<HTMLElement>, leave: () => void) {
  const { key } = event;
  if (key !== "ArrowLeft" && key !== "ArrowRight" && key !== "ArrowUp" && key !== "ArrowDown")
    return;
  const current = (event.target as HTMLElement).closest<HTMLElement>("[data-cell]");
  if (!current) return;
  const cells = [...event.currentTarget.querySelectorAll<HTMLElement>("[data-cell]")];
  const index = cells.indexOf(current);
  let next: HTMLElement | undefined;
  if (key === "ArrowLeft") next = cells[index - 1];
  else if (key === "ArrowRight") next = cells[index + 1];
  else {
    // The cell of the next row that is nearest in the line.
    const from = current.getBoundingClientRect();
    const step = key === "ArrowDown" ? 1 : -1;
    let row: number | null = null;
    let distance = Infinity;
    for (let i = index + step; i >= 0 && i < cells.length; i += step) {
      const box = cells[i]!.getBoundingClientRect();
      if (Math.abs(box.top - from.top) < 2) continue;
      if (row === null) row = box.top;
      else if (Math.abs(box.top - row) > 2) break;
      if (Math.abs(box.left - from.left) < distance) {
        distance = Math.abs(box.left - from.left);
        next = cells[i];
      }
    }
    if (!next && key === "ArrowUp") {
      event.preventDefault();
      leave();
      return;
    }
  }
  if (!next) return;
  event.preventDefault();
  next.focus();
}

// Picks an icon: one of our doodles in a colour, or any emoji. One search covers both; nothing
// but what is in the lists can be chosen.
export function IconPicker({ value, onPick, onRecolor, onRemove, suggested }: IconPickerProps) {
  const current = parseDoodleIcon(value);
  const [tab, setTab] = useState<TabId>(value && !current ? "emoji" : "doodles");
  const [query, setQuery] = useState("");
  const [color, setColor] = useState<DoodleColor>(current?.color ?? "gray");
  const [groups, setGroups] = useState<EmojiGroup[] | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const scroller = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let live = true;
    void loadEmoji().then((loaded) => {
      if (live) setGroups(loaded);
    });
    return () => {
      live = false;
    };
  }, []);
  // A new search or tab starts at the top.
  useEffect(() => {
    if (scroller.current) scroller.current.scrollTop = 0;
  }, [query, tab]);

  const searching = query.trim() !== "";
  const doodles = useMemo(() => searchDoodles(query), [query]);
  const found = useMemo(() => (groups ? searchEmoji(groups, query) : []), [groups, query]);
  const names = useMemo(() => {
    const out = new Map<string, string>();
    for (const group of groups ?? []) for (const e of group.emojis) out.set(bare(e.emoji), e.name);
    return out;
  }, [groups]);
  const chosenEmoji = value && !current ? bare(value) : null;

  const emojiCells = (emojis: readonly Emoji[]) => (
    <div className={COLUMNS}>
      {emojis.map((e) => (
        <button
          key={e.emoji}
          type="button"
          data-cell=""
          title={e.name}
          aria-label={e.name}
          aria-pressed={chosenEmoji === bare(e.emoji) || undefined}
          onClick={() => onPick(e.emoji)}
          className={`${cellClass} text-[22px] leading-none`}
        >
          {e.emoji}
        </button>
      ))}
    </div>
  );
  const doodleCells = (list: readonly Doodle[]) => (
    <div className={COLUMNS}>
      {list.map((doodle) => (
        <WithTooltip key={doodle.id} label={doodle.name}>
          <button
            type="button"
            data-cell=""
            aria-label={doodle.name}
            aria-pressed={current?.doodle.id === doodle.id || undefined}
            onClick={() => onPick(doodleIcon(doodle.id, color))}
            className={cellClass}
          >
            <DoodleIcon doodle={doodle} color={color} size={24} />
          </button>
        </WithTooltip>
      ))}
    </div>
  );
  const section = (title: string, cells: ReactNode) => (
    <section key={title} data-group={title}>
      <h3 className={titleClass}>{title}</h3>
      {cells}
    </section>
  );

  let body: ReactNode;
  if (searching) {
    const parts = [
      doodles.length > 0 && section("Doodles", doodleCells(doodles)),
      found.length > 0 && section("Emoji", emojiCells(found)),
    ];
    if (tab === "emoji") parts.reverse();
    body =
      doodles.length + found.length > 0 ? (
        parts
      ) : (
        <p className="px-1 py-6 text-center text-sm text-gray-500">
          {groups ? "No doodle or emoji matches." : "Loading emoji…"}
        </p>
      );
  } else if (tab === "doodles") {
    body = doodleCells(DOODLES);
  } else {
    body = (
      <>
        {suggested &&
          suggested.length > 0 &&
          section(
            "Suggested",
            emojiCells(
              suggested.map((emoji) => ({
                emoji,
                name: names.get(bare(emoji)) ?? emoji,
                tags: "",
              })),
            ),
          )}
        {groups?.map((group) => section(group.name, emojiCells(group.emojis)))}
      </>
    );
  }

  return (
    <Tabs
      selectedKey={tab}
      onSelectionChange={(key) => setTab(key as TabId)}
      className="flex w-[304px] flex-col gap-2"
      data-testid="icon-picker"
    >
      <div className="flex items-center justify-between gap-2">
        <TabList aria-label="Kind of icon" className="flex gap-0.5">
          <Tab id="doodles" className={tabClass}>
            Doodles
          </Tab>
          <Tab id="emoji" className={tabClass}>
            Emoji
          </Tab>
        </TabList>
        {onRemove && (
          <Button size="xs" variant="ghost" onPress={onRemove}>
            Remove
          </Button>
        )}
      </div>
      <SearchField
        size="sm"
        aria-label="Search icons"
        placeholder={tab === "doodles" ? "Search doodles and emoji" : "Search emoji and doodles"}
        autoFocus
        inputRef={input}
        value={query}
        onChange={setQuery}
        // Enter takes the first match. What was typed is never the icon itself.
        onSubmit={() => {
          if (searching) scroller.current?.querySelector<HTMLElement>("[data-cell]")?.click();
        }}
        onKeyDown={(event) => {
          if (event.key !== "ArrowDown") return;
          const first = scroller.current?.querySelector<HTMLElement>("[data-cell]");
          if (!first) return;
          event.preventDefault();
          first.focus();
        }}
      />
      <TabPanel id={tab} className="flex h-[324px] flex-col gap-1 outline-none">
        {tab === "doodles" && !searching && (
          <fieldset className="flex h-7 shrink-0 items-center gap-2 px-2">
            <legend className="sr-only">Colour</legend>
            {COLOR_NAMES.map((name) => (
              <button
                key={name}
                type="button"
                aria-label={`Colour ${name}`}
                aria-pressed={color === name}
                onClick={() => {
                  setColor(name);
                  if (current && current.color !== name)
                    onRecolor?.(doodleIcon(current.doodle.id, name));
                }}
                className={`size-5 rounded-full bg-current outline-offset-2 outline-gray-800 aria-pressed:outline-2 ${DOODLE_COLORS[name]}`}
              />
            ))}
          </fieldset>
        )}
        <div
          ref={scroller}
          role="presentation"
          onKeyDown={(event) => moveBetweenCells(event, () => input.current?.focus())}
          className="relative min-h-0 flex-1 overflow-y-auto overscroll-contain"
        >
          {body}
        </div>
        {tab === "emoji" && !searching && groups && (
          <div className="-mx-2 -mb-2 flex shrink-0 justify-between border-t border-gray-950/8 px-2 py-1">
            {groups.map((group) => (
              <WithTooltip key={group.name} label={group.name}>
                <button
                  type="button"
                  aria-label={group.name}
                  onClick={() => {
                    const target = scroller.current?.querySelector<HTMLElement>(
                      `[data-group="${group.name}"]`,
                    );
                    if (target && scroller.current) scroller.current.scrollTop = target.offsetTop;
                  }}
                  className={`flex size-7 items-center justify-center rounded-md text-[15px] leading-none opacity-60 grayscale hover:bg-gray-950/5 hover:opacity-100 hover:grayscale-0 ${focusRingInsetClass}`}
                >
                  {GROUP_MARKS[group.name] ?? group.emojis[0]?.emoji}
                </button>
              </WithTooltip>
            ))}
          </div>
        )}
      </TabPanel>
    </Tabs>
  );
}
