import React from "react";
import {
  composeRenderProps,
  Focusable,
  OverlayArrow,
  Tooltip as AriaTooltip,
  TooltipContext,
  type TooltipProps as AriaTooltipProps,
  TooltipTrigger as AriaTooltipTrigger,
  type TooltipTriggerComponentProps,
  TooltipTriggerStateContext,
  useSlottedContext,
} from "react-aria-components";
import { tv } from "tailwind-variants";

export interface TooltipProps extends Omit<AriaTooltipProps, "children"> {
  children: React.ReactNode;
  // Key caps of the shortcut that does the same: ["⌘", "K"], or one list per step of a sequence
  // ([["G"], ["H"]] reads "G then H"). null or empty shows none.
  hotkeys?: Hotkeys | null;
}

export type Hotkeys = readonly string[] | readonly (readonly string[])[];

function stepsOf(hotkeys: Hotkeys): (readonly string[])[] {
  if (hotkeys.length === 0) return [];
  return typeof hotkeys[0] === "string"
    ? [hotkeys as readonly string[]]
    : [...(hotkeys as readonly (readonly string[])[])];
}

// macOS caps are symbols and run together ("⌘⇧P"); elsewhere they are words ("Ctrl+Shift+P").
function chordText(caps: readonly string[]): string {
  return caps.slice(0, -1).some((cap) => cap.length > 1) ? caps.join("+") : caps.join("");
}

// A shortcut as muted text beside a label: "⌘K", "G then H". Also usable outside tooltips.
export function KeyCaps({ hotkeys, className }: { hotkeys: Hotkeys; className?: string }) {
  const steps = stepsOf(hotkeys);
  return (
    <span className={`flex items-center gap-1 opacity-55 ${className ?? ""}`}>
      {steps.map((caps, step) => (
        <React.Fragment key={step}>
          {step > 0 && <span>then</span>}
          <kbd className="font-sans">{chordText(caps)}</kbd>
        </React.Fragment>
      ))}
    </span>
  );
}

// As React Aria's own docs: in and out by fading and sliding 4 px from the trigger. A tooltip that
// replaces another during the warm-up skips both (react-aria's `shouldSkipAnimation`).
const hidden =
  "opacity-0 placement-top:translate-y-1 placement-bottom:-translate-y-1 placement-left:translate-x-1 placement-right:-translate-x-1";
const styles = tv({
  base: "group bg-black/85 text-white text-[12px] rounded-sm will-change-transform px-2 py-0.5 transition-[translate,opacity] duration-200 ease-out motion-reduce:transition-none",
  variants: {
    isEntering: { true: hidden },
    isExiting: { true: `${hidden} duration-150 ease-in` },
  },
});

// React Aria repositions an open tooltip whenever its trigger resizes, and a trigger that stops
// being drawn (`display: none`, such as a tree row's hover actions once the pointer leaves the row)
// measures as an empty box at the window's top left. Put the tooltip away at once instead.
function useCloseWithTrigger(
  triggerRef: React.RefObject<Element | null> | undefined,
  tooltipRef: React.RefObject<HTMLDivElement | null>,
) {
  const state = React.useContext(TooltipTriggerStateContext);
  const isOpen = state?.isOpen ?? false;
  React.useLayoutEffect(() => {
    const trigger = triggerRef?.current;
    if (!isOpen || !state || !trigger) return;
    const check = () => {
      if (trigger.checkVisibility()) return;
      // Before the next paint, and with no exit animation to run where it was put.
      tooltipRef.current?.style.setProperty("display", "none");
      state.close(true);
    };
    check();
    const observer = new ResizeObserver(check);
    observer.observe(trigger);
    return () => observer.disconnect();
  }, [isOpen, state, triggerRef, tooltipRef]);
}

// Pressing the trigger closes the tooltip, and a toggle relabels itself on that press ("Collapse
// sidebar" → "Expand sidebar"): the tooltip fading out would read the new label. It keeps what it
// said while open.
function useHeldWhileClosing<T>(value: T, isOpen: boolean): T {
  const [held, setHeld] = React.useState(value);
  if (isOpen && held !== value) setHeld(value);
  return isOpen ? value : held;
}

export function Tooltip({ children, hotkeys, offset = 14, ...props }: TooltipProps) {
  const ref = React.useRef<HTMLDivElement>(null);
  const context = useSlottedContext(TooltipContext);
  useCloseWithTrigger(props.triggerRef ?? context?.triggerRef, ref);
  const state = React.useContext(TooltipTriggerStateContext);
  const isOpen = state ? state.isOpen : true;
  const label = useHeldWhileClosing(children, isOpen);
  const keys = useHeldWhileClosing(hotkeys, isOpen);
  return (
    <AriaTooltip
      {...props}
      ref={ref}
      offset={offset}
      className={composeRenderProps(props.className, (className, renderProps) =>
        styles({ ...renderProps, className }),
      )}
    >
      <OverlayArrow>
        <svg
          width={8}
          height={8}
          viewBox="0 0 8 8"
          className="fill-black/85 forced-colors:fill-[Canvas] group-placement-bottom:rotate-180 group-placement-left:-rotate-90 group-placement-right:rotate-90"
        >
          <path d="M0 0 L4 4 L8 0" />
        </svg>
      </OverlayArrow>
      <div className="flex items-center gap-2">
        <span>{label}</span>
        {keys && keys.length > 0 && <KeyCaps hotkeys={keys} />}
      </div>
    </AriaTooltip>
  );
}

export function TooltipTrigger({ children, ...props }: TooltipTriggerComponentProps) {
  return (
    <AriaTooltipTrigger {...props} delay={props.delay || 200} closeDelay={props.closeDelay || 0}>
      {children}
    </AriaTooltipTrigger>
  );
}

export type TooltipOptions = Pick<TooltipProps, "placement" | "offset" | "hotkeys"> & {
  delay?: number;
};

type WithTooltipProps = TooltipOptions & {
  label: React.ReactNode;
  // One focusable host element, e.g. a plain <button>. A `Button` takes `tooltip` instead.
  children: React.ComponentProps<typeof Focusable>["children"];
};

// A tooltip for an element that is not a react-aria component.
export function WithTooltip({ label, children, delay, ...options }: WithTooltipProps) {
  return (
    <TooltipTrigger delay={delay ?? 500}>
      <Focusable>{children}</Focusable>
      <Tooltip {...options}>{label}</Tooltip>
    </TooltipTrigger>
  );
}
