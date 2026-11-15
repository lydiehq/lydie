/* oxlint-disable jsx-a11y/prefer-tag-over-role, jsx-a11y/interactive-supports-focus, jsx-a11y/no-static-element-interactions, jsx-a11y/no-noninteractive-element-interactions -- the ARIA combobox pattern: focus stays in the input, which drives the listbox through aria-activedescendant */
// Editors for one property value, by type. Rendered inside a popover by the caller (a table cell,
// the properties panel, a card). `onChange` writes (an operation); `onClose` tells the caller why
// editing ended so a grid can move on (Enter, Tab) or stay (Escape).
import { COLORS, convertValue } from "@lydie/contract";
import type { Color, PropertyValue, RelatedRow, SelectOption } from "@lydie/contract";
import {
  AttachmentRegular,
  Button,
  buttonStyles,
  Checkbox,
  CheckRegular,
  CloseRegular,
  dropdownItemStyles,
  Input,
  LinkButton,
  More1Regular,
  Switch,
  TextArea,
} from "@lydie/ui";
import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { KeyboardEvent, ReactNode } from "react";

import { useBackend, useOps, useWorkspace } from "../react.tsx";
import { useDatabase, useDatabaseView } from "./hooks.ts";
import { useMembers } from "./members.ts";
import { fileLabel, OptionPill, RelationChips } from "./PropertyValueView.tsx";
import type { PropertyLike } from "./values.ts";
import {
  isUrlLike,
  joinDate,
  OPTION_COLORS,
  optionsOf,
  parseDateValue,
  parseValueText,
  todayIso,
  TYPE_LABELS,
} from "./values.ts";

export type EditorCloseReason = "commit" | "cancel" | "tab" | "shiftTab";

export type PropertyEditorProps = {
  property: PropertyLike;
  value: unknown;
  // Relation targets with titles, when known.
  related?: readonly RelatedRow[] | null;
  // Text typed on a selected cell to start editing; it replaces the value.
  initialText?: string;
  onChange: (value: PropertyValue) => void;
  onClose: (reason: EditorCloseReason) => void;
  // The row being edited (a relation to its own database leaves it out).
  rowId?: string;
};

export function PropertyEditor(props: PropertyEditorProps) {
  switch (props.property.type) {
    case "title":
    case "text":
    case "url":
    case "email":
    case "phone":
      return <TextEditor {...props} />;
    case "number":
      return <NumberEditor {...props} />;
    case "select":
    case "status":
    case "multiSelect":
      return <OptionsEditor {...props} />;
    case "date":
      return <DateEditor {...props} />;
    case "checkbox":
      return <CheckboxEditor {...props} />;
    case "person":
      return <PersonEditor {...props} />;
    case "files":
      return <FilesEditor {...props} />;
    case "relation":
      return <RelationEditor {...props} />;
    case "uniqueId":
      return (
        <div className="p-3 text-xs text-gray-500" role="note">
          IDs are filled in automatically.
        </div>
      );
    default:
      return (
        <div className="p-3 text-xs text-gray-500" role="note">
          {TYPE_LABELS[props.property.type]} values are computed and cannot be edited.
        </div>
      );
  }
}

const panel = "flex w-72 flex-col gap-1 p-1 text-sm";
// The shared fields at `size="sm"`, full width, with the edge drawn as a border rather than a ring:
// a popover that covers the value it edits (`EditorPopover`) is the frame itself and strips the
// border (`[&>div>:is(textarea,input)]:!border-transparent`).
const inputClass =
  "w-full flex-none border border-gray-950/8 px-2 ring-0 outline-none focus:border-gray-950/20 focus:ring-0";

function closeKeys(
  event: KeyboardEvent,
  commit: () => void,
  onClose: PropertyEditorProps["onClose"],
  multiline = false,
) {
  if (event.key === "Escape") {
    event.preventDefault();
    event.stopPropagation();
    onClose("cancel");
  } else if (
    event.key === "Enter" &&
    !(multiline && event.shiftKey) &&
    !event.nativeEvent.isComposing
  ) {
    event.preventDefault();
    event.stopPropagation();
    commit();
    onClose("commit");
  } else if (event.key === "Tab") {
    event.preventDefault();
    event.stopPropagation();
    commit();
    onClose(event.shiftKey ? "shiftTab" : "tab");
  }
}

// ---- Text, URL, email, phone, title

