// The view toolbar: "Filter", "Display" (sort, group and sub-group, what the view type needs,
// visible properties), search and "New". It stays this short on purpose: a new
// setting goes inside Display. It never wraps: beside it the view tabs scroll.
// Changes to the view are personal until saved (`ViewContext.updateView`); the search is per tab
// and never saved.
import { groupable, sortable, TypeIcon } from "@lydie/plugin-api/databases";
import type { DatabaseProperty, GroupBy, Sort } from "@lydie/plugin-api/databases";
import {
  Button,
  CloseRegular,
  DotsVerticalRegular,
  DownRegular,
  Filter2Regular,
  Input,
  Search2Regular,
  Select,
  SelectItem,
  Settings6Regular,
  Switch,
  UpRegular,
} from "@lydie/plugin-api/ui";
import { useEffect, useRef, useState } from "react";
import type { DragEvent, ReactNode } from "react";

import { useDraft, useViewContext } from "./context.tsx";
import { useFilterUi } from "./filter-ui.tsx";
import { PopoverButton } from "./ui.tsx";
import { allColumns, movedColumns, withColumn } from "./view-model.ts";
import { FilterMenu } from "./ViewChips.tsx";

// Select keys cannot be empty; this one stands for "no property".
const NONE = "__none";

export function Toolbar({
  search,
  onSearch,
  onNew,
}: {
  search: string;
  onSearch: (q: string) => void;
  onNew: () => void;
}) {
  const ui = useFilterUi();
  return (
    <div
      role="toolbar"
      aria-label="View settings"
      className="flex shrink-0 items-center gap-0.5 pb-1.5"
    >
      <PopoverButton
        label="Filter"
        button={
          <>
            <Filter2Regular aria-hidden />
            Filter
          </>
        }
        size="sm"
        isOpen={ui.menuOpen}
        onOpenChange={ui.setMenuOpen}
      >
        {(close) => <FilterMenu close={close} />}
      </PopoverButton>
      <PopoverButton
        label="Display"
        button={
          <>
            <Settings6Regular aria-hidden />
            Display
          </>
        }
        size="sm"
        placement="bottom end"
      >
        {() => <DisplayMenu />}
      </PopoverButton>
      <Search search={search} onSearch={onSearch} />
      <NewButton onNew={onNew} />
    </div>
  );
}

// A magnifier until used: the field shows while it has focus or a query. The field stays mounted
// and its box grows out of the magnifier (and shrinks back into it), the glyph staying put.
function Search({ search, onSearch }: { search: string; onSearch: (q: string) => void }) {
  const [open, setOpen] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const expanded = open || search !== "";
  useEffect(() => {
    if (open) input.current?.focus();
  }, [open]);
  return (
    <div
      className={`relative flex h-7.5 flex-none items-center transition-[width] duration-200 ease-out-strong motion-reduce:transition-none ${expanded ? "w-40" : "w-7.5"}`}
    >
      {/* An sm field among the toolbar's sm buttons, so the toolbar keeps its height while searching. */}
      <Input
        ref={input}
        size="sm"
        type="search"
        aria-label="Search this view"
        placeholder="Search…"
        value={search}
        onChange={(event) => onSearch(event.target.value)}
        onBlur={() => setOpen(false)}
        onKeyDown={(event) => {
          if (event.key !== "Escape") return;
          onSearch("");
          setOpen(false);
        }}
        className={`w-full pl-7 transition-[opacity,visibility] duration-150 motion-reduce:transition-none ${expanded ? "" : "invisible opacity-0"}`}
      />
      {expanded ? (
        <Search2Regular
          aria-hidden
          className="pointer-events-none absolute left-[7px] size-4 text-gray-500"
        />
      ) : (
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label="Search this view"
          className="absolute inset-0 text-gray-500"
          onPress={() => setOpen(true)}
        >
          <Search2Regular aria-hidden />
        </Button>
      )}
    </div>
  );
}

