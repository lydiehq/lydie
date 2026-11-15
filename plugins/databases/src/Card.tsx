// A row as a card (board, gallery): optional cover, title and the view's visible properties.
import { useBackend, useQuery } from "@lydie/plugin-api";
import {
  isEmptyValue,
  isUrlLike,
  isUuid,
  PropertyValueView,
  relatedRows,
  rowValue,
} from "@lydie/plugin-api/databases";
import type { ViewRow } from "@lydie/plugin-api/databases";
import { memo, useEffect, useState } from "react";

import { useViewContext } from "./context.tsx";
import type { Column } from "./view-model.ts";

export const Card = memo(function Card({
  row,
  columns,
  coverHeight = 0,
}: {
  row: ViewRow;
  columns: readonly Column[];
  coverHeight?: number;
}) {
  const { view } = useViewContext();
  const cover = view.config.layout.cover;
  return (
    <div className="flex flex-col overflow-hidden">
      {cover && coverHeight > 0 && (
        <div className="shrink-0 overflow-hidden bg-gray-50" style={{ height: coverHeight }}>
          {cover.type === "property" ? (
            <PropertyCover
              row={row}
              propertyId={cover.propertyId}
              fit={view.config.layout.coverFit ?? "cover"}
            />
          ) : (
            <PageCover rowId={row.id} fit={view.config.layout.coverFit ?? "cover"} />
          )}
        </div>
      )}
      <div className="flex flex-col gap-1 p-2">
        <span className="text-sm font-medium break-words text-gray-900">
          {row.title || <span className="text-gray-400">Untitled</span>}
        </span>
        {columns.slice(1).map((column) => {
          const value = rowValue(column.property, row);
          if (isEmptyValue(value) && column.property.type !== "checkbox") return null;
          return (
            <div
              key={column.property.id}
              className="flex min-w-0 text-xs"
              title={column.property.name}
            >
              <PropertyValueView
                property={column.property}
                value={value}
                related={relatedRows(column.property, row)}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
});

function useAttachmentUrl(item: string | null): string | null {
  const backend = useBackend();
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!item) return;
    if (isUrlLike(item)) {
      setUrl(item);
      return;
    }
    if (!isUuid(item)) return;
    let revoked = false;
    let made: string | null = null;
    void backend.attachments.url(item).then((u) => {
      if (revoked) {
        if (u?.startsWith("blob:")) URL.revokeObjectURL(u);
        return;
      }
      made = u;
      setUrl(u);
    });
    return () => {
      revoked = true;
      if (made?.startsWith("blob:")) URL.revokeObjectURL(made);
    };
  }, [backend, item]);
  return url;
}

function PropertyCover({
  row,
  propertyId,
  fit,
}: {
  row: ViewRow;
  propertyId: string;
  fit: string;
}) {
  const { definition } = useViewContext();
  const property = definition.properties.find((p) => p.id === propertyId);
  const value = property ? rowValue(property, row) : null;
  const first = Array.isArray(value) ? ((value[0] as string | undefined) ?? null) : null;
  const url = useAttachmentUrl(first);
  return url ? (
    <img
      src={url}
      alt=""
      className={`size-full ${fit === "contain" ? "object-contain" : "object-cover"}`}
    />
  ) : null;
}

const MARKDOWN_IMAGE = /!\[[^\]]*\]\(([^)\s]+)/;

function PageCover({ rowId, fit }: { rowId: string; fit: string }) {
  const { data } = useQuery("doc.get", { id: rowId, includeBody: true });
  const markdown = data[0]?.body?.markdown ?? "";
  const src = MARKDOWN_IMAGE.exec(markdown)?.[1] ?? null;
  if (!src) {
    const text = markdown.replace(/^---[\s\S]*?---\s*/, "").slice(0, 280);
    return <p className="p-2 text-[10px] leading-snug whitespace-pre-wrap text-gray-500">{text}</p>;
  }
  return (
    <img
      src={src}
      alt=""
      className={`size-full ${fit === "contain" ? "object-contain" : "object-cover"}`}
    />
  );
}
