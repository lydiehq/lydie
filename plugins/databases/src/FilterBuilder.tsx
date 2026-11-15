/* oxlint-disable jsx-a11y/prefer-tag-over-role, jsx-a11y/interactive-supports-focus, jsx-a11y/no-static-element-interactions, jsx-a11y/no-noninteractive-element-interactions -- filter groups are labelled groups of controls, not form fieldsets */
// The advanced filter: nested and/or groups of conditions, per-type operators, relative dates.
// Each edit changes the view's filter through `updateView` (personal until saved). The simple
// case, conditions joined by "and", is edited as chips (`ViewChips.tsx`).
import {
  formatUniqueId,
  operatorsFor,
  optionsOf,
  parseUniqueId,
} from "@lydie/plugin-api/databases";
import type {
  DatabaseProperty,
  FilterCondition,
  FilterGroup,
  FilterNode,
  FilterValue,
} from "@lydie/plugin-api/databases";
import {
  Button,
  Checkbox,
  CloseRegular,
  DatePicker,
  Select,
  SelectItem,
  TextField,
} from "@lydie/plugin-api/ui";
import { useState } from "react";
import type { ReactNode } from "react";

import { useViewContext } from "./context.tsx";
import {
  addCondition,
  addGroup,
  canAddGroup,
  defaultCondition,
  defaultValue,
  fromRoot,
  isRelativeDate,
  needsValue,
  opLabel,
  RELATIVE_DATES,
  relativeLabel,
  removeAt,
  setCombinator,
  toRoot,
  updateCondition,
} from "./filter-model.ts";
import type { Path } from "./filter-model.ts";

// Select keys cannot be empty; this one stands for "no option chosen".
const NO_OPTION = "__none";

export function FilterBuilder() {
  const { definition, view, updateView } = useViewContext();
  // Edits build on the last edit, not on the filter shown: the next change can come before the
  // view re-renders (choose an operator, then type a value).
  const saved = view.config.filter;
  const [draft, setDraft] = useState<{ base: typeof saved; root: FilterGroup } | null>(null);
  const root = draft && draft.base === saved ? draft.root : toRoot(saved);
  const properties = definition.properties;
  const save = (next: FilterGroup, coalesce?: string) => {
    setDraft({ base: saved, root: next });
    updateView(
      { filter: fromRoot(next) },
      { label: "Change filter", ...(coalesce ? { coalesce } : {}) },
    );
  };
  const first = properties[0];
  return (
    <div className="flex w-[640px] max-w-[90vw] flex-col gap-2 p-3" data-testid="filter-builder">
      {root.children.length === 0 && <p className="text-xs text-gray-500">No filters yet.</p>}
      <GroupEditor
        group={root}
        path={[]}
        properties={properties}
        onChange={save}
        root={root}
        isRoot
      />
      {first && (
        <div className="flex gap-1">
          <Button
            variant="ghost"
            size="sm"
            onPress={() => save(addCondition(root, [], defaultCondition(first)))}
          >
            + Add filter
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onPress={() => save(addGroup(root, [], defaultCondition(first)))}
          >
            + Add filter group
          </Button>
        </div>
      )}
    </div>
  );
}

function GroupEditor({
  group,
  path,
  properties,
  onChange,
  root,
  isRoot = false,
}: {
  group: FilterGroup;
  path: Path;
  properties: readonly DatabaseProperty[];
  onChange: (root: FilterGroup, coalesce?: string) => void;
  root: FilterGroup;
  isRoot?: boolean;
}) {
  const first = properties[0];
  return (
    <div
      role="group"
      aria-label={isRoot ? "Filters" : "Filter group"}
      className={`flex flex-col gap-1.5 ${isRoot ? "" : "rounded-md border border-gray-950/8 bg-gray-50 p-2"}`}
    >
      {group.children.map((child, i) => {
        const childPath = [...path, i];
        return (
          <div key={i} className="flex items-start gap-2">
            <div className="flex h-7.5 w-14 shrink-0 items-center justify-end text-xs text-gray-500">
              {i === 0 ? (
                "Where"
              ) : i === 1 ? (
                <Combinator
                  value={group.combinator === "or" ? "or" : "and"}
                  onChange={(combinator) => onChange(setCombinator(root, path, combinator))}
                />
              ) : group.combinator === "or" ? (
                "Or"
              ) : (
                "And"
              )}
            </div>
            <div className="min-w-0 flex-1">
              <NodeEditor
                node={child}
                path={childPath}
                properties={properties}
                onChange={onChange}
                root={root}
              />
            </div>
          </div>
        );
      })}
      {!isRoot && first && (
        <div className="flex gap-1 pl-16">
          <Button
            variant="ghost"
            size="xs"
            onPress={() => onChange(addCondition(root, path, defaultCondition(first)))}
          >
            + Add filter rule
          </Button>
          {canAddGroup(path) && (
            <Button
              variant="ghost"
              size="xs"
              onPress={() => onChange(addGroup(root, path, defaultCondition(first)))}
            >
              + Add nested group
            </Button>
          )}
        </div>
      )}
    </div>
  );
}

