// The card that previews a document: cover, emoji, title, the opening lines and a line of facts.
// Tree rows show it on hover, and links (in the editor and in lists) show it with their actions
// below, so a document looks the same wherever it is previewed.
import type { JSONContent } from "@lydie/editor";
import { CheckboxMark } from "@lydie/ui";
import { useState } from "react";

import { editedAgo, summarizeDoc, wordsLabel } from "./doc-summary.ts";
import type { ExcerptLine, Span } from "./doc-summary.ts";
import { coverFillOf, pageCoverOf, PageIcon, pageIconOf, useCoverUrl } from "./page-icon.tsx";
import { useApp, useQuery } from "./react.tsx";

// On top of the floating card's or hover card's own styles, which already draw the edge
// (`shadow-popover`, hairline included) and the radius every popover has: only the width here.
export const DOC_CARD_CLASS = "w-[300px]";

// A page scaled down, so a type ramp of its own around the app's 13px text: title 15px, text
// 12.5px, code 11.5px, facts 11px.

// What the caller already knows (a tree row's entry), so the header draws before the body loads.
export type DocCardEntry = {
  title: string;
  properties: Record<string, unknown> | null;
  updatedAt: string;
  childCount?: number;
};

// Part of the document to show instead of its opening, e.g. a link's `#heading` or `#^block`.
// `select` returns the part's top-level nodes, or null when it no longer exists.
export type DocCardSection = {
  label: string;
  missing: string;
  select(content: JSONContent, markdown: string): readonly JSONContent[] | null;
};

type Props = {
  id: string;
  entry?: DocCardEntry;
  section?: DocCardSection;
};

