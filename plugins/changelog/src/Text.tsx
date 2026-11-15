import { segments } from "./entries/index.ts";

// An entry's text, with its `code` spans.
export function Text({ children }: { children: string }) {
  return segments(children).map((part, i) =>
    part.code ? (
      <code key={i} className="rounded bg-gray-950/5 px-1 py-px font-mono text-[0.875em]">
        {part.text}
      </code>
    ) : (
      part.text
    ),
  );
}

export function formatDate(iso: string, month: "long" | "short" = "long"): string {
  // Midday UTC, so the day is the same in every timezone.
  return new Date(`${iso}T12:00:00Z`).toLocaleDateString("en-US", {
    day: "numeric",
    month,
    year: month === "long" ? "numeric" : undefined,
    timeZone: "UTC",
  });
}
