import clsx from "clsx";

// Numina's sidebar toggle: a window whose panel is full width while collapsed and half width while
// open. Drawn on a 24px grid with a 2px stroke.
export function SidebarIcon({ right, collapsed }: { right?: boolean; collapsed?: boolean }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden xmlns="http://www.w3.org/2000/svg" className="size-4.25">
      <rect
        x="3"
        y="4"
        width="18"
        height="16"
        rx="3"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
      />
      <rect
        x={right ? 14 : 6}
        y="7"
        width="4"
        height="10"
        rx="1"
        fill="currentColor"
        className={clsx(
          "transition-transform duration-150 [transform-box:fill-box]",
          right ? "origin-right" : "origin-left",
          !collapsed && "scale-x-50",
        )}
      />
    </svg>
  );
}