function DisplayMenu() {
  const { definition, view } = useViewContext();
  const hidden = allColumns(definition, view).filter((c) => !c.visible).length;
  return (
    <div className="flex w-96 flex-col divide-y divide-gray-100" data-testid="display-menu">
      <DisplaySection title="Sort">
        <SortMenu />
      </DisplaySection>
      <DisplaySection title="Group">
        <GroupMenu />
      </DisplaySection>
      <ViewSettings />
      <DisplaySection title={hidden ? `Properties · ${hidden} hidden` : "Properties"}>
        <PropertiesMenu />
      </DisplaySection>
    </div>
  );
}

function DisplaySection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section aria-label={title} className="flex flex-col gap-1.5 p-3">
      <h3 className="text-xs font-medium text-gray-500">{title}</h3>
      {children}
    </section>
  );
}

function NewButton({ onNew }: { onNew: () => void }) {
  return (
    <Button size="sm" className="ml-1" onPress={onNew}>
      New
    </Button>
  );
}

// ---- Sort

function SortMenu() {
  const { definition, view, updateView } = useViewContext();
  const [sorts, setSorts] = useDraft(view.config.sorts);
  const candidates = definition.properties.filter((p) => sortable(p.type));
  const save = (next: Sort[]) => {
    setSorts(next);
    updateView({ sorts: next }, { label: "Change sort" });
  };
  const unused = candidates.find((p) => !sorts.some((s) => s.propertyId === p.id));
  return (
    <div className="flex flex-col gap-2" data-testid="sort-menu">
      {sorts.map((sort, i) => (
        <div key={`${sort.propertyId}-${i}`} className="flex items-center gap-1">
          <Select
            size="sm"
            aria-label="Sort by"
            className="min-w-0 flex-1"
            selectedKey={sort.propertyId}
            onSelectionChange={(key) =>
              save(sorts.map((s, j) => (j === i ? { ...s, propertyId: String(key) } : s)))
            }
          >
            {candidates.map((p) => (
              <SelectItem key={p.id} id={p.id}>
                {p.name}
              </SelectItem>
            ))}
          </Select>
          <Select
            size="sm"
            aria-label="Direction"
            className="min-w-0 flex-1"
            selectedKey={sort.direction}
            onSelectionChange={(key) =>
              save(sorts.map((s, j) => (j === i ? { ...s, direction: key as "asc" | "desc" } : s)))
            }
          >
            <SelectItem id="asc">Ascending</SelectItem>
            <SelectItem id="desc">Descending</SelectItem>
          </Select>
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label="Move sort up"
            isDisabled={i === 0}
            onPress={() => {
              const next = [...sorts];
              [next[i - 1], next[i]] = [next[i]!, next[i - 1]!];
              save(next);
            }}
            className="text-gray-500"
          >
            <UpRegular aria-hidden />
          </Button>
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label="Remove sort"
            onPress={() => save(sorts.filter((_, j) => j !== i))}
            className="text-gray-500"
          >
            <CloseRegular aria-hidden />
          </Button>
        </div>
      ))}
      {unused && (
        <Button
          variant="ghost"
          size="sm"
          onPress={() => save([...sorts, { propertyId: unused.id, direction: "asc" }])}
          className="-ml-2 self-start"
        >
          + Add sort
        </Button>
      )}
    </div>
  );
}

// ---- Group (and sub-group on boards)

function GroupMenu() {
  const { definition, view, updateView } = useViewContext();
  const candidates = definition.properties.filter(
    (p) => groupable(p.type) && p.type !== "title" && p.type !== "formula",
  );
  return (
    <div className="flex flex-col gap-2" data-testid="group-menu">
      <GroupPicker
        label={view.type === "board" ? "Columns by" : "Group by"}
        value={view.config.groupBy}
        candidates={candidates}
        allowNone={view.type !== "board"}
        onChange={(groupBy) => updateView({ groupBy }, { label: "Change grouping" })}
      />
      {view.type === "board" && (
        <GroupPicker
          label="Sub-group by"
          value={view.config.subGroupBy}
          candidates={candidates.filter((p) => p.id !== view.config.groupBy?.propertyId)}
          allowNone
          onChange={(subGroupBy) => updateView({ subGroupBy }, { label: "Change sub-grouping" })}
        />
      )}
    </div>
  );
}

