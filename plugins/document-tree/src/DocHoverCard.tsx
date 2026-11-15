// The card beside a tree row after a hover rest (`DocCard`: cover, icon, title, the opening lines
// and a line of facts). The pointer can move onto it (to read on, or select text) without it
// closing; the row stays the thing to click. The row's own entry draws the header at once; only the
// body is queried.
import { DOC_CARD_CLASS, DocCard } from "@lydie/plugin-api";
import type { ChildEntry } from "@lydie/plugin-api";
import { HoverCard } from "@lydie/plugin-api/ui";
import type { HoverCardControls } from "@lydie/plugin-api/ui";

// The rectangle to sit beside: the row, widened to the sidebar's edge so the card clears it.
function besideSidebar(el: Element): DOMRect {
  const row = el.getBoundingClientRect();
  const edge = el.closest("nav")?.getBoundingClientRect().right ?? row.right;
  return new DOMRect(row.left, row.top, Math.max(row.width, edge - row.left), row.height);
}

type Props = {
  doc: ChildEntry;
  hover: HoverCardControls<HTMLDivElement>;
};

export function DocHoverCard({ doc, hover }: Props) {
  return (
    <HoverCard
      hover={hover}
      getTargetRect={besideSidebar}
      offset={8}
      data-testid="doc-hover-card"
      className={DOC_CARD_CLASS}
    >
      <DocCard id={doc.id} entry={doc} />
    </HoverCard>
  );
}
