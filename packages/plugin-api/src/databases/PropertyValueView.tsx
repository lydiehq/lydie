// Read-only rendering of a property value (table cells, cards, the properties panel). Cheap: one
// per visible cell.
import { docPath } from "@lydie/contract";
import type { RelatedRow } from "@lydie/contract";
import { Avatar, CheckboxMark, FileFilled, focusRingClass } from "@lydie/ui";
import { memo, useLayoutEffect, useRef, useState } from "react";
import type { MouseEvent } from "react";

import { PageLink } from "../page-link.tsx";
import { useContributions } from "../react.tsx";
import { useMembers } from "./members.ts";
import type { PropertyLike } from "./values.ts";
import {
  formatDate,
  isEmptyValue,
  isUrlLike,
  OPTION_COLORS,
  optionFor,
  parseDateValue,
  valueText,
} from "./values.ts";

export function OptionPill({ name, color }: { name: string; color?: string | undefined }) {
  const tone = OPTION_COLORS[(color ?? "default") as keyof typeof OPTION_COLORS];
  return (
    <span
      data-option={name}
      className={`inline-flex max-w-full shrink-0 items-center truncate rounded px-1.5 text-xs leading-5 ${tone}`}
    >
      {name}
    </span>
  );
}

type Props = {
  property: PropertyLike;
  value: unknown;
  // Relation targets with titles (from the view's computed values).
  related?: readonly RelatedRow[] | null;
  // Wrap long values instead of truncating them.
  wrap?: boolean;
  // Linked pages to show before the rest collapse into "+N".
  maxRelated?: number;
};

export const PropertyValueView = memo(function PropertyValueView({
  property,
  value,
  related,
  wrap = false,
  maxRelated,
}: Props) {
  if (property.type === "checkbox") {
    return (
      <span role="img" aria-label={value === true ? "Checked" : "Unchecked"}>
        <CheckboxMark isSelected={value === true} />
      </span>
    );
  }
  if (property.type === "relation") {
    const rows =
      related ??
      (Array.isArray(value) ? value.map((id) => ({ id: String(id), title: String(id) })) : []);
    return rows.length > 0 ? <RelationChips rows={rows} wrap={wrap} max={maxRelated} /> : null;
  }
  if (isEmptyValue(value)) return null;
  const truncate = wrap ? "whitespace-pre-wrap break-words" : "truncate";
  switch (property.type) {
    case "select":
    case "status": {
      const name = String(value);
      return <OptionPill name={name} color={optionFor(property, name)?.color} />;
    }
    case "multiSelect": {
      const names = Array.isArray(value) ? value.map(String) : [String(value)];
      return (
        <span className={`flex min-w-0 gap-1 ${wrap ? "flex-wrap" : "overflow-hidden"}`}>
          {names.map((name) => (
            <OptionPill key={name} name={name} color={optionFor(property, name)?.color} />
          ))}
        </span>
      );
    }
    case "url": {
      const text = String(value);
      return (
        <a
          href={isUrlLike(text) ? text : `https://${text}`}
          target="_blank"
          rel="noreferrer"
          onClick={(event) => event.stopPropagation()}
          className={`${truncate} text-gray-700 underline decoration-gray-300`}
        >
          {text}
        </a>
      );
    }
    case "email":
      return (
        <a
          href={`mailto:${String(value)}`}
          onClick={(event) => event.stopPropagation()}
          className={`${truncate} text-gray-700 underline decoration-gray-300`}
        >
          {String(value)}
        </a>
      );
    case "person":
    case "createdBy":
    case "updatedBy":
      return <People ids={Array.isArray(value) ? value.map(String) : [String(value)]} />;
    case "files": {
      const items = Array.isArray(value) ? value.map(String) : [String(value)];
      return (
        <span className={`flex min-w-0 gap-1 ${wrap ? "flex-wrap" : "overflow-hidden"}`}>
          {items.map((item) => (
            <span key={item} className="truncate rounded bg-gray-100 px-1.5 text-xs leading-5">
              📎 {fileLabel(item)}
            </span>
          ))}
        </span>
      );
    }
    case "date": {
      const parts = parseDateValue(value);
      if (!parts) return <span className={truncate}>{String(value)}</span>;
      return (
        <span className={truncate}>
          {formatDate(parts.start)}
          {parts.end ? ` → ${formatDate(parts.end)}` : ""}
        </span>
      );
    }
    case "rollup":
    case "formula":
      if (Array.isArray(value) && value.some((v) => typeof v === "object" && v && "id" in v)) {
        return <RelationChips rows={value as RelatedRow[]} wrap={wrap} max={maxRelated} />;
      }
      if (typeof value === "boolean") {
        return <span>{value ? "✓" : "✗"}</span>;
      }
      return <span className={truncate}>{valueText(property, value)}</span>;
    default:
      return (
        <span
          className={`${truncate} ${property.type === "number" || property.type === "uniqueId" ? "tabular-nums" : ""}`}
        >
          {valueText(property, value)}
        </span>
      );
  }
});

export function fileLabel(item: string): string {
  if (isUrlLike(item)) {
    try {
      const url = new URL(item);
      return url.pathname.split("/").filter(Boolean).at(-1) ?? url.host;
    } catch {
      return item;
    }
  }
  return item.length > 20 ? `${item.slice(0, 8)}…` : item;
}

