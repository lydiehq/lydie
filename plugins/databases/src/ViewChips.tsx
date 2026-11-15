// The row under the toolbar: the view's filters as chips, and "Edited · Save for everyone · Reset"
// at its end while this device's view differs from the saved one. A filter chip reads
// "Property · operator · value"; each part opens its own picker and × removes it. Or-groups and
// nested groups show as one "Advanced filter" chip. Sorting and grouping are not chips: they are
// in the toolbar's Display menu and show in the view itself (a column's arrow, the group lines).
// The toolbar's "Filter" menu (and `F`) adds a filter by property or by a value's name.
import { optionsOf, TypeIcon } from "@lydie/plugin-api/databases";
import type { DatabaseProperty, FilterCondition } from "@lydie/plugin-api/databases";
import {
  AddRegular,
  Button,
  Checkbox,
  CloseRegular,
  dropdownItemStyles,
  focusRingInsetClass,
  TextField,
} from "@lydie/plugin-api/ui";
import { useState } from "react";
import type { ReactNode } from "react";

import {
  addChip,
  chipOperatorOf,
  chipOperators,
  filterChips,
  isMultiValueType,
  removeChip,
  replaceChip,
  valuesOf,
  withChipOperator,
  withValues,
} from "./chips-model.ts";
import type { FilterChip } from "./chips-model.ts";
import { useViewContext } from "./context.tsx";
import { defaultCondition, defaultValue, needsValue, toRoot } from "./filter-model.ts";
import { useFilterUi } from "./filter-ui.tsx";
import { FilterBuilder, ValueInput } from "./FilterBuilder.tsx";
import { MenuButtonItem, PanelSection, PopoverButton } from "./ui.tsx";

// A pill of segments ("Label | value | ×"), each its own control, with hairlines between them.
// The segments are plain buttons (or Buttons stripped of their frame): the pill is the frame, so
// a segment has no rounding or border of its own. The pill clips, so focus is drawn inside.
// Only the left edge is coloured: a Button keeps its transparent border on every side, and a
// coloured one would draw a second frame inside the pill's ring.
const chip =
  "inline-flex h-6 items-stretch overflow-hidden rounded-md bg-surface text-xs whitespace-nowrap text-gray-950 ring ring-gray-950/10 ring-inset [&>*+*]:border-l [&>*+*]:border-l-gray-950/[0.07]";
const part = "!h-auto !gap-1.5 !rounded-none !px-1.5 !text-xs !font-medium -outline-offset-2";
const muted = "!font-normal !text-gray-600";
const remove = `flex items-center px-1 text-gray-400 hover:bg-gray-950/5 hover:text-gray-800 active:bg-gray-950/8 ${focusRingInsetClass}`;
const cross = <CloseRegular aria-hidden className="size-3" />;

export function ViewChips() {
  const { definition, view, updateView, edited } = useViewContext();
  const filters = filterChips(view.config.filter, definition.properties);
  if (filters.kind === "none" && !edited) return null;
  return (
    // Not a list element: inside a document (an embed) the editor's list styles would reach it.
    <div className="flex items-start gap-2 py-1.5" data-testid="view-chips">
      <div className="flex min-w-0 flex-1 flex-wrap items-center gap-1">
        {filters.kind === "simple" &&
          filters.chips.map((c) => (
            <FilterChipItem key={`${c.index}:${c.condition.propertyId}`} chip={c} />
          ))}
        {filters.kind === "advanced" && (
          <div className={chip} data-testid="filter-chip">
            <PopoverButton
              label="Advanced filter"
              button={`Advanced filter · ${filters.rules} ${filters.rules === 1 ? "rule" : "rules"}`}
              className={part}
            >
              {() => <FilterBuilder />}
            </PopoverButton>
            <button
              type="button"
              aria-label="Remove all filters"
              onClick={() => updateView({ filter: null }, { label: "Remove filters" })}
              className={remove}
            >
              {cross}
            </button>
          </div>
        )}
        {/* Its own popover, so the menu opens under the "+" rather than at the toolbar's Filter. */}
        {filters.kind !== "none" && (
          <PopoverButton
            label="Add filter"
            button={<AddRegular aria-hidden className="size-3.5" />}
            size="icon-xs"
            className="text-gray-500"
          >
            {(close) => <FilterMenu close={close} />}
          </PopoverButton>
        )}
      </div>
      <ViewStateControls />
    </div>
  );
}