function TextEditor({ property, value, initialText, onChange, onClose }: PropertyEditorProps) {
  const original = value === null || value === undefined ? "" : String(value);
  // A new row's "Untitled" is a placeholder: typing replaces it.
  const [text, setText] = useState(
    initialText ?? (property.type === "title" && original === "Untitled" ? "" : original),
  );
  const ref = useRef<HTMLTextAreaElement>(null);
  const done = useRef(false);
  const multiline = property.type === "text";
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.focus();
    const end = el.value.length;
    el.setSelectionRange(end, end);
  }, []);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "0px";
    el.style.height = `${Math.min(el.scrollHeight, 240)}px`;
  }, [text]);
  const commit = () => {
    if (done.current) return;
    const next = property.type === "title" ? text.replace(/\s+/g, " ").trim() : text;
    // Unchanged (e.g. a blur while the popover settles focus): stay open to a later commit.
    if (next === original) return;
    done.current = true;
    if (property.type === "title") {
      if (next) onChange(next);
      return;
    }
    onChange(next.trim() === "" ? null : next);
  };
  return (
    <div className={panel}>
      <TextArea
        size="sm"
        ref={ref}
        aria-label={property.name}
        rows={1}
        value={text}
        placeholder={property.type === "title" ? "Untitled" : "Empty"}
        onChange={(event) =>
          setText(multiline ? event.target.value : event.target.value.replace(/\n/g, " "))
        }
        onKeyDown={(event) => {
          if (event.key === "Escape") done.current = true;
          closeKeys(event, commit, onClose, multiline);
        }}
        onBlur={commit}
        className={`${inputClass} resize-none`}
      />
      {(property.type === "url" || property.type === "email") && text.trim() !== "" && (
        <LinkButton
          variant="ghost"
          size="xs"
          href={
            property.type === "email"
              ? `mailto:${text.trim()}`
              : isUrlLike(text.trim())
                ? text.trim()
                : `https://${text.trim()}`
          }
          target="_blank"
          rel="noreferrer"
          className="self-start text-gray-600"
        >
          Open {property.type === "email" ? "mail" : "link"}
        </LinkButton>
      )}
    </div>
  );
}

// ---- Number

function NumberEditor({ property, value, initialText, onChange, onClose }: PropertyEditorProps) {
  const original = typeof value === "number" ? String(value) : "";
  const [text, setText] = useState(initialText ?? original);
  const done = useRef(false);
  const parsed = text.trim() === "" ? null : parseValueText(property, text);
  const invalid = text.trim() !== "" && parsed === null;
  const commit = () => {
    if (done.current || invalid || text === original) return;
    done.current = true;
    onChange(parsed);
  };
  return (
    <div className={panel}>
      {/* Not NumberField: values are typed as text ("1,250", "$3", "12%") and parsed on commit. */}
      <Input
        size="sm"
        // oxlint-disable-next-line jsx-a11y/no-autofocus -- the popover opened to edit this value
        autoFocus
        aria-label={property.name}
        aria-invalid={invalid}
        inputMode="decimal"
        value={text}
        onChange={(event) => setText(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Escape") done.current = true;
          closeKeys(event, commit, onClose);
        }}
        onBlur={commit}
        className={inputClass}
      />
      {invalid && (
        <p role="alert" className="px-2 text-xs text-red-600">
          Not a number
        </p>
      )}
    </div>
  );
}

// ---- Checkbox

function CheckboxEditor({ property, value, onChange, onClose }: PropertyEditorProps) {
  return (
    <Checkbox
      // oxlint-disable-next-line jsx-a11y/no-autofocus -- the popover opened to edit this value
      autoFocus
      isSelected={value === true}
      onChange={onChange}
      onKeyDown={(event) => {
        // react-aria stops key events by default; the popover still sees them, as before.
        event.continuePropagation();
        if (event.key === "Escape" || event.key === "Enter") {
          event.preventDefault();
          onClose(event.key === "Enter" ? "commit" : "cancel");
        }
      }}
      className="p-2"
    >
      {property.name}
    </Checkbox>
  );
}

// ---- A filterable list with keyboard selection (options, people, relations)

type ListItem = {
  id: string;
  label: ReactNode;
  text: string;
  selected?: boolean;
  trailing?: ReactNode;
};