function People({ ids }: { ids: readonly string[] }) {
  const members = useMembers();
  return (
    <span className="flex min-w-0 gap-1 overflow-hidden">
      {ids.map((id) => {
        const member = members.get(id);
        const name = member?.userName ?? (id === "local" ? "Me" : id);
        return (
          <span key={id} className="inline-flex items-center gap-1 truncate text-sm">
            <Avatar seed={id} image={member?.userImage} size={16} />
            {name}
          </span>
        );
      })}
    </span>
  );
}

const CHIP_GAP = 4;
const chipClass =
  "inline-flex max-w-48 items-center gap-1 truncate rounded-md px-1.5 text-sm leading-6";
const moreClass = "inline-flex shrink-0 items-center rounded-md px-1.5 text-sm leading-6";

// How many of the chips (natural widths) fit in `width` together with the "+N" pill for the
// rest. At least one: it truncates when even that does not fit.
export function fitChips(
  width: number,
  chipWidths: readonly number[],
  moreWidth: number,
  total: number,
): number {
  let used = 0;
  let fit = 0;
  for (const [i, chip] of chipWidths.entries()) {
    used += (i > 0 ? CHIP_GAP : 0) + chip;
    const more = total > i + 1 ? CHIP_GAP + moreWidth : 0;
    if (used + more > width) break;
    fit = i + 1;
  }
  return Math.max(1, fit);
}

// Linked rows: click opens (Mod-click in a new tab); hovering shows a preview when a plugin
// provides one (`links` contributions of kind "preview"), else the title. With `max`, one line:
// as many as fit (at most `max`), the rest in a "+N" pill; clicking it falls through to whatever
// opens the editor.
export function RelationChips({
  rows,
  wrap = false,
  max,
}: {
  rows: readonly RelatedRow[];
  wrap?: boolean;
  max?: number | undefined;
}) {
  const box = useRef<HTMLSpanElement>(null);
  const measure = useRef<HTMLSpanElement>(null);
  const candidates = max !== undefined ? rows.slice(0, max) : rows;
  const [fit, setFit] = useState<number | null>(null);
  const titles = candidates.map((row) => row.title || "Untitled").join("\n");

  useLayoutEffect(() => {
    const el = box.current;
    const ruler = measure.current;
    if (!el || !ruler) return;
    const update = () => {
      const width = el.clientWidth;
      // Not laid out (hidden, or a DOM without layout): show them all.
      if (width === 0) return setFit(null);
      const widths = [...ruler.children].map((child) => child.getBoundingClientRect().width);
      const more = widths.pop() ?? 0;
      setFit(fitChips(width, widths, more, rows.length));
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(el);
    return () => observer.disconnect();
  }, [titles, rows.length]);

  const shown = candidates.slice(0, fit ?? candidates.length);
  const hidden = rows.length - shown.length;
  const oneLine = max !== undefined;
  return (
    <span
      ref={oneLine ? box : undefined}
      className={`flex min-w-0 gap-1 ${oneLine ? "relative flex-1" : wrap ? "flex-wrap" : "overflow-hidden"}`}
    >
      {shown.map((row) => (
        <RelationChip key={row.id} row={row} shrink={oneLine} />
      ))}
      {hidden > 0 && (
        <span
          title={rows
            .slice(shown.length)
            .map((row) => row.title || "Untitled")
            .join(", ")}
          className={`${moreClass} text-gray-500`}
        >
          +{hidden}
        </span>
      )}
      {oneLine && (
        <span
          ref={measure}
          aria-hidden
          className="pointer-events-none invisible absolute top-0 left-0 flex gap-1 whitespace-nowrap"
        >
          {candidates.map((row) => (
            <span key={row.id} className={chipClass}>
              <FileFilled className="size-3.5 shrink-0" />
              <span className="truncate">{row.title || "Untitled"}</span>
            </span>
          ))}
          <span className={moreClass}>+{rows.length}</span>
        </span>
      )}
    </span>
  );
}

function RelationChip({ row, shrink = false }: { row: RelatedRow; shrink?: boolean }) {
  const previews = useContributions("link");
  const [hover, setHover] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const target = `doc:${row.id}`;
  const preview = previews.find((p) => p.kind === "preview" && p.match(target));
  // The cell under the chip must not act on its clicks.
  const keep = (event: MouseEvent) => event.stopPropagation();
  return (
    <span
      className={`relative inline-flex min-w-0 ${shrink ? "shrink" : "shrink-0"}`}
      onMouseEnter={() => {
        timer.current = setTimeout(() => setHover(true), 400);
      }}
      onMouseLeave={() => {
        if (timer.current) clearTimeout(timer.current);
        setHover(false);
      }}
    >
      {/* A link to the page, which must not swallow the grid's pointer events. */}
      <PageLink
        path={docPath(row.id)}
        title={row.title}
        data-related={row.id}
        onClick={keep}
        onAuxClick={keep}
        onDoubleClick={keep}
        className={`${chipClass} bg-gray-950/5 text-gray-800 hover:bg-gray-950/10 ${focusRingClass}`}
      >
        <FileFilled className="size-3.5 shrink-0 text-gray-400" />
        <span className="truncate">{row.title || "Untitled"}</span>
      </PageLink>
      {hover && (
        <span
          role="tooltip"
          className="absolute top-full left-0 z-50 mt-1 w-72 rounded-lg bg-elevated p-2 text-sm shadow-popover"
        >
          {preview ? <preview.component target={target} /> : row.title || "Untitled"}
        </span>
      )}
    </span>
  );
}
