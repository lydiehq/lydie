import type { Editor } from "@tiptap/core";
import type { TableOfContentDataItem } from "@tiptap/extension-table-of-contents";

import clsx from "clsx";
import { useEffect, useState } from "react";

interface Props {
  editor: Editor;
  containerRef: React.RefObject<HTMLDivElement | null>;
}

// Width for each heading level (H1 = widest, H6 = narrowest)
const LEVEL_WIDTHS: Record<number, number> = {
  1: 24, // H1 - 24px wide
  2: 20, // H2 - 20px wide
  3: 16, // H3 - 16px wide
  4: 12, // H4 - 12px wide
  5: 10, // H5 - 10px wide
  6: 8, // H6 - 8px wide
};

export function TableOfContentsMinimap({ editor, containerRef }: Props) {
  const [headings, setHeadings] = useState<TableOfContentDataItem[]>([]);
  const [activeIndex, setActiveIndex] = useState<number>(0);
  const [isHovered, setIsHovered] = useState(false);

  // Subscribe to heading updates from the TableOfContents extension
  useEffect(() => {
    const storage = editor.storage.tableOfContents;
    if (!storage) return;

    const updateHeadings = () => {
      setHeadings(storage.content || []);
    };

    // Initial update
    updateHeadings();

    // Set up onUpdate callback via extension options
    const tableOfContentsExtension = editor.extensionManager.extensions.find(
      (ext) => ext.name === "tableOfContents",
    );

    if (tableOfContentsExtension) {
      const originalOnUpdate = tableOfContentsExtension.options.onUpdate;
      tableOfContentsExtension.options.onUpdate = (
        content: TableOfContentDataItem[],
        isCreate: boolean,
      ) => {
        setHeadings(content);
        if (originalOnUpdate) {
          originalOnUpdate(content, isCreate);
        }
      };
    }

    return () => {
      // Cleanup not needed as extension persists with editor
    };
  }, [editor]);

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

    container.addEventListener("scroll", handleScroll);
    handleScroll(); // Initial check

    return () => container.removeEventListener("scroll", handleScroll);
  }, [containerRef, headings]);

  // Navigate to a heading when clicked
  const navigateToHeading = (heading: TableOfContentDataItem) => {
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
  };

  // Don't show if no headings
  if (headings.length === 0) {
    return null;
  }

  return (
    <div
      className="fixed top-1/2 -translate-y-1/2 z-20 flex flex-col gap-1"
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      {/* Minimap lines - always visible, compact representation */}
      <div className="flex flex-col gap-1.5 pl-4">
        {headings.map((heading, index) => {
          const isActive = index === activeIndex;
          const width = LEVEL_WIDTHS[heading.level] || 10;

          return (
            <button
              key={heading.id}
              onClick={() => navigateToHeading(heading)}
              className={clsx(
                "h-0.5 rounded-sm transition-all duration-200",
                "hover:opacity-80 focus:outline-none",
                isActive ? "bg-gray-800" : "bg-black/10 hover:bg-black/20",
              )}
              style={{ width: `${width}px` }}
              title={heading.textContent}
            />
          );
        })}
      </div>

      {/* Invisible bridge to prevent dead zone between minimap and panel */}
      <div className="absolute left-full top-0 bottom-0 w-4 z-10" />

      {/* Expanded panel on hover - shows text labels */}
      <div
        className={clsx(
          "absolute left-[calc(100%+0.5rem)] top-1/2 -translate-y-1/2 w-56 max-h-[80vh] overflow-y-auto",
          "bg-white/95 backdrop-blur-sm rounded-lg shadow-lg border border-gray-200/80",
          "transition-all duration-200 ease-out origin-left",
          isHovered
            ? "opacity-100 scale-100 translate-x-0"
            : "opacity-0 scale-95 -translate-x-4 pointer-events-none",
        )}
      >
        <div className="py-2 px-2">
          <nav className="flex flex-col gap-0.5">
            {headings.map((heading, index) => {
              const isActive = index === activeIndex;

              return (
                <button
                  key={heading.id}
                  onClick={() => navigateToHeading(heading)}
                  className={clsx(
                    "text-left text-xs py-1 px-2 rounded transition-all duration-150",
                    "hover:bg-gray-100 focus:outline-none focus:bg-gray-100 truncate",
                    isActive ? "text-gray-900 font-medium bg-gray-50" : "text-gray-500 font-normal",
                    heading.level === 1 && "pl-2",
                    heading.level === 2 && "pl-3",
                    heading.level === 3 && "pl-4",
                    heading.level === 4 && "pl-5",
                    heading.level === 5 && "pl-6",
                  )}
                  title={heading.textContent}
                >
                  {heading.textContent}
                </button>
              );
            })}
          </nav>
        </div>
      </div>
    </div>
  );
}
