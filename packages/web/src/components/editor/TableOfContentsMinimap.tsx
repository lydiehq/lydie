import type { Editor } from "@tiptap/core";
import type { TableOfContentDataItem } from "@tiptap/extension-table-of-contents";
import clsx from "clsx";
import { useCallback, useEffect, useMemo, useState } from "react";

interface Props {
  editor: Editor;
  containerRef: React.RefObject<HTMLDivElement | null>;
}

type MinimapLine = {
  id: string;
  heading: TableOfContentDataItem;
  headingCount: number;
  startIndex: number;
  endIndex: number;
};

// Width for each heading level (H1 = widest, H6 = narrowest)
const LEVEL_WIDTHS: Record<number, number> = {
  1: 24, // H1 - 24px wide
  2: 20, // H2 - 20px wide
  3: 16, // H3 - 16px wide
  4: 12, // H4 - 12px wide
  5: 10, // H5 - 10px wide
  6: 8, // H6 - 8px wide
};

const MAX_MINIMAP_LINES = 60;
const MIN_HEADINGS_TO_SHOW = 4;

export function TableOfContentsMinimap({ editor, containerRef }: Props) {
  const [headings, setHeadings] = useState<TableOfContentDataItem[]>([]);
  const [activeIndex, setActiveIndex] = useState<number>(-1);

  // Keep headings in sync with TipTap storage.
  useEffect(() => {
    const updateHeadings = () => {
      setHeadings(editor.storage.tableOfContents?.content || []);
    };

    updateHeadings();
    editor.on("update", updateHeadings);

    return () => {
      editor.off("update", updateHeadings);
    };
  }, [editor]);

  const minimapLines = useMemo<MinimapLine[]>(() => {
    if (headings.length <= MAX_MINIMAP_LINES) {
      return headings.map((heading, index) => ({
        id: heading.id,
        heading,
        headingCount: 1,
        startIndex: index,
        endIndex: index,
      }));
    }

    const bucketSize = Math.ceil(headings.length / MAX_MINIMAP_LINES);
    const lines: MinimapLine[] = [];

    for (let i = 0; i < headings.length; i += bucketSize) {
      const bucket = headings.slice(i, i + bucketSize);
      const firstHeading = bucket[0];
      const lastHeading = bucket.at(-1);

      if (!firstHeading || !lastHeading) {
        continue;
      }

      lines.push({
        id: `${firstHeading.id}-${lastHeading.id}`,
        heading: firstHeading,
        headingCount: bucket.length,
        startIndex: i,
        endIndex: i + bucket.length - 1,
      });
    }

    return lines;
  }, [headings]);

  const activeLineIndex = useMemo(
    () => minimapLines.findIndex((line) => activeIndex >= line.startIndex && activeIndex <= line.endIndex),
    [activeIndex, minimapLines],
  );

  // Track scroll position to highlight active heading
  useEffect(() => {
    const container = containerRef.current;
    if (!container || headings.length === 0) return;

    const handleScroll = () => {
      const containerRect = container.getBoundingClientRect();
      const scrollTop = container.scrollTop;

      // Find the heading closest to the top of the visible area
      let currentIndex = 0;
      let minDistance = Infinity;

      headings.forEach((heading, index) => {
        const element = document.getElementById(heading.id);
        if (element) {
          const elementTop = element.getBoundingClientRect().top - containerRect.top + scrollTop;
          const distance = Math.abs(elementTop - scrollTop - 100); // 100px offset from top

          if (distance < minDistance && elementTop <= scrollTop + 200) {
            minDistance = distance;
            currentIndex = index;
          }
        }
      });

      setActiveIndex(currentIndex);
    };

    container.addEventListener("scroll", handleScroll, { passive: true });
    handleScroll(); // Initial check

    return () => container.removeEventListener("scroll", handleScroll);
  }, [containerRef, headings]);

  // Navigate to a heading when clicked
  const navigateToHeading = useCallback((heading: TableOfContentDataItem) => {
    const element = document.getElementById(heading.id);
    if (element && containerRef.current) {
      const container = containerRef.current;
      const containerRect = container.getBoundingClientRect();
      const elementRect = element.getBoundingClientRect();

      // Calculate scroll position to center the heading slightly below the top
      const scrollTop = elementRect.top - containerRect.top + container.scrollTop - 100;

      container.scrollTo({
        top: Math.max(0, scrollTop),
        behavior: "smooth",
      });
    }
  }, [containerRef]);

  // Don't show minimap for short documents.
  if (headings.length < MIN_HEADINGS_TO_SHOW) {
    return null;
  }

  return (
    <div className="group fixed right-6 top-1/2 -translate-y-1/2 z-20 flex flex-col gap-1">
      {/* Minimap lines - always visible, compact representation */}
      <div className="flex flex-col items-end gap-1.5 pr-4">
        {minimapLines.map((line, index) => {
          const isActive = index === activeLineIndex;
          const width = LEVEL_WIDTHS[line.heading.level] || 10;

          return (
            <button
              key={line.id}
              onClick={() => navigateToHeading(line.heading)}
              className={clsx(
                "h-0.5 rounded-sm transition-all duration-200",
                "hover:opacity-80 focus:outline-none",
                isActive ? "bg-gray-800" : "bg-black/10 hover:bg-black/20",
              )}
              style={{ width: `${width}px` }}
              title={
                line.headingCount > 1
                  ? `${line.heading.textContent} (+${line.headingCount - 1} more)`
                  : line.heading.textContent
              }
            />
          );
        })}
      </div>

      {/* Invisible bridge to prevent dead zone between minimap and panel */}
      <div className="absolute right-full top-0 bottom-0 w-4 z-10" />

      {/* Expanded panel on hover - shows text labels */}
      <div
        className={clsx(
          "absolute right-[calc(100%+0.5rem)] top-1/2 -translate-y-1/2 w-56 max-h-[80vh] overflow-y-auto",
          "bg-white/95 backdrop-blur-sm rounded-lg shadow-lg border border-gray-200/80",
          "transition-all duration-200 ease-out origin-right",
          "opacity-0 scale-95 translate-x-4 pointer-events-none",
          "group-hover:opacity-100 group-hover:scale-100 group-hover:translate-x-0 group-hover:pointer-events-auto",
        )}
      >
        <div className="py-2 px-2">
          <nav className="flex flex-col gap-0.5">
            {minimapLines.map((line, index) => {
              const isActive = index === activeLineIndex;
              const headingLabel =
                line.headingCount > 1
                  ? `${line.heading.textContent} (+${line.headingCount - 1})`
                  : line.heading.textContent;

              return (
                <button
                  key={line.id}
                  onClick={() => navigateToHeading(line.heading)}
                  className={clsx(
                    "text-left text-xs py-1 px-2 rounded transition-all duration-150",
                    "hover:bg-gray-100 focus:outline-none focus:bg-gray-100 truncate",
                    isActive ? "text-gray-900 font-medium bg-gray-50" : "text-gray-500 font-normal",
                    line.heading.level === 1 && "pl-2",
                    line.heading.level === 2 && "pl-3",
                    line.heading.level === 3 && "pl-4",
                    line.heading.level === 4 && "pl-5",
                    line.heading.level === 5 && "pl-6",
                  )}
                  title={headingLabel}
                >
                  {headingLabel}
                </button>
              );
            })}
          </nav>
        </div>
      </div>
    </div>
  );
}
