import clsx from "clsx";

// A collection: a small table, a header row over two rows of cells, on the same paper as DocumentThumbnailIcon.
export function CollectionItemIcon({ className }: { className?: string }) {
  return (
    <span
      aria-hidden
      className={clsx(
        "flex size-3.5 flex-col overflow-hidden rounded-[3px] bg-paper shadow-surface",
        className,
      )}
    >
      <span className="block h-[4px] shrink-0 border-b border-gray-950/25 bg-gray-950/10" />
      {Array.from({ length: 2 }).map((_, i) => (
        <span key={i} className="flex grow border-b border-gray-950/25 last:border-b-0">
          <span className="block w-[5px] border-r border-gray-950/25" />
        </span>
      ))}
    </span>
  );
}
