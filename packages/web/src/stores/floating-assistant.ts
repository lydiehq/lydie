import { atom } from "jotai";
import { atomWithStorage } from "jotai/utils";

export const isDockedAtom = atomWithStorage("assistant:docked", false);
export const isOpenAtom = atomWithStorage("assistant:open", false);
const wasDockedAtom = atomWithStorage("assistant:was-docked", false);

export const pendingMessageAtom = atom<string | undefined>(undefined);

export const isMinimizedAtom = atom((get) => {
  const isDocked = get(isDockedAtom);
  const isOpen = get(isOpenAtom);
  return !isDocked && !isOpen;
});

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

export const dockAssistantAtom = atom(null, (get, set) => {
  set(isDockedAtom, true);
  set(isOpenAtom, true);
  set(wasDockedAtom, false);
});

export const undockAssistantAtom = atom(null, (get, set) => {
  set(isDockedAtom, false);
  set(wasDockedAtom, false);
});

export const clearPendingMessageAtom = atom(null, (get, set) => {
  set(pendingMessageAtom, undefined);
});
