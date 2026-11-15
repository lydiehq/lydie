import { useEffect, useState, useSyncExternalStore } from "react";
import type { TooltipTriggerState } from "react-stately/useTooltipTriggerState";

// The open/close timing of hover cards: react-stately's tooltip trigger state (a rest before the
// first one opens, the next at once while one is open or was a moment ago, one open at a time),
// with a warm-up of its own. Tooltips keep theirs, so a tooltip neither makes the next card
// instant nor is closed by one, and the other way round.
const COOLDOWN = 500;

type Close = (immediate?: boolean, instant?: boolean) => void;

const openCards = new Map<object, Close>();
let warmedUp = false;
let warmUpTimer: ReturnType<typeof setTimeout> | null = null;
let cooldownTimer: ReturnType<typeof setTimeout> | null = null;

const clearWarmUp = () => {
  if (warmUpTimer) clearTimeout(warmUpTimer);
  warmUpTimer = null;
};
const clearCooldown = () => {
  if (cooldownTimer) clearTimeout(cooldownTimer);
  cooldownTimer = null;
};

// After a key press, a card that was just open does not make the next one instant.
export function coolDown() {
  clearWarmUp();
  clearCooldown();
  warmedUp = false;
}

// Whether the pointer is really being moved. Rows that scroll or shift under a still pointer get
// enter events too, and a card should not open for those; nor while the pointer rests on the
// sidebar during typing. An event counts as a move when its position differs from the last one.
let lastPointer: { x: number; y: number } | null = null;
let pointerMoved = false;
const keyListeners = new Set<() => void>();
let tracking = false;

// Keys that are part of a click (Mod+click, Shift+click) do not count as typing.
const MODIFIERS = new Set(["Shift", "Control", "Alt", "Meta", "CapsLock", "Fn"]);

function track(event: globalThis.PointerEvent) {
  if (event.pointerType === "touch") return;
  pointerMoved =
    lastPointer !== null && (lastPointer.x !== event.clientX || lastPointer.y !== event.clientY);
  lastPointer = { x: event.clientX, y: event.clientY };
}

function startTracking() {
  if (tracking || typeof window === "undefined") return;
  tracking = true;
  // Capture on the window runs before React's handlers at the root, so a trigger's enter and move
  // handlers see this event's answer. React's enter comes from `pointerover`.
  window.addEventListener("pointerover", track, true);
  window.addEventListener("pointermove", track, true);
  window.addEventListener(
    "keydown",
    (event) => {
      if (MODIFIERS.has(event.key)) return;
      pointerMoved = false;
      for (const listener of [...keyListeners]) listener();
    },
    true,
  );
}

export function didPointerMove() {
  return pointerMoved;
}

// Calls `listener` on every key press that is not a modifier; returns the unsubscribe.
export function onKeyPress(listener: () => void) {
  startTracking();
  keyListeners.add(listener);
  return () => void keyListeners.delete(listener);
}

type Snapshot = { isOpen: boolean; shouldSkipAnimation: boolean };

function createCardState() {
  const key = {};
  const listeners = new Set<() => void>();
  let snapshot: Snapshot = { isOpen: false, shouldSkipAnimation: false };
  let closeTimer: ReturnType<typeof setTimeout> | null = null;
  const options = { delay: 750, closeDelay: 150 };

  const set = (isOpen: boolean, instant: boolean) => {
    if (snapshot.isOpen === isOpen && snapshot.shouldSkipAnimation === instant) return;
    snapshot = { isOpen, shouldSkipAnimation: instant };
    for (const listener of [...listeners]) listener();
  };
  const clearClose = () => {
    if (closeTimer) clearTimeout(closeTimer);
    closeTimer = null;
  };

  // The card this one replaces goes without its exit animation.
  const closeOthers = () => {
    for (const [other, closeOther] of openCards) {
      if (other === key) continue;
      closeOther(true, true);
      openCards.delete(other);
    }
  };

  const show = (instant: boolean) => {
    clearClose();
    closeOthers();
    openCards.set(key, close);
    warmedUp = true;
    clearWarmUp();
    clearCooldown();
    set(true, instant);
  };

  const close: Close = (immediate = false, instant = false) => {
    if (immediate || options.closeDelay <= 0) {
      clearClose();
      set(false, instant);
    } else if (!closeTimer && snapshot.isOpen) {
      closeTimer = setTimeout(() => {
        closeTimer = null;
        set(false, instant);
      }, options.closeDelay);
    }
    clearWarmUp();
    if (warmedUp) {
      clearCooldown();
      cooldownTimer = setTimeout(
        () => {
          openCards.delete(key);
          cooldownTimer = null;
          warmedUp = false;
        },
        Math.max(COOLDOWN, options.closeDelay),
      );
    }
  };

  const open = (immediate = false) => {
    if (immediate || options.delay <= 0 || closeTimer) {
      show(warmedUp);
      return;
    }
    closeOthers();
    openCards.set(key, close);
    if (snapshot.isOpen) return;
    if (warmedUp) {
      show(true);
      return;
    }
    clearWarmUp();
    warmUpTimer = setTimeout(() => {
      warmUpTimer = null;
      show(false);
    }, options.delay);
  };

  return {
    setOptions: (delay: number, closeDelay: number) => {
      options.delay = delay;
      options.closeDelay = closeDelay;
    },
    open,
    close,
    getSnapshot: () => snapshot,
    subscribe: (listener: () => void) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    dispose: () => {
      // Gone while open (its row scrolled out of a virtualised list): cool down as if it closed,
      // or every card after it would open at once.
      if (snapshot.isOpen) close(true, true);
      clearClose();
      // The pending warm-up is this card's when it is the one waiting.
      if (openCards.get(key) === close && !snapshot.isOpen) clearWarmUp();
      openCards.delete(key);
    },
  };
}

export function useHoverCardState({
  delay,
  closeDelay,
}: {
  delay: number;
  closeDelay: number;
}): TooltipTriggerState {
  const [card] = useState(createCardState);
  useEffect(() => card.setOptions(delay, closeDelay), [card, delay, closeDelay]);
  useEffect(() => card.dispose, [card]);
  const { isOpen, shouldSkipAnimation } = useSyncExternalStore(
    card.subscribe,
    card.getSnapshot,
    card.getSnapshot,
  );
  return { isOpen, shouldSkipAnimation, open: card.open, close: card.close };
}