// "And" / "Or" between a group's rules: the xs ghost Select, as the 56px column fits no field.
function Combinator({
  value,
  onChange,
}: {
  value: "and" | "or";
  onChange: (value: "and" | "or") => void;
}) {
  return (
    <Select
      variant="ghost"
      size="xs"
      aria-label="Combine with"
      className="-mr-1.5 items-end"
      selectedKey={value}
      onSelectionChange={(key) => onChange(key === "or" ? "or" : "and")}
    >
      <SelectItem id="and">And</SelectItem>
      <SelectItem id="or">Or</SelectItem>
    </Select>
  );
}

function NodeEditor({
  node,
  path,
  properties,
  onChange,
  root,
}: {
  node: FilterNode;
  path: Path;
  properties: readonly DatabaseProperty[];
  onChange: (root: FilterGroup, coalesce?: string) => void;
  root: FilterGroup;
}) {
  const remove = (
    <Button
      variant="ghost"
      size="icon-sm"
      aria-label="Remove filter"
      onPress={() => onChange(removeAt(root, path))}
      className="text-gray-500"
    >
      <CloseRegular aria-hidden />
    </Button>
  );
  if (node.type === "group") {
    return (
      <div className="flex items-start gap-1">
        <div className="min-w-0 flex-1">
          <GroupEditor
            group={node}
            path={path}
            properties={properties}
            onChange={onChange}
            root={root}
          />
        </div>
        {remove}
      </div>
    );
  }
  if (node.type === "expression") {
    return (
      <div className="flex items-center gap-1">
        <code className="min-w-0 flex-1 truncate rounded bg-gray-100 px-1.5 py-0.5 text-xs">
          {node.expression}
        </code>
        {remove}
      </div>
    );
  }
  return (
    <ConditionEditor
      condition={node}
      properties={properties}
      onChange={(patch, coalesce) => onChange(updateCondition(root, path, patch), coalesce)}
      remove={remove}
      coalesceKey={`filter:${path.join(".")}`}
    />
  );
}

function ConditionEditor({
  condition,
  properties,
  onChange,
  remove,
  coalesceKey,
}: {
  condition: FilterCondition;
  properties: readonly DatabaseProperty[];
  onChange: (patch: Partial<Omit<FilterCondition, "type">>, coalesce?: string) => void;
  remove: ReactNode;
  coalesceKey: string;
}) {
  const property = properties.find((p) => p.id === condition.propertyId);
  const ops = property ? operatorsFor(property.type) : [];
  return (
    <div className="flex flex-wrap items-center gap-1" data-testid="filter-condition">
      <Select
        size="sm"
        aria-label="Property"
        selectedKey={condition.propertyId}
        onSelectionChange={(key) => {
          const next = properties.find((p) => p.id === key);
          if (!next) return;
          const fresh = defaultCondition(next);
          onChange({ propertyId: next.id, op: fresh.op, value: fresh.value });
        }}
      >
        {[
          ...(property
            ? []
            : [
                <SelectItem key={condition.propertyId} id={condition.propertyId}>
                  Deleted property
                </SelectItem>,
              ]),
          ...properties.map((p) => (
            <SelectItem key={p.id} id={p.id}>
              {p.name}
            </SelectItem>
          )),
        ]}
      </Select>
      {property && (
        <Select
          size="sm"
          aria-label="Condition"
          selectedKey={condition.op}
          onSelectionChange={(key) => {
            const op = key as FilterCondition["op"];
            const keep =
              Array.isArray(condition.value) ===
              (op === "in" || op === "notIn" || op === "between");
            onChange({ op, value: keep ? condition.value : defaultValue(property.type, op) });
          }}
        >
          {ops.map((op) => (
            <SelectItem key={op} id={op}>
              {opLabel(op, property.type)}
            </SelectItem>
          ))}
        </Select>
      )}
      {property && needsValue(condition.op) && (
        <ValueInput
          property={property}
          condition={condition}
          onChange={(value, typing) => onChange({ value }, typing ? coalesceKey : undefined)}
        />
      )}
      {remove}
    </div>
  );
}

