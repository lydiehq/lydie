import { atom, useAtomValue, useSetAtom } from "jotai";
import { useCallback } from "react";

import {
  isFloatingAssistantDockedAtom,
  isFloatingAssistantOpenAtom,
} from "@/atoms/workspace-settings";

// Derived state
export const isMinimizedAtom = atom((get) => {
  const isDocked = get(isFloatingAssistantDockedAtom);
  const isOpen = get(isFloatingAssistantOpenAtom);
  return !isDocked && !isOpen;
});

// For cross-component communication (e.g., onboarding tasks)
export const pendingMessageAtom = atom<string | undefined>(undefined);

// Internal atom to track if assistant was previously docked
const wasDockedAtom = atom<boolean>(false);

// Actions
export const openAssistantAtom = atom(null, (get, set, message?: string) => {
  if (get(wasDockedAtom)) {
    set(isFloatingAssistantDockedAtom, true);
    set(wasDockedAtom, false);
  }
  set(isFloatingAssistantOpenAtom, true);
  if (message) {
    set(pendingMessageAtom, message);
  }
});

export const closeAssistantAtom = atom(null, (get, set) => {
  const isDocked = get(isFloatingAssistantDockedAtom);
  if (isDocked) {
    set(wasDockedAtom, true);
    set(isFloatingAssistantDockedAtom, false);
  }
  set(isFloatingAssistantOpenAtom, false);
});

export const toggleAssistantAtom = atom(null, (get, set) => {
  const wasOpen = get(isFloatingAssistantOpenAtom);
  const newValue = !wasOpen;

  set(isFloatingAssistantOpenAtom, newValue);

  if (newValue && get(wasDockedAtom)) {
    set(isFloatingAssistantDockedAtom, true);
    set(wasDockedAtom, false);
  }
});

export const dockAssistantAtom = atom(null, (_get, set) => {
  set(isFloatingAssistantDockedAtom, true);
  set(isFloatingAssistantOpenAtom, true);
  set(wasDockedAtom, false);
});

export const undockAssistantAtom = atom(null, (_get, set) => {
  set(isFloatingAssistantDockedAtom, false);
  set(wasDockedAtom, false);
});

export const clearPendingMessageAtom = atom(null, (_get, set) => {
  set(pendingMessageAtom, undefined);
});

// Hook interface
export interface UseFloatingAssistantReturn {
  isOpen: boolean;
  isDocked: boolean;
  isMinimized: boolean;
  open: () => void;
  close: () => void;
  toggle: () => void;
  dock: () => void;
  undock: () => void;
  openAndSendMessage: (message: string) => void;
}

export function useFloatingAssistant(): UseFloatingAssistantReturn {
  const isOpen = useAtomValue(isFloatingAssistantOpenAtom);
  const isDocked = useAtomValue(isFloatingAssistantDockedAtom);
  const isMinimized = useAtomValue(isMinimizedAtom);

  const openAssistant = useSetAtom(openAssistantAtom);
  const closeAssistant = useSetAtom(closeAssistantAtom);
  const toggleAssistant = useSetAtom(toggleAssistantAtom);
  const dockAssistant = useSetAtom(dockAssistantAtom);
  const undockAssistant = useSetAtom(undockAssistantAtom);

  const open = useCallback(() => {
    openAssistant();
  }, [openAssistant]);

  const close = useCallback(() => {
    closeAssistant();
  }, [closeAssistant]);

  const toggle = useCallback(() => {
    toggleAssistant();
  }, [toggleAssistant]);

  const dock = useCallback(() => {
    dockAssistant();
  }, [dockAssistant]);

  const undock = useCallback(() => {
    undockAssistant();
  }, [undockAssistant]);

  const openAndSendMessage = useCallback(
    (message: string) => {
      openAssistant(message);
    },
    [openAssistant],
  );

  return {
    isOpen,
    isDocked,
    isMinimized,
    open,
    close,
    toggle,
    dock,
    undock,
    openAndSendMessage,
  };
}