function GroupPicker({
  label,
  value,
  candidates,
  allowNone,
  onChange,
}: {
  label: string;
  value: GroupBy | null;
  candidates: readonly DatabaseProperty[];
  allowNone: boolean;
  onChange: (value: GroupBy | null) => void;
}) {
  const property = candidates.find((p) => p.id === value?.propertyId);
  return (
    <div className="flex flex-col gap-1">
      <SettingRow label={label}>
        <Select
          size="sm"
          aria-label={label}
          placeholder="Choose…"
          selectedKey={value?.propertyId ?? (allowNone ? NONE : null)}
          onSelectionChange={(key) =>
            onChange(key && key !== NONE ? { propertyId: String(key), direction: "asc" } : null)
          }
        >
          {[
            ...(allowNone
              ? [
                  <SelectItem key={NONE} id={NONE}>
                    None
                  </SelectItem>,
                ]
              : []),
            ...candidates.map((p) => (
              <SelectItem key={p.id} id={p.id}>
                {p.name}
              </SelectItem>
            )),
          ]}
        </Select>
      </SettingRow>
      {value && property && (
        <>
          {(property.type === "date" ||
            property.type === "createdTime" ||
            property.type === "updatedTime") && (
            <SettingRow label="Date grouping">
              <Select
                size="sm"
                aria-label="Date grouping"
                selectedKey={value.dateBucket ?? "month"}
                onSelectionChange={(key) =>
                  onChange({ ...value, dateBucket: key as GroupBy["dateBucket"] })
                }
              >
                <SelectItem id="day">Day</SelectItem>
                <SelectItem id="week">Week</SelectItem>
                <SelectItem id="month">Month</SelectItem>
                <SelectItem id="year">Year</SelectItem>
              </Select>
            </SettingRow>
          )}
          <SettingRow label="Order">
            <Select
              size="sm"
              aria-label="Group order"
              selectedKey={value.direction}
              onSelectionChange={(key) => onChange({ ...value, direction: key as "asc" | "desc" })}
            >
              <SelectItem id="asc">Ascending</SelectItem>
              <SelectItem id="desc">Descending</SelectItem>
            </Select>
          </SettingRow>
          <Switch
            isSelected={value.hideEmpty ?? false}
            onChange={(hideEmpty) => onChange({ ...value, hideEmpty })}
          >
            Hide empty groups
          </Switch>
        </>
      )}
    </div>
  );
}

// A setting's name on the left, its control on the right. The control carries the accessible name
// (`aria-label`); the text is what the eye reads.
function SettingRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-2 text-sm text-gray-800">
      <span aria-hidden>{label}</span>
      {children}
    </div>
  );
}

// ---- Visible properties, in order

const COLUMN_MIME = "application/x-lydie-db-column";

function PropertiesMenu() {
  const { definition, view, updateView } = useViewContext();
  const columns = allColumns(definition, view);
  const [over, setOver] = useState<string | null>(null);
  const drop = (event: DragEvent, beforeId: string | null) => {
    const id = event.dataTransfer.getData(COLUMN_MIME);
    setOver(null);
    if (!id || id === beforeId) return;
    event.preventDefault();
    updateView({ columns: movedColumns(columns, id, beforeId) }, { label: "Reorder properties" });
  };
  return (
    <div className="-mx-2 flex flex-col" data-testid="properties-menu">
      <ul aria-label="Properties in this view">
        {columns.map((column) => (
          <li
            key={column.property.id}
            draggable
            onDragStart={(event) => event.dataTransfer.setData(COLUMN_MIME, column.property.id)}
            onDragOver={(event) => {
              if (!event.dataTransfer.types.includes(COLUMN_MIME)) return;
              event.preventDefault();
              setOver(column.property.id);
            }}
            onDragLeave={() => setOver(null)}
            onDrop={(event) => drop(event, column.property.id)}
            className={`group/property flex items-center gap-2 rounded-md px-2 py-1 text-sm hover:bg-gray-950/5 ${over === column.property.id ? "shadow-[inset_0_2px_0_var(--color-blue-500)]" : ""}`}
          >
            <DotsVerticalRegular
              aria-hidden
              className="size-3.5 rotate-90 cursor-grab text-gray-400"
            />
            <TypeIcon
              type={column.property.type}
              aria-hidden
              className="size-3.5 shrink-0 text-gray-500"
            />
            <span className="min-w-0 flex-1 truncate">{column.property.name}</span>
            <MoveButtons columns={columns} id={column.property.id} />
            <Switch
              aria-label={`Show ${column.property.name}`}
              isSelected={column.visible}
              isDisabled={column.property.type === "title"}
              onChange={(visible) =>
                updateView(
                  { columns: withColumn(columns, column.property.id, { visible }) },
                  { label: visible ? "Show property" : "Hide property" },
                )
              }
            />
          </li>
        ))}
      </ul>
    </div>
  );
}

