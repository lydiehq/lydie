import { useEffect, useMemo, useRef, useState } from "react";
import {
  Autocomplete,
  Collection,
  Header,
  ListBox,
  ListBoxItem,
  ListBoxSection,
  Radio,
  RadioGroup,
  Tab,
  TabList,
  TabPanel,
  Tabs,
  Virtualizer,
} from "react-aria-components";
import type { Key } from "react-aria-components";

import { loadEmoji, searchEmoji } from "../emoji/emoji";
import type { Emoji, EmojiGroup } from "../emoji/emoji";
import { DoodleIcon } from "../identity/Doodle";
import { DOODLE_COLORS, doodleIcon, DOODLES, parseDoodleIcon } from "../identity/doodles";
import type { Doodle, DoodleColor } from "../identity/doodles";
import { Button } from "./Button";
import { SearchField } from "./SearchField";
import { SectionedGridLayout } from "./sectioned-grid-layout";
import { focusRingClass } from "./utils";

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

// One cell of the grid: an emoji or a doodle. `id` is unique in the list (a suggested emoji is
// also in its group, so it has its own); `icon` is what picking it gives.
type Cell = { id: string; name: string } & (
  | { kind: "emoji"; emoji: string }
  | { kind: "doodle"; doodle: Doodle }
);
type Section = { id: string; title: string | null; cells: Cell[] };

// The list scrolls; the virtualizer places sections, titles and cells (SectionedGridLayout: eight
// columns of 36 px cells under a 28 px title per section) and renders those in view, so the
// emoji tab mounts a few rows, not two thousand cells.
const GRID = { columns: 8, cellSize: 36, headerHeight: 28 };
const listClass = "min-h-0 flex-1 overflow-y-auto overscroll-contain outline-none";
const titleClass = "flex items-center px-1 text-xs font-medium text-gray-500";
// Focus stays in the search field (virtual focus): the cell it points at shows the ring.
const cellClass =
  "flex cursor-default items-center justify-center rounded-md outline-none hover:bg-gray-950/5 selected:bg-gray-950/10 data-focus-visible:ring-2 data-focus-visible:ring-blue-600 data-focus-visible:ring-inset";
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

const doodleCells = (list: readonly Doodle[]): Cell[] =>
  list.map((doodle) => ({ kind: "doodle", id: `doodle:${doodle.id}`, name: doodle.name, doodle }));
const emojiCells = (list: readonly Emoji[], prefix = ""): Cell[] =>
  list.map((e) => ({ kind: "emoji", id: `${prefix}${e.emoji}`, name: e.name, emoji: e.emoji }));