function PickList({
  label,
  query,
  setQuery,
  items,
  onPick,
  onClose,
  onBackspaceEmpty,
  header,
  placeholder,
  emptyLabel = "No results",
}: {
  label: string;
  query: string;
  setQuery: (q: string) => void;
  items: readonly ListItem[];
  onPick: (item: ListItem) => void;
  onClose: PropertyEditorProps["onClose"];
  onBackspaceEmpty?: () => void;
  header?: ReactNode;
  placeholder?: string;
  emptyLabel?: string;
}) {
  const [active, setActive] = useState(0);
  const listId = useId();
  const index = Math.min(active, Math.max(0, items.length - 1));
  useEffect(() => setActive(0), [query]);
  return (
    <div className={panel}>
      {header}
      {/* Not the shared ComboBox: focus stays in this input, which drives the list below through
          aria-activedescendant, and Enter on no match creates (see the file's first line). */}
      <Input
        size="sm"
        // oxlint-disable-next-line jsx-a11y/no-autofocus -- the popover opened to edit this value
        autoFocus
        role="combobox"
        aria-label={label}
        aria-expanded
        aria-controls={listId}
        aria-activedescendant={items[index] ? `${listId}-${index}` : undefined}
        value={query}
        placeholder={placeholder ?? "Search or create…"}
        onChange={(event) => setQuery(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "ArrowDown") {
            event.preventDefault();
            setActive(Math.min(items.length - 1, index + 1));
          } else if (event.key === "ArrowUp") {
            event.preventDefault();
            setActive(Math.max(0, index - 1));
          } else if (event.key === "Enter" && !event.nativeEvent.isComposing) {
            event.preventDefault();
            event.stopPropagation();
            const item = items[index];
            if (item) onPick(item);
            else onClose("commit");
          } else if (event.key === "Escape") {
            event.preventDefault();
            event.stopPropagation();
            onClose("cancel");
          } else if (event.key === "Tab") {
            event.preventDefault();
            event.stopPropagation();
            onClose(event.shiftKey ? "shiftTab" : "tab");
          } else if (event.key === "Backspace" && query === "" && onBackspaceEmpty) {
            onBackspaceEmpty();
          }
        }}
        className={inputClass}
      />
      <div id={listId} role="listbox" aria-label={label} className="max-h-64 overflow-auto">
        {items.length === 0 && <p className="px-2 py-1.5 text-xs text-gray-500">{emptyLabel}</p>}
        {items.map((item, i) => (
          // oxlint-disable-next-line jsx-a11y/click-events-have-key-events -- keys go through the combobox
          <div
            key={item.id}
            id={`${listId}-${i}`}
            role="option"
            aria-selected={item.selected ?? false}
            data-active={i === index || undefined}
            onMouseEnter={() => setActive(i)}
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => onPick(item)}
            className={dropdownItemStyles({ isFocused: i === index, className: "gap-2" })}
          >
            <span className="flex w-4 shrink-0 items-center">
              {item.selected && <CheckRegular aria-hidden className="size-4" />}
            </span>
            <span className="min-w-0 flex-1 truncate">{item.label}</span>
            {item.trailing}
          </div>
        ))}
      </div>
    </div>
  );
}

// ---- Select, status, multi-select

const STATUS_GROUPS = [
  ["todo", "To-do"],
  ["inProgress", "In progress"],
  ["complete", "Complete"],
] as const;