// Keyboard reordering (drag is pointer-only).
function MoveButtons({ columns, id }: { columns: ReturnType<typeof allColumns>; id: string }) {
  const { updateView } = useViewContext();
  const index = columns.findIndex((c) => c.property.id === id);
  return (
    <span className="flex opacity-0 group-focus-within/property:opacity-100">
      <Button
        variant="ghost"
        size="icon-xs"
        aria-label="Move up"
        isDisabled={index <= 0}
        onPress={() =>
          updateView(
            { columns: movedColumns(columns, id, columns[index - 1]!.property.id) },
            { label: "Reorder properties" },
          )
        }
        className="text-gray-500"
      >
        <UpRegular aria-hidden />
      </Button>
      <Button
        variant="ghost"
        size="icon-xs"
        aria-label="Move down"
        isDisabled={index === columns.length - 1}
        onPress={() =>
          updateView(
            { columns: movedColumns(columns, id, columns[index + 2]?.property.id ?? null) },
            { label: "Reorder properties" },
          )
        }
        className="text-gray-500"
      >
        <DownRegular aria-hidden />
      </Button>
    </span>
  );
}

// ---- What only some view types have

function ViewSettings() {
  const { view } = useViewContext();
  if (view.type === "calendar") return <CalendarSettings />;
  if (view.type === "board") return <CardSettings />;
  return null;
}

function CardSettings() {
  const { definition, view, updateView } = useViewContext();
  const cover = view.config.layout.cover;
  const files = definition.properties.filter((p) => p.type === "files");
  const value = !cover ? NONE : cover.type === "pageContent" ? "page" : cover.propertyId;
  return (
    <DisplaySection title="Cards">
      <SettingRow label="Card preview">
        <Select
          size="sm"
          aria-label="Card preview"
          selectedKey={value}
          onSelectionChange={(key) => {
            const v = String(key);
            updateView(
              {
                layout: {
                  ...view.config.layout,
                  cover:
                    v === NONE
                      ? null
                      : v === "page"
                        ? { type: "pageContent" }
                        : { type: "property", propertyId: v },
                },
              },
              { label: "Card preview" },
            );
          }}
        >
          {[
            <SelectItem key={NONE} id={NONE}>
              None
            </SelectItem>,
            <SelectItem key="page" id="page">
              Page content
            </SelectItem>,
            ...files.map((p) => (
              <SelectItem key={p.id} id={p.id}>
                {p.name}
              </SelectItem>
            )),
          ]}
        </Select>
      </SettingRow>
    </DisplaySection>
  );
}

function CalendarSettings() {
  const { definition, view, updateView } = useViewContext();
  const dates = definition.properties.filter((p) => p.type === "date");
  const layout = view.config.layout;
  return (
    <DisplaySection title="Calendar">
      <SettingRow label="Show by">
        <Select
          size="sm"
          aria-label="Calendar date property"
          selectedKey={layout.calendarPropertyId ?? dates[0]?.id ?? null}
          onSelectionChange={(key) =>
            updateView(
              { layout: { ...layout, calendarPropertyId: String(key) } },
              { label: "Calendar date" },
            )
          }
        >
          {dates.map((p) => (
            <SelectItem key={p.id} id={p.id}>
              {p.name}
            </SelectItem>
          ))}
        </Select>
      </SettingRow>
      <Switch
        isSelected={layout.showWeekends ?? true}
        onChange={(showWeekends) =>
          updateView({ layout: { ...layout, showWeekends } }, { label: "Show weekends" })
        }
      >
        Show weekends
      </Switch>
    </DisplaySection>
  );
}