// Shown while this device's view differs from the saved one.
function ViewStateControls() {
  const { edited, saveView, resetView, saveBlockedReason } = useViewContext();
  if (!edited) return null;
  return (
    <span
      className="ml-auto inline-flex h-6 shrink-0 items-center gap-0.5 text-xs"
      data-testid="view-edited"
    >
      <span
        className="px-1.5 text-gray-500"
        title={
          saveBlockedReason ??
          "Your changes to this view show only to you until you save them for everyone"
        }
      >
        {saveBlockedReason ? "Edited · Only you see this" : "Edited"}
      </span>
      <Button variant="ghost" size="xs" className="text-gray-600" onPress={resetView}>
        Reset
      </Button>
      {!saveBlockedReason && (
        <Button variant="secondary" size="xs" onPress={() => void saveView()}>
          Save for everyone
        </Button>
      )}
    </span>
  );
}

function FilterChipItem({ chip: c }: { chip: FilterChip }) {
  const { definition, view, updateView } = useViewContext();
  const ui = useFilterUi();
  const property = c.property;
  const set = (condition: FilterCondition) =>
    updateView(
      { filter: replaceChip(view.config.filter, c.index, condition) },
      { label: "Change filter" },
    );
  const controlled = (id: string) => ({
    isOpen: ui.openChip === `${id}:${c.index}`,
    onOpenChange: (open: boolean) => ui.setOpenChip(open ? `${id}:${c.index}` : null),
  });
  return (
    <div className={chip} data-testid="filter-chip">
      <PopoverButton
        label={`Filter property: ${c.propertyLabel}`}
        button={
          <>
            {property && (
              <TypeIcon type={property.type} aria-hidden className="size-3.5 text-gray-400" />
            )}
            {c.propertyLabel}
          </>
        }
        className={`${part} ${muted}`}
        {...controlled("property")}
      >
        {(close) => (
          <PropertyList
            properties={definition.properties}
            selected={property?.id ?? null}
            onPick={(p) => {
              close();
              const next = defaultCondition(p);
              set(next);
              if (needsValue(next.op)) ui.setOpenChip(`value:${c.index}`);
            }}
          />
        )}
      </PopoverButton>
      {property && (
        <PopoverButton
          label={`Filter condition: ${c.opLabel}`}
          button={c.opLabel}
          className={`${part} ${muted}`}
          {...controlled("operator")}
        >
          {(close) => (
            <PanelSection>
              {chipOperators(property.type).map((op) => (
                <MenuButtonItem
                  key={op.id}
                  selected={chipOperatorOf(c.condition, property.type) === op.id}
                  onPress={() => {
                    close();
                    set(
                      withChipOperator(c.condition, property.type, op.id, (o) =>
                        defaultValue(property.type, o),
                      ),
                    );
                  }}
                >
                  {op.label}
                </MenuButtonItem>
              ))}
            </PanelSection>
          )}
        </PopoverButton>
      )}
      {property && c.valueLabel !== null && (
        <PopoverButton
          label={`Filter value: ${c.valueLabel}`}
          button={c.valueLabel}
          className={part}
          {...controlled("value")}
        >
          {() => (
            <div className="flex max-w-[480px] flex-col gap-2 p-2" data-testid="filter-value">
              <ChipValue property={property} condition={c.condition} onChange={set} />
            </div>
          )}
        </PopoverButton>
      )}
      <button
        type="button"
        aria-label={`Remove filter ${c.propertyLabel}`}
        onClick={() =>
          updateView(
            { filter: removeChip(view.config.filter, c.index) },
            { label: "Remove filter" },
          )
        }
        className={remove}
      >
        {cross}
      </button>
    </div>
  );
}

// Options as checkboxes for choices (the operator follows the count); the builder's value input
// for everything else.
function ChipValue({
  property,
  condition,
  onChange,
}: {
  property: DatabaseProperty;
  condition: FilterCondition;
  onChange: (condition: FilterCondition) => void;
}) {
  const options = optionsOf(property);
  if (isMultiValueType(property.type) && options.length > 0) {
    const selected = valuesOf(condition);
    return (
      <ul aria-label="Values" className="flex max-h-72 flex-col overflow-auto">
        {options.map((o) => (
          <li key={o.id}>
            <Checkbox
              isSelected={selected.includes(o.name)}
              onChange={(checked) =>
                onChange(
                  withValues(
                    condition,
                    property.type,
                    checked ? [...selected, o.name] : selected.filter((n) => n !== o.name),
                  ),
                )
              }
              className={dropdownItemStyles({ className: "gap-2 hover:bg-gray-100" })}
            >
              {o.name}
            </Checkbox>
          </li>
        ))}
      </ul>
    );
  }
  return (
    <ValueInput
      property={property}
      condition={condition}
      onChange={(value) => onChange({ ...condition, value })}
    />
  );
}