export function DocCard({ id, entry: known, section }: Props) {
  const app = useApp();
  const { data, isLoading, error } = useQuery("doc.get", { id, includeBody: true });
  const loaded = data[0];
  const entry: DocCardEntry | null = loaded
    ? { ...loaded.document, childCount: known?.childCount }
    : (known ?? null);

  if (error && !entry)
    return <p className="px-3.5 py-3 text-xs text-red-600">Could not load this note.</p>;
  if (!entry && !isLoading) return <p className="px-3.5 py-3 text-xs text-gray-500">Not found</p>;

  const markdown = loaded?.body?.markdown;
  const content = markdown === undefined ? null : app.editor.fromMarkdown(markdown).content;
  const nodes = content && section ? section.select(content, markdown ?? "") : null;
  const summary = content
    ? summarizeDoc(
        section ? { type: "doc", content: [...(nodes ?? [])] } : content,
        section?.label ?? entry?.title ?? "",
      )
    : null;
  const words = content ? (section ? summarizeDoc(content, "").words : summary!.words) : 0;
  const cover = pageCoverOf(entry?.properties);
  const icon = pageIconOf(entry?.properties);
  const childCount = entry?.childCount ?? 0;
  const facts = entry
    ? [
        loaded?.document.deletedAt ? "In the trash" : "",
        editedAgo(entry.updatedAt),
        childCount > 0 ? `${childCount} ${childCount === 1 ? "document" : "documents"} inside` : "",
        wordsLabel(words),
      ].filter(Boolean)
    : [];

  return (
    <div className="flex min-h-0 flex-col" data-testid="doc-card" data-doc-id={id}>
      {cover && <Cover cover={cover.cover} position={cover.position} />}
      <div className="flex min-h-0 flex-col gap-1.5 px-3.5 pt-3 pb-3">
        {/* An emoji earns the space; the plain page icon would only repeat the row. */}
        {icon && (
          <span
            data-page-icon={icon}
            className={`relative flex size-9 items-center justify-center text-[28px] leading-none ${cover ? "-mt-8 rounded-lg bg-elevated shadow-document-icon" : ""}`}
          >
            <PageIcon icon={icon} />
          </span>
        )}
        {entry ? (
          <h3 className="line-clamp-2 text-[15px] leading-snug font-semibold text-gray-900">
            {entry.title || "Untitled"}
            {section && <span className="font-normal text-gray-400"> › {section.label}</span>}
          </h3>
        ) : (
          <span aria-hidden className="h-4 w-1/2 animate-pulse rounded-full bg-gray-950/[0.06]" />
        )}
        {section && content && nodes === null ? (
          <p className="text-[12.5px] text-gray-500">{section.missing}</p>
        ) : summary ? (
          <Excerpt lines={summary.lines} truncated={summary.truncated} />
        ) : isLoading ? (
          <Skeleton />
        ) : null}
      </div>
      {facts.length > 0 && (
        <div className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5 border-t border-gray-950/5 bg-gray-950/[0.02] px-3.5 py-2 text-[11px] text-gray-500">
          {facts.map((fact, i) => (
            <span key={fact} className="flex items-center gap-1.5 whitespace-nowrap">
              {i > 0 && <span aria-hidden className="size-[3px] rounded-full bg-gray-300" />}
              {fact}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

function Cover({ cover, position }: { cover: string; position: number }) {
  const url = useCoverUrl(cover);
  const fill = coverFillOf(cover);
  const [loaded, setLoaded] = useState<string | null>(null);
  return (
    <div
      className={`h-[72px] shrink-0 overflow-hidden ${fill ? fill.className : "bg-gray-950/5"}`}
      style={fill?.style}
    >
      {url && (
        <img
          src={url}
          alt=""
          draggable={false}
          onLoad={() => setLoaded(url)}
          className={`size-full object-cover transition-opacity duration-300 ${loaded === url ? "opacity-100" : "opacity-0"}`}
          style={{ objectPosition: `50% ${position}%` }}
        />
      )}
    </div>
  );
}

function Excerpt({ lines, truncated }: { lines: readonly ExcerptLine[]; truncated: boolean }) {
  if (lines.length === 0)
    return <p className="text-[12.5px] text-gray-400 italic">Nothing written yet</p>;
  return (
    <div
      className={`flex flex-col gap-1 text-[12.5px] leading-relaxed text-gray-600 ${truncated ? "mask-b-from-60%" : ""}`}
    >
      {lines.map((line, i) => (
        <Line key={i} line={line} />
      ))}
    </div>
  );
}

function Line({ line }: { line: ExcerptLine }) {
  switch (line.kind) {
    case "heading":
      return (
        <p className="mt-1 truncate font-semibold text-gray-800 first:mt-0">
          <Spans spans={line.spans} />
        </p>
      );
    case "quote":
      return (
        <p className="line-clamp-2 border-l-2 border-gray-950/10 pl-2 text-gray-500 italic">
          <Spans spans={line.spans} />
        </p>
      );
    case "code":
      return (
        <p className="truncate rounded-md bg-gray-950/[0.04] px-1.5 py-0.5 font-mono text-[11.5px] text-gray-700">
          {line.spans[0]?.text}
        </p>
      );
    case "bullet":
      return (
        <p className="flex gap-1.5" style={{ paddingLeft: line.depth * 12 }}>
          <span aria-hidden className="w-2.5 shrink-0 text-center text-gray-400 tabular-nums">
            {line.marker}
          </span>
          <span className="line-clamp-2 min-w-0">
            <Spans spans={line.spans} />
          </span>
        </p>
      );
    case "task":
      // A div, not a p: CheckboxMark is a div.
      return (
        <div className="flex items-start gap-1.5" style={{ paddingLeft: line.depth * 12 }}>
          <CheckboxMark isSelected={line.checked} className="mt-1 size-3" />
          <span
            className={`line-clamp-2 min-w-0 ${line.checked ? "text-gray-400 line-through" : ""}`}
          >
            <Spans spans={line.spans} />
          </span>
        </div>
      );
    default:
      return (
        <p className="line-clamp-3">
          <Spans spans={line.spans} />
        </p>
      );
  }
}

function Spans({ spans }: { spans: readonly Span[] }) {
  return spans.map((span, i) => {
    const classes = [
      span.bold ? "font-semibold text-gray-700" : "",
      span.italic ? "italic" : "",
      span.strike ? "line-through" : "",
      span.code ? "rounded bg-gray-950/[0.05] px-1 font-mono text-[11.5px]" : "",
      span.link ? "text-blue-600" : "",
    ]
      .filter(Boolean)
      .join(" ");
    return classes ? (
      <span key={i} className={classes}>
        {span.text}
      </span>
    ) : (
      span.text
    );
  });
}

function Skeleton() {
  return (
    <div aria-hidden className="flex animate-pulse flex-col gap-2 pt-1">
      <span className="h-2.5 w-full rounded-full bg-gray-950/[0.06]" />
      <span className="h-2.5 w-11/12 rounded-full bg-gray-950/[0.06]" />
      <span className="h-2.5 w-2/3 rounded-full bg-gray-950/[0.06]" />
    </div>
  );
}