function OptionsEditor({ property, value, initialText, onChange, onClose }: PropertyEditorProps) {
  const ops = useOps();
  const multi = property.type === "multiSelect";
  const selected = useMemo(
    () =>
      Array.isArray(value) ? value.map(String) : typeof value === "string" && value ? [value] : [],
    [value],
  );
  // A page outside a database has no schema: its own values are the options.
  const options: readonly SelectOption[] = useMemo(() => {
    const known = optionsOf(property);
    const extra = selected
      .filter((name) => !known.some((o) => o.name === name))
      .map((name) => ({ id: `value:${name}`, name, color: "default" as Color }));
    return [...known, ...extra];
  }, [property, selected]);
  const [query, setQuery] = useState(initialText ?? "");
  const [recolouring, setRecolouring] = useState<string | null>(null);
  const q = query.trim().toLowerCase();
  const matching = options.filter((o) => o.name.toLowerCase().includes(q));
  const ordered =
    property.type === "status"
      ? STATUS_GROUPS.flatMap(([g]) => matching.filter((o) => (o.group ?? "todo") === g))
      : matching;
  const exact = options.some((o) => o.name.toLowerCase() === q);
  const items: ListItem[] = ordered.map((o) => ({
    id: o.id,
    text: o.name,
    selected: selected.includes(o.name),
    label: <OptionPill name={o.name} color={o.color} />,
    trailing:
      property.databaseId && !o.id.startsWith("value:") ? (
        // Keeps focus in the combobox; a press does not reach the option (react-aria stops it).
        <Button
          variant="ghost"
          size="icon-xs"
          aria-label={`Colour of ${o.name}`}
          preventFocusOnPress
          onPress={() => setRecolouring(recolouring === o.id ? null : o.id)}
          className="text-gray-500"
        >
          <More1Regular aria-hidden />
        </Button>
      ) : undefined,
  }));
  if (q && !exact) {
    items.push({
      id: "create",
      text: query.trim(),
      label: (
        <span>
          Create <OptionPill name={query.trim()} />
        </span>
      ),
    });
  }
  const pick = (item: ListItem) => {
    const name = item.text;
    if (multi) {
      const next = selected.includes(name)
        ? selected.filter((n) => n !== name)
        : [...selected, name];
      onChange(next.length > 0 ? next : null);
      setQuery("");
    } else {
      onChange(selected[0] === name ? null : name);
      onClose("commit");
    }
  };
  const recolour = options.find((o) => o.id === recolouring);
  return (
    <PickList
      label={property.name}
      query={query}
      setQuery={setQuery}
      items={items}
      onPick={pick}
      onClose={onClose}
      onBackspaceEmpty={
        multi && selected.length > 0
          ? () => onChange(selected.length > 1 ? selected.slice(0, -1) : null)
          : undefined
      }
      emptyLabel="Type to create an option"
      header={
        <>
          {selected.length > 0 && (
            <div className="flex flex-wrap gap-1 px-1 pt-1" aria-label="Selected">
              {selected.map((name) => (
                <span key={name} className="inline-flex items-center gap-0.5">
                  <OptionPill name={name} color={options.find((o) => o.name === name)?.color} />
                  <Button
                    variant="ghost"
                    size="icon-xs"
                    aria-label={`Remove ${name}`}
                    preventFocusOnPress
                    onPress={() => {
                      const next = selected.filter((n) => n !== name);
                      onChange(multi && next.length > 0 ? next : null);
                    }}
                    className="text-gray-500"
                  >
                    <CloseRegular aria-hidden />
                  </Button>
                </span>
              ))}
            </div>
          )}
          {recolour && property.databaseId && (
            <div
              role="group"
              aria-label={`Colours for ${recolour.name}`}
              className="flex flex-wrap gap-1 p-1"
            >
              {COLORS.map((color) => (
                <Button
                  key={color}
                  variant="ghost"
                  size="icon-sm"
                  aria-label={color}
                  aria-pressed={recolour.color === color}
                  data-current={recolour.color === color || undefined}
                  preventFocusOnPress
                  onPress={() => {
                    void ops.database.updateOption({
                      propertyId: property.id,
                      optionId: recolour.id,
                      color,
                    });
                    setRecolouring(null);
                  }}
                >
                  <span
                    aria-hidden
                    className={`size-4 rounded border border-gray-950/10 ${OPTION_COLORS[color]}`}
                  />
                </Button>
              ))}
            </div>
          )}
        </>
      }
    />
  );
}

// ---- Date (optional end and time)

