// A vertical list of things that happened: who, what, when. Each event is a 20 px column for the
// actor's avatar or an icon, joined to the next event by a hairline, and the sentence beside it
// with the time at the right (the full date in its tooltip).
/* oxlint-disable jsx-a11y/prefer-tag-over-role, jsx-a11y/no-noninteractive-tabindex -- the time is
   focusable so its tooltip (the full date) reaches keyboard users; it reads as its label */
import clsx from "clsx";
import type { ComponentProps, ReactNode } from "react";

import { WithTooltip } from "../components/Tooltip";

export function Timeline({ className, ...props }: ComponentProps<"ol">) {
  return <ol className={clsx("w-full", className)} {...props} />;
}

// How the time beside an event reads: "5 minutes ago", "14:05", or "12 Nov" ("12 Nov 2025" in
// another year). `time` suits lists grouped by day, where the date would repeat the heading.
export type TimelineTimeFormat = "relative" | "time" | "date";

export function formatTimelineTime(
  iso: string,
  format: TimelineTimeFormat,
  now: Date = new Date(),
): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  if (format === "time")
    return new Intl.DateTimeFormat(undefined, { timeStyle: "short" }).format(date);
  if (format === "relative") {
    const seconds = Math.round((date.getTime() - now.getTime()) / 1000);
    if (Math.abs(seconds) < 60) return "Just now";
    const rtf = new Intl.RelativeTimeFormat(undefined, { numeric: "auto" });
    const minutes = Math.round(seconds / 60);
    if (Math.abs(minutes) < 60) return rtf.format(minutes, "minute");
    const hours = Math.round(minutes / 60);
    if (Math.abs(hours) < 24) return rtf.format(hours, "hour");
  }
  return new Intl.DateTimeFormat(undefined, {
    day: "numeric",
    month: "short",
    ...(date.getFullYear() === now.getFullYear() ? {} : { year: "numeric" }),
  }).format(date);
}

export function formatTimelineDate(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(
    date,
  );
}

type TimelineEventProps = Omit<ComponentProps<"li">, "children"> & {
  // The left column: an `Avatar` (size 20) or an icon, drawn in a 20 px box.
  icon: ReactNode;
  // Who did it, in medium weight before the action.
  actor?: ReactNode;
  // What they did, muted after the name (or the whole line when there is no actor).
  action: ReactNode;
  // ISO timestamp, shown at the right in `timeFormat`, in full in its tooltip.
  timestamp: string;
  timeFormat?: TimelineTimeFormat;
  // More under the line: a list of changes, a note.
  details?: ReactNode;
  now?: Date;
};

export function TimelineEvent({
  icon,
  actor,
  action,
  timestamp,
  timeFormat = "date",
  details,
  now,
  className,
  ...props
}: TimelineEventProps) {
  const full = formatTimelineDate(timestamp);
  return (
    <li
      className={clsx(
        "group/timeline-item grid grid-cols-[1.25rem_minmax(0,1fr)] gap-3",
        className,
      )}
      {...props}
    >
      <div className="relative flex justify-center">
        <div
          aria-hidden
          className="absolute top-7 bottom-1 left-1/2 w-px -translate-x-1/2 bg-gray-950/10 group-last/timeline-item:hidden"
        />
        <div
          data-slot="timeline-icon"
          className="relative flex size-5 shrink-0 items-center justify-center text-gray-500 [&>svg:not([data-avatar])]:size-4"
        >
          {icon}
        </div>
      </div>
      <div className="min-w-0 pb-6 group-last/timeline-item:pb-0">
        <div className="flex min-w-0 items-start gap-4 text-sm leading-5 text-gray-900">
          <div className="min-w-0 flex-1 break-words">
            {actor && <span className="font-medium">{actor} </span>}
            <span className={actor ? "text-gray-500" : "font-medium"}>{action}</span>
          </div>
          <WithTooltip label={full} placement="top" offset={8}>
            <time
              dateTime={timestamp}
              aria-label={full}
              role="img"
              tabIndex={0}
              className="shrink-0 rounded-xs whitespace-nowrap text-gray-500"
            >
              {formatTimelineTime(timestamp, timeFormat, now)}
            </time>
          </WithTooltip>
        </div>
        {details && <div className="mt-3 min-w-0">{details}</div>}
      </div>
    </li>
  );
}