export function ValueInput({
  property,
  condition,
  onChange,
}: {
  property: DatabaseProperty;
  condition: FilterCondition;
  onChange: (value: FilterValue, typing?: boolean) => void;
}) {
  const value = condition.value;
  const type = property.type;
  if (type === "checkbox") {
    return (
      <Select
        size="sm"
        aria-label="Value"
        selectedKey={value === false ? "false" : "true"}
        onSelectionChange={(key) => onChange(key === "true")}
      >
        <SelectItem id="true">Checked</SelectItem>
        <SelectItem id="false">Unchecked</SelectItem>
      </Select>
    );
  }
  if (type === "select" || type === "status" || type === "multiSelect") {
    const options = optionsOf(property);
    const multiple = condition.op === "in" || condition.op === "notIn";
    if (multiple) {
      const selected = Array.isArray(value) ? value.map(String) : [];
      return (
        <span className="flex flex-wrap gap-x-3 gap-y-1 py-1" role="group" aria-label="Values">
          {options.map((o) => (
            <Checkbox
              key={o.id}
              isSelected={selected.includes(o.name)}
              onChange={(checked) =>
                onChange(checked ? [...selected, o.name] : selected.filter((n) => n !== o.name))
              }
            >
              {o.name}
            </Checkbox>
          ))}
        </span>
      );
    }
    return (
      <Select
        size="sm"
        aria-label="Value"
        selectedKey={typeof value === "string" && value ? value : NO_OPTION}
        onSelectionChange={(key) => onChange(key === null || key === NO_OPTION ? "" : String(key))}
      >
        {[
          <SelectItem key={NO_OPTION} id={NO_OPTION}>
            Select an option
          </SelectItem>,
          ...options.map((o) => (
            <SelectItem key={o.id} id={o.name}>
              {o.name}
            </SelectItem>
          )),
        ]}
      </Select>
    );
  }
  if (type === "person" || type === "createdBy" || type === "updatedBy") {
    const isMe = typeof value === "object" && value !== null && "me" in value;
    return (
      <span className="flex items-center gap-2">
        <Checkbox isSelected={isMe} onChange={(checked) => onChange(checked ? { me: true } : "")}>
          Me
        </Checkbox>
        {!isMe && <TextValue value={value} onChange={onChange} />}
      </span>
    );
  }
  if (type === "date" || type === "createdTime" || type === "updatedTime") {
    if (condition.op === "between") {
      const pair = Array.isArray(value) ? value : [];
      return (
        <span className="flex items-center gap-1">
          <DateValue value={pair[0]} onChange={(v) => onChange([v, pair[1] ?? v] as FilterValue)} />
          and
          <DateValue value={pair[1]} onChange={(v) => onChange([pair[0] ?? v, v] as FilterValue)} />
        </span>
      );
    }
    return <DateValue value={value} onChange={(v) => onChange(v as FilterValue)} />;
  }
  if (type === "number") {
    // A text field, not NumberField: the filter follows every keystroke, and NumberField only
    // reports a value once the field loses focus.
    return (
      <TextField
        size="sm"
        aria-label="Value"
        inputMode="decimal"
        defaultValue={typeof value === "number" ? String(value) : ""}
        onChange={(text) => {
          const n = Number(text);
          onChange(text.trim() === "" || !Number.isFinite(n) ? null : n, true);
        }}
        className="w-24"
      />
    );
  }
  if (type === "uniqueId") {
    // Typed as the IDs read ("LYD-12") or as the number.
    const prefix = property.config.prefix;
    return (
      <TextField
        size="sm"
        aria-label="Value"
        placeholder={prefix ? `${prefix}-1` : "1"}
        defaultValue={typeof value === "number" ? formatUniqueId(value, prefix) : ""}
        onChange={(text) => onChange(parseUniqueId(text, prefix), true)}
        className="w-24"
      />
    );
  }
  return <TextValue value={value} onChange={onChange} />;
}

function TextValue({
  value,
  onChange,
}: {
  value: FilterValue | undefined;
  onChange: (value: FilterValue, typing?: boolean) => void;
}) {
  return (
    <TextField
      size="sm"
      aria-label="Value"
      placeholder="Value"
      defaultValue={typeof value === "string" ? value : ""}
      onChange={(text) => onChange(text, true)}
      className="w-40"
    />
  );
}

// An exact date or a relative one (today, a week ago, …).
function DateValue({
  value,
  onChange,
}: {
  value: unknown;
  onChange: (value: FilterValue) => void;
}) {
  const relative = isRelativeDate(value) ? value : null;
  const mode = relative
    ? String(RELATIVE_DATES.findIndex((r) => relativeLabel(r.value) === relativeLabel(relative)))
    : "exact";
  return (
    <span className="flex items-center gap-1">
      <Select
        size="sm"
        aria-label="Date"
        selectedKey={mode === "-1" ? "exact" : mode}
        onSelectionChange={(key) => {
          const v = String(key);
          if (v === "exact") onChange(typeof value === "string" ? value : "");
          else onChange(RELATIVE_DATES[Number(v)]!.value);
        }}
      >
        {[
          ...RELATIVE_DATES.map((r, i) => (
            <SelectItem key={r.label} id={String(i)}>
              {r.label}
            </SelectItem>
          )),
          <SelectItem key="exact" id="exact">
            Exact date
          </SelectItem>,
        ]}
      </Select>
      {!relative && (
        <DatePicker
          size="sm"
          aria-label="Exact date"
          value={typeof value === "string" ? value.slice(0, 10) || null : null}
          onChange={(iso) => onChange(iso ?? "")}
          className="w-36"
        />
      )}
    </span>
  );
}
