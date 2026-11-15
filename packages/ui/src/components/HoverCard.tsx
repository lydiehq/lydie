import { useEffect, useRef } from "react";
import type { PointerEvent, ReactNode, RefObject } from "react";
import {
  composeRenderProps,
  Popover as AriaPopover,
  type PopoverProps as AriaPopoverProps,
} from "react-aria-components";
import { usePreviewTrigger } from "react-aria/usePreviewTrigger";
import type { TooltipTriggerState } from "react-stately/useTooltipTriggerState";
import { tv } from "tailwind-variants";

import { coolDown, didPointerMove, onKeyPress, useHoverCardState } from "./hover-card-state";

export type HoverCardOptions = {
  // Rest on the trigger before the card opens, and how long it lingers once the pointer is
  // neither on the trigger, on the card, nor on the way from one to the other.
  delay?: number;
  closeDelay?: number;
  // Closes the card and stops it opening, e.g. while the trigger is being renamed or dragged.
  isDisabled?: boolean;
};

export type HoverCardTriggerProps<T extends HTMLElement> = {
  ref: RefObject<T | null>;
  onPointerEnter?: (event: PointerEvent<T>) => void;
  onPointerMove?: (event: PointerEvent<T>) => void;
  onPointerLeave?: (event: PointerEvent<T>) => void;
  onPointerDown?: (event: PointerEvent<T>) => void;
};

export type HoverCardControls<T extends HTMLElement> = {
  // Spread on the element to hover. Hover handlers and a ref only: the element keeps its own
  // role and attributes, so a tree row's aria-expanded still means its children.
  triggerProps: HoverCardTriggerProps<T>;
  isOpen: boolean;
  // Closes at once; the pointer has to leave the trigger and come back to open it again.
  close: () => void;
  // For controls inside the trigger that have tooltips of their own: `pause` when the pointer
  // goes onto one (the card closes and does not open there), `resume` when it comes back onto the
  // rest of the trigger (the card's rest starts over).
  pause: () => void;
  resume: () => void;
  state: TooltipTriggerState;
  triggerRef: RefObject<T | null>;
  cardRef: RefObject<HTMLDivElement | null>;
};

// React Aria's preview trigger (PreviewTrigger in react-aria-components) without its focus and
// long-press parts: a card that opens after a rest, stays open while the pointer travels onto it
// (a safe area between trigger and card, so a diagonal move does not close it), and opens at once
// when another hover card was open a moment ago. Tooltips are timed apart (`hover-card-state.ts`):
// one that was just open does not make the card instant. A press or Escape puts it away.
//
// The rest only starts once the pointer really moves on the trigger: a row that scrolls or shifts
// under a still pointer does not count, and neither does one the pointer rests on while typing.
// A key press puts the card away until the pointer moves again.
export function useHoverCard<T extends HTMLElement = HTMLElement>({
  delay = 750,
  closeDelay = 150,
  isDisabled = false,
}: HoverCardOptions = {}): HoverCardControls<T> {
  const state = useHoverCardState({ delay, closeDelay });
  const triggerRef = useRef<T | null>(null);
  const cardRef = useRef<HTMLDivElement | null>(null);
  // "away": off the trigger, or pressed since it came on; "waiting": on it, for a real move;
  // "armed": the rest has started or the card is open; "paused": on a control with a tooltip.
  const phase = useRef<"away" | "waiting" | "armed" | "paused">("away");
  const arm = () => {
    if (isDisabled) return;
    phase.current = "armed";
    state.open();
  };
  const { triggerProps } = usePreviewTrigger(
    { triggerRef, popoverRef: cardRef, isDisabled },
    {
      ...state,
      // React Aria asks without `immediate` when the hover starts, and with it to keep the card
      // open while the pointer is on its way to it.
      open: (immediate) => {
        if (immediate) state.open(true);
        else if (didPointerMove()) arm();
      },
    },
  );

  const isOpen = state.isOpen;
  useEffect(
    () =>
      onKeyPress(() => {
        if (phase.current === "armed") phase.current = "waiting";
        if (phase.current === "waiting" || isOpen) {
          state.close(true);
          coolDown();
        }
      }),
    [isOpen, state],
  );
  useEffect(() => {
    if (isDisabled && isOpen) state.close(true);
  }, [isDisabled, isOpen, state]);

  useEffect(() => {
    if (!isOpen) return;
    // The trigger usually does not have focus (a tree row under aria-activedescendant), so Escape
    // is heard on the window rather than on the trigger.
    const onKey = (event: globalThis.KeyboardEvent) => {
      if (event.key === "Escape") state.close(true);
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [isOpen, state]);

  return {
    triggerProps: {
      ref: triggerRef,
      onPointerEnter: (event) => {
        if (event.pointerType !== "touch") phase.current = "waiting";
        triggerProps.onPointerEnter?.(event);
      },
      onPointerMove: (event) => {
        if (isDisabled || phase.current !== "waiting" || !didPointerMove()) return;
        // Through React Aria's hover again: it may have ignored the enter (keyboard modality right
        // after typing), and it only keeps the card open on the way to it for a hover it saw.
        triggerProps.onPointerLeave?.(event);
        triggerProps.onPointerEnter?.(event);
      },
      onPointerLeave: (event) => {
        phase.current = "away";
        triggerProps.onPointerLeave?.(event);
      },
      onPointerDown: () => {
        phase.current = "away";
        state.close(true);
      },
    },
    isOpen,
    close: () => state.close(true),
    pause: () => {
      phase.current = "paused";
      state.close(true);
    },
    resume: () => arm(),
    state,
    triggerRef,
    cardRef,
  };
}

const styles = tv({
  base: "flex max-h-[min(420px,70vh)] w-[380px] max-w-[calc(100vw-16px)] flex-col overflow-hidden rounded-lg bg-elevated text-gray-700 shadow-popover origin-(--trigger-anchor-point)",
  variants: {
    isEntering: {
      true: "animate-in fade-in motion-safe:zoom-in-97 duration-150 ease-out-strong",
    },
    isExiting: {
      true: "animate-out fade-out motion-safe:zoom-out-97 duration-150 ease-out-strong",
    },
  },
});

export type HoverCardProps<T extends HTMLElement> = Omit<
  AriaPopoverProps,
  "children" | "triggerRef" | "isOpen" | "defaultOpen" | "onOpenChange" | "isNonModal" | "trigger"
> & {
  hover: HoverCardControls<T>;
  children: ReactNode;
};

// The card for `useHoverCard`: a non-modal React Aria popover that fades in beside the trigger
// (and out again), and swaps without animating when the pointer moves between triggers.
export function HoverCard<T extends HTMLElement>({
  hover,
  className,
  children,
  ...props
}: HoverCardProps<T>) {
  const { state, cardRef, triggerRef } = hover;
  return (
    <AriaPopover
      placement="right top"
      {...props}
      ref={cardRef}
      triggerRef={triggerRef}
      isNonModal
      isOpen={state.isOpen}
      onOpenChange={(open) => (open ? state.open(true) : state.close(true))}
      shouldSkipAnimation={state.shouldSkipAnimation}
      className={composeRenderProps(className, (className, renderProps) =>
        styles({ ...renderProps, className }),
      )}
    >
      {children}
    </AriaPopover>
  );
}