// Picks an icon: one of our doodles in a colour, or any emoji. One search covers both; nothing
// but what is in the lists can be chosen. React Aria's Autocomplete over a grid ListBox: focus
// stays in the search while the arrow keys move through the cells, Enter takes the one they are
// on (after typing, the first match), Escape clears the search and then closes the popover.
export function IconPicker({ value, onPick, onRecolor, onRemove, suggested }: IconPickerProps) {
  const current = parseDoodleIcon(value);
  const [tab, setTab] = useState<TabId>(value && !current ? "emoji" : "doodles");
  const [query, setQuery] = useState("");
  const [color, setColor] = useState<DoodleColor>(current?.color ?? "gray");
  const [groups, setGroups] = useState<EmojiGroup[] | null>(null);
  const list = useRef<HTMLDivElement>(null);
  const [layout] = useState(() => new SectionedGridLayout());

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
    if (list.current) list.current.scrollTop = 0;
  }, [query, tab]);

  const searching = query.trim() !== "";
  const names = useMemo(() => {
    const out = new Map<string, string>();
    for (const group of groups ?? []) for (const e of group.emojis) out.set(bare(e.emoji), e.name);
    return out;
  }, [groups]);
  const sections = useMemo((): Section[] => {
    if (searching) {
      const parts: Section[] = [];
      const doodles = searchDoodles(query);
      const found = groups ? searchEmoji(groups, query) : [];
      if (doodles.length > 0)
        parts.push({ id: "doodles", title: "Doodles", cells: doodleCells(doodles) });
      if (found.length > 0) parts.push({ id: "emoji", title: "Emoji", cells: emojiCells(found) });
      // The open tab's kind first.
      return tab === "emoji" ? parts.reverse() : parts;
    }
    if (tab === "doodles") return [{ id: "doodles", title: null, cells: doodleCells(DOODLES) }];
    const out: Section[] = [];
    if (suggested && suggested.length > 0) {
      const emojis = suggested.map((emoji) => ({
        emoji,
        name: names.get(bare(emoji)) ?? emoji,
        tags: "",
      }));
      out.push({ id: "suggested", title: "Suggested", cells: emojiCells(emojis, "suggested:") });
    }
    for (const group of groups ?? []) {
      out.push({ id: `group:${group.name}`, title: group.name, cells: emojiCells(group.emojis) });
    }
    return out;
  }, [searching, query, tab, groups, names, suggested]);

  const iconOf = (cell: Cell) =>
    cell.kind === "doodle" ? doodleIcon(cell.doodle.id, color) : cell.emoji;
  const cells = useMemo(
    () => new Map(sections.flatMap((s) => s.cells.map((c) => [c.id, c]))),
    [sections],
  );
  // The icon now, wherever it shows (an emoji can be in Suggested and in its group).
  const selected = useMemo(() => {
    const chosen = value && !current ? bare(value) : null;
    const out: Key[] = [];
    for (const cell of cells.values()) {
      if (
        cell.kind === "doodle" ? cell.doodle.id === current?.doodle.id : bare(cell.emoji) === chosen
      )
        out.push(cell.id);
    }
    return out;
  }, [cells, value, current]);

  const renderCell = (cell: Cell) => (
    <ListBoxItem id={cell.id} textValue={cell.name} aria-label={cell.name} className={cellClass}>
      {/* The name on hover too. */}
      <span title={cell.name} className="flex size-full items-center justify-center">
        {cell.kind === "emoji" ? (
          <span className="text-[22px] leading-none">{cell.emoji}</span>
        ) : (
          <DoodleIcon doodle={cell.doodle} color={color} size={24} />
        )}
      </span>
    </ListBoxItem>
  );

  // Sections out of view are not rendered: their place comes from the layout.
  const jumpTo = (group: string) => {
    const top = layout.getLayoutInfo(`group:${group}`)?.rect.y;
    if (top !== undefined && list.current) list.current.scrollTop = top;
  };

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
      <Autocomplete inputValue={query} onInputChange={setQuery}>
        <SearchField
          size="sm"
          aria-label="Search icons"
          placeholder={tab === "doodles" ? "Search doodles and emoji" : "Search emoji and doodles"}
          autoFocus
        />
        <TabPanel id={tab} className="flex h-[324px] flex-col gap-1 outline-none">
          {tab === "doodles" && !searching && (
            <RadioGroup
              aria-label="Colour"
              orientation="horizontal"
              value={color}
              onChange={(next) => {
                const name = next as DoodleColor;
                setColor(name);
                if (current && current.color !== name)
                  onRecolor?.(doodleIcon(current.doodle.id, name));
              }}
              className="flex h-7 shrink-0 items-center gap-2 px-2"
            >
              {COLOR_NAMES.map((name) => (
                <Radio
                  key={name}
                  value={name}
                  aria-label={`Colour ${name}`}
                  className={`size-5 rounded-full bg-current outline-offset-2 selected:outline-2 selected:outline-gray-800 data-focus-visible:outline-2 data-focus-visible:outline-blue-600 ${DOODLE_COLORS[name]}`}
                />
              ))}
            </RadioGroup>
          )}
          <Virtualizer layout={layout} layoutOptions={GRID}>
            <ListBox
              ref={list}
              aria-label={searching ? "Doodles and emoji" : tab === "doodles" ? "Doodles" : "Emoji"}
              layout="grid"
              selectionMode="single"
              selectedKeys={selected}
              // Picking the icon it already is deselects it in the list: still a pick (the host closes).
              onSelectionChange={(keys) => {
                if (keys === "all") return;
                const [key] = keys;
                const cell =
                  key === undefined ? cells.get(String(selected[0])) : cells.get(String(key));
                if (cell) onPick(iconOf(cell));
              }}
              items={sections}
              renderEmptyState={() => (
                <p className="px-1 py-6 text-center text-sm text-gray-500">
                  {groups || tab === "doodles" ? "No doodle or emoji matches." : "Loading emoji…"}
                </p>
              )}
              className={listClass}
            >
              {(section) =>
                section.title === null ? (
                  <ListBoxSection id={section.id} aria-label="Doodles">
                    <Collection items={section.cells}>{renderCell}</Collection>
                  </ListBoxSection>
                ) : (
                  <ListBoxSection id={section.id}>
                    <Header className={titleClass}>{section.title}</Header>
                    <Collection items={section.cells}>{renderCell}</Collection>
                  </ListBoxSection>
                )
              }
            </ListBox>
          </Virtualizer>
          {tab === "emoji" && !searching && groups && (
            <div className="-mx-2 -mb-2 flex shrink-0 justify-between border-t border-gray-950/8 px-2 py-1">
              {groups.map((group) => (
                <Button
                  key={group.name}
                  size="icon-sm"
                  variant="ghost"
                  aria-label={group.name}
                  onPress={() => jumpTo(group.name)}
                  className="text-[15px] leading-none opacity-60 grayscale hover:opacity-100 hover:grayscale-0"
                >
                  {GROUP_MARKS[group.name] ?? group.emojis[0]?.emoji}
                </Button>
              ))}
            </div>
          )}
        </TabPanel>
      </Autocomplete>
    </Tabs>
  );
}