function PropertyList({
  properties,
  selected,
  onPick,
}: {
  properties: readonly DatabaseProperty[];
  selected: string | null;
  onPick: (p: DatabaseProperty) => void;
}) {
  return (
    <PanelSection>
      {properties.map((p) => (
        <MenuButtonItem key={p.id} selected={p.id === selected} onPress={() => onPick(p)}>
          <TypeIcon type={p.type} aria-hidden className="size-3.5 shrink-0 text-gray-500" />
          {p.name}
        </MenuButtonItem>
      ))}
    </PanelSection>
  );
}

// ---- The toolbar's "Filter" menu: pick a property (or type a value's name); "Advanced filter"
// opens the and/or builder.

export function FilterMenu({ close }: { close: () => void }) {
  const { definition, view, updateView } = useViewContext();
  const ui = useFilterUi();
  const advanced = filterChips(view.config.filter, definition.properties).kind === "advanced";
  const [mode, setMode] = useState<"pick" | "advanced">(advanced ? "advanced" : "pick");
  const [query, setQuery] = useState("");
  if (mode === "advanced") return <FilterBuilder />;
  const q = query.trim().toLowerCase();
  const properties = definition.properties.filter((p) => p.name.toLowerCase().includes(q));
  // "Type the value": options whose name matches, as ready-made filters.
  const values = q
    ? definition.properties.flatMap((p) =>
        isMultiValueType(p.type)
          ? optionsOf(p)
              .filter((o) => o.name.toLowerCase().includes(q))
              .map((o) => ({ property: p, option: o.name }))
          : [],
      )
    : [];
  // A new filter on a property opens its value right away (a checkbox needs none).
  const add = (condition: FilterCondition, openValue: boolean) => {
    const index = toRoot(view.config.filter).children.length;
    updateView({ filter: addChip(view.config.filter, condition) }, { label: "Add filter" });
    close();
    if (openValue) ui.setOpenChip(`value:${index}`);
  };
  const items: { key: string; label: ReactNode; run: () => void }[] = [
    ...properties.map((p) => ({
      key: p.id,
      label: (
        <>
          <TypeIcon type={p.type} aria-hidden className="size-3.5 shrink-0 text-gray-500" />
          {p.name}
        </>
      ),
      run: () => {
        const condition = defaultCondition(p);
        add(condition, needsValue(condition.op) && p.type !== "checkbox");
      },
    })),
    ...values.slice(0, 8).map(({ property, option }) => ({
      key: `${property.id}:${option}`,
      label: (
        <>
          <span className="text-gray-500">{property.name} is</span> {option}
        </>
      ),
      run: () =>
        add(
          withValues(
            { type: "condition", propertyId: property.id, op: "eq", value: "" },
            property.type,
            [option],
          ),
          false,
        ),
    })),
  ];
  return (
    <div className="flex w-64 flex-col" data-testid="filter-menu">
      <div className="p-2 pb-0">
        <TextField
          // oxlint-disable-next-line jsx-a11y/no-autofocus -- the menu opened to pick a filter
          autoFocus
          aria-label="Filter by"
          placeholder="Filter by…"
          value={query}
          onChange={setQuery}
          onKeyDown={(event) => {
            if (event.key === "Enter" && items[0]) {
              event.preventDefault();
              items[0].run();
              return;
            }
            // react-aria stops a handled key here; Escape has to reach the popover to close it.
            event.continuePropagation();
          }}
        />
      </div>
      <PanelSection>
        {items.length === 0 && <p className="px-2 py-1 text-xs text-gray-500">No matches</p>}
        {items.map((item) => (
          <MenuButtonItem key={item.key} onPress={item.run}>
            {item.label}
          </MenuButtonItem>
        ))}
      </PanelSection>
      <div className="border-t border-gray-100 p-1">
        <MenuButtonItem onPress={() => setMode("advanced")}>Advanced filter…</MenuButtonItem>
      </div>
    </div>
  );
}
