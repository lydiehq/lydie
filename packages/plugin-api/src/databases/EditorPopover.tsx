// The popover a value editor opens in: over the value it edits rather than beside it, a little
// larger, so the value seems to lift out of its cell or row (as in Notion). Shared by the
// collection table's cells and the properties panel's rows.
import { AriaDialog, Popover } from "@lydie/ui";
import type { ReactNode, RefObject } from "react";

type Props = {
  anchor: RefObject<Element | null>;
  label: string;
  // The anchor's height (callers that lay out by model pass it; others measure the anchor).
  cover: number;
  onClose: () => void;
  children: ReactNode;
  // As wide as the anchor (text fields); otherwise the editor's own width (pickers).
  fill?: boolean;
  // The title is set in medium weight; its field matches.
  strong?: boolean;
  // Non-modal: the view behind still scrolls and takes hover, and focus leaving closes it (the
  // table, where a click on another cell moves the editor). Modal closes on any click outside.
  nonModal?: boolean;
};

export function EditorPopover({
  anchor,
  label,
  cover,
  onClose,
  children,
  fill = true,
  strong = false,
  nonModal = false,
}: Props) {
  return (
    <Popover
      triggerRef={anchor}
      isOpen
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      placement="bottom start"
      offset={-(cover + 3)}
      crossOffset={-5}
      isNonModal={nonModal}
      style={{ minHeight: cover + 6 }}
      className={`flex max-h-[70vh] flex-col justify-center overflow-auto !shadow-lift !animate-none ${fill ? "min-w-[max(12rem,calc(var(--trigger-width)+10px))]" : ""}`}
    >
      <AriaDialog
        aria-label={label}
        // The editor's own field needs no second frame: the popover is the frame.
        className={`outline-none [&>div>:is(textarea,input)]:!border-transparent [&>div>:is(textarea,input)]:!text-gray-950 ${fill ? "[&>div]:!w-full [&>div]:min-w-0" : ""} ${strong ? "[&>div>:is(textarea,input)]:font-medium" : ""}`}
      >
        {children}
      </AriaDialog>
    </Popover>
  );
}
