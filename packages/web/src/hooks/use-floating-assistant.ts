import { atom, useAtomValue, useSetAtom } from "jotai";
import { atomWithStorage } from "jotai/utils";
import { useCallback } from "react";

// Global UI state - needed for layout coordination across components
export const isDockedAtom = atomWithStorage("assistant:docked", false);
export const isOpenAtom = atomWithStorage("assistant:open", false);

// Derived state
export const isMinimizedAtom = atom((get) => {
  const isDocked = get(isDockedAtom);
  const isOpen = get(isOpenAtom);
  return !isDocked && !isOpen;
});

// For cross-component communication (e.g., onboarding tasks)
export const pendingMessageAtom = atom<string | undefined>(undefined);

// Internal atom to track if assistant was previously docked
const wasDockedAtom = atomWithStorage("assistant:was-docked", false);

// Actions
export const openAssistantAtom = atom(null, (get, set, message?: string) => {
  if (get(wasDockedAtom)) {
    set(isDockedAtom, true);
    set(wasDockedAtom, false);
  }
  set(isOpenAtom, true);
  if (message) {
    set(pendingMessageAtom, message);
  }
});

export const closeAssistantAtom = atom(null, (get, set) => {
  const isDocked = get(isDockedAtom);
  if (isDocked) {
    set(wasDockedAtom, true);
    set(isDockedAtom, false);
  }
  set(isOpenAtom, false);
});

export const toggleAssistantAtom = atom(null, (get, set) => {
  const wasOpen = get(isOpenAtom);
  const newValue = !wasOpen;

  set(isOpenAtom, newValue);

  if (newValue && get(wasDockedAtom)) {
    set(isDockedAtom, true);
    set(wasDockedAtom, false);
  }
});

export const dockAssistantAtom = atom(null, (_get, set) => {
  set(isDockedAtom, true);
  set(isOpenAtom, true);
  set(wasDockedAtom, false);
});

export const undockAssistantAtom = atom(null, (_get, set) => {
  set(isDockedAtom, false);
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
  const isOpen = useAtomValue(isOpenAtom);
  const isDocked = useAtomValue(isDockedAtom);
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