function DateEditor({ property, value, onChange, onClose }: PropertyEditorProps) {
  const ops = useOps();
  const parts = parseDateValue(value);
  const includeTime = property.config.includeTime ?? Boolean(parts?.start.includes("T"));
  const hasEnd = Boolean(parts?.end);
  const inputType = includeTime ? "datetime-local" : "date";
  const shown = (iso: string | null | undefined) =>
    !iso
      ? ""
      : includeTime
        ? iso.includes("T")
          ? iso.slice(0, 16)
          : `${iso}T09:00`
        : iso.slice(0, 10);
  const write = (start: string, end: string | null) => {
    if (!start) return onChange(null);
    onChange(joinDate({ start, end: end || null }));
  };
  const setConfig = (patch: { includeTime?: boolean; range?: boolean }) => {
    if (!property.databaseId) return;
    void ops.database.updateProperty({ id: property.id, config: { ...property.config, ...patch } });
  };
  return (
    <div
      className={panel}
      onKeyDown={(event) => {
        if (event.key === "Escape" || event.key === "Enter") {
          event.preventDefault();
          event.stopPropagation();
          onClose(event.key === "Enter" ? "commit" : "cancel");
        }
      }}
    >
      {/* The fields sit where the value was; a range stacks start over end. */}
      <Input
        size="sm"
        // oxlint-disable-next-line jsx-a11y/no-autofocus -- the popover opened to edit this value
        autoFocus
        type={inputType}
        aria-label={hasEnd ? "Start date" : "Date"}
        value={shown(parts?.start)}
        onChange={(event) => write(event.target.value, parts?.end ?? null)}
        className={dateInputClass}
      />
      {hasEnd && (
        <Input
          size="sm"
          type={inputType}
          aria-label="End date"
          value={shown(parts?.end)}
          onChange={(event) => write(parts?.start ?? todayIso(), event.target.value)}
          className={dateInputClass}
        />
      )}
      <div role="separator" className={separator} />
      <Switch
        isSelected={hasEnd}
        isDisabled={!property.config.range && !property.databaseId}
        onChange={(checked) => {
          if (checked) {
            if (!property.config.range) setConfig({ range: true });
            const start = parts?.start ?? todayIso();
            write(start, start);
          } else write(parts?.start ?? "", null);
        }}
        className={switchRow}
      >
        End date
      </Switch>
      {property.databaseId && (
        <Switch
          isSelected={includeTime}
          onChange={(checked) => {
            setConfig({ includeTime: checked });
            if (parts) {
              const cut = (iso: string) => (checked ? shown(iso) : iso.slice(0, 10));
              write(cut(parts.start), parts.end ? cut(parts.end) : null);
            }
          }}
          className={switchRow}
        >
          Include time
        </Switch>
      )}
      <div role="separator" className={separator} />
      <Button variant="ghost" size="sm" onPress={() => write(todayIso(), null)} className={menuRow}>
        Today
      </Button>
      <Button
        variant="ghost"
        size="sm"
        isDisabled={!parts}
        onPress={() => {
          onChange(null);
          onClose("commit");
        }}
        className={menuRow}
      >
        Clear
      </Button>
    </div>
  );
}

const dateInputClass = `${inputClass} bg-gray-950/3 focus:bg-surface`;
const separator = "-mx-1 my-1 h-px bg-gray-950/6";
// Rows read like a menu's (dropdownItemStyles): label left, switch right.
const switchRow =
  "w-full flex-row-reverse justify-between rounded-md py-1 pr-1 pl-2 text-gray-900 hover:bg-gray-950/3";
const menuRow = "w-full justify-start px-2 font-normal text-gray-900";

// ---- Person

function PersonEditor({ property, value, onChange, onClose }: PropertyEditorProps) {
  const members = useMembers();
  const workspace = useWorkspace();
  const selected = Array.isArray(value) ? value.map(String) : [];
  const [query, setQuery] = useState("");
  const people = [
    ...[...members.values()].map((m) => ({
      id: m.userId,
      name: m.userName ?? m.userEmail ?? m.userId,
    })),
    ...(workspace.mode === "local" ? [{ id: "local", name: "Me" }] : []),
    ...selected.filter((id) => !members.has(id) && id !== "local").map((id) => ({ id, name: id })),
  ];
  const q = query.trim().toLowerCase();
  const items: ListItem[] = people
    .filter((p) => p.name.toLowerCase().includes(q))
    .map((p) => ({ id: p.id, text: p.id, label: p.name, selected: selected.includes(p.id) }));
  if (q && !people.some((p) => p.id.toLowerCase() === q)) {
    items.push({ id: `add:${query}`, text: query.trim(), label: `Add “${query.trim()}”` });
  }
  return (
    <PickList
      label={property.name}
      query={query}
      setQuery={setQuery}
      items={items}
      placeholder="Search people…"
      onClose={onClose}
      onPick={(item) => {
        const next = selected.includes(item.text)
          ? selected.filter((id) => id !== item.text)
          : [...selected, item.text];
        onChange(next.length > 0 ? next : null);
        setQuery("");
      }}
    />
  );
}

// ---- Files (attachment ids or URLs)

function FilesEditor({ property, value, onChange, onClose }: PropertyEditorProps) {
  const backend = useBackend();
  const items = Array.isArray(value) ? value.map(String) : [];
  const [url, setUrl] = useState("");
  const [error, setError] = useState<string | null>(null);
  const add = (item: string) => onChange([...items, item]);
  return (
    <div
      className={panel}
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          event.preventDefault();
          event.stopPropagation();
          onClose("cancel");
        }
      }}
    >
      <ul aria-label={property.name} className="flex flex-col">
        {items.map((item) => (
          <li
            key={item}
            className="flex items-center gap-2 rounded-md px-2 py-1 hover:bg-gray-950/3"
          >
            <span className="min-w-0 flex-1 truncate">📎 {fileLabel(item)}</span>
            <Button
              variant="ghost"
              size="icon-xs"
              aria-label={`Remove ${fileLabel(item)}`}
              onPress={() => {
                const next = items.filter((x) => x !== item);
                onChange(next.length > 0 ? next : null);
              }}
              className="text-gray-500"
            >
              <CloseRegular aria-hidden />
            </Button>
          </li>
        ))}
      </ul>
      <Input
        size="sm"
        // oxlint-disable-next-line jsx-a11y/no-autofocus -- the popover opened to edit this value
        autoFocus
        aria-label="Add a link"
        placeholder="Paste a link and press Enter"
        value={url}
        onChange={(event) => setUrl(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter" && url.trim()) {
            event.preventDefault();
            add(url.trim());
            setUrl("");
          }
        }}
        className={inputClass}
      />
      {/* A label around the hidden file input (the shared set has no file trigger), dressed as a
          ghost button; the ring shows while the input inside has keyboard focus. */}
      <label
        className={buttonStyles({
          variant: "ghost",
          size: "sm",
          className: "cursor-pointer justify-start has-[:focus-visible]:outline-2",
        })}
      >
        <AttachmentRegular aria-hidden data-icon="inline-start" />
        Upload a file…
        <input
          type="file"
          className="sr-only"
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (!file) return;
            setError(null);
            void file
              .arrayBuffer()
              .then((buffer) =>
                backend.attachments.add({
                  workspaceId: backend.info.workspaceId,
                  filename: file.name,
                  contentType: file.type || "application/octet-stream",
                  data: new Uint8Array(buffer),
                }),
              )
              .then((attachment) => add(attachment.id))
              .catch((e: unknown) => setError(e instanceof Error ? e.message : String(e)));
          }}
        />
      </label>
      {error && (
        <p role="alert" className="px-2 text-xs text-red-600">
          {error}
        </p>
      )}
    </div>
  );
}

// ---- Relation

function RelationEditor({
  property,
  value,
  related,
  onChange,
  onClose,
  rowId,
}: PropertyEditorProps) {
  const target = property.config.relation?.databaseId ?? null;
  const { definition } = useDatabase(target);
  const [query, setQuery] = useState("");
  const titleId = definition?.properties.find((p) => p.type === "title")?.id ?? null;
  const q = query.trim();
  const window = useDatabaseView(
    target && definition
      ? {
          databaseId: target,
          view: {
            config: {
              filter:
                q && titleId
                  ? { type: "condition", propertyId: titleId, op: "contains", value: q }
                  : null,
              groupBy: null,
              subGroupBy: null,
            },
          },
          window: { offset: 0, limit: 50 },
        }
      : null,
  );
  const selected = Array.isArray(value) ? value.map(String) : [];
  const one = property.config.relation?.limit === "one";
  const titles = new Map((related ?? []).map((r) => [r.id, r.title]));
  for (const row of window.rows) titles.set(row.id, row.title);
  const items: ListItem[] = window.rows
    .filter((row) => row.id !== rowId)
    .map((row) => ({
      id: row.id,
      text: row.id,
      label: row.title || "Untitled",
      selected: selected.includes(row.id),
    }));
  if (!target) {
    return <div className="p-3 text-xs text-gray-500">This relation has no target database.</div>;
  }
  return (
    <PickList
      label={property.name}
      query={query}
      setQuery={setQuery}
      items={items}
      placeholder="Search rows…"
      emptyLabel={window.isLoading ? "Loading…" : "No matching rows"}
      onClose={onClose}
      header={
        selected.length > 0 ? (
          <div className="px-1 pt-1" aria-label="Linked">
            <RelationChips
              wrap
              rows={selected.map((id) => ({ id, title: titles.get(id) ?? "Untitled" }))}
            />
          </div>
        ) : null
      }
      onPick={(item) => {
        if (one) {
          onChange(selected[0] === item.text ? null : [item.text]);
          onClose("commit");
          return;
        }
        const next = selected.includes(item.text)
          ? selected.filter((id) => id !== item.text)
          : [...selected, item.text];
        onChange(next.length > 0 ? next : null);
      }}
    />
  );
}

// Converts a value when a page property changes type (no schema to do it for us).
export function convertPageValue(
  value: PropertyValue,
  from: PropertyLike["type"],
  to: PropertyLike["type"],
): PropertyValue {
  return convertValue(value, from, to);
}
