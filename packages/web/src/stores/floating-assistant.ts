import { atom } from "jotai"
import { atomWithStorage } from "jotai/utils"

// Persistent atoms with localStorage
export const isDockedAtom = atomWithStorage("assistant:docked", false)
export const isOpenAtom = atomWithStorage("assistant:open", false)
const wasDockedAtom = atomWithStorage("assistant:was-docked", false)

// Pending message for opening assistant with pre-filled content
export const pendingMessageAtom = atom<string | undefined>(undefined)

// Derived atom for minimized state
export const isMinimizedAtom = atom((get) => {
  const isDocked = get(isDockedAtom)
  const isOpen = get(isOpenAtom)
  return !isDocked && !isOpen
})

// Action atoms
export const openAssistantAtom = atom(
  null,
  (get, set, message?: string) => {
    // If it was previously docked, restore docked state
    if (get(wasDockedAtom)) {
      set(isDockedAtom, true)
      set(wasDockedAtom, false)
    }
    set(isOpenAtom, true)
    if (message) {
      set(pendingMessageAtom, message)
    }
  }
)

export const closeAssistantAtom = atom(
  null,
  (get, set) => {
    const isDocked = get(isDockedAtom)
    if (isDocked) {
      // Remember that it was docked before closing
      set(wasDockedAtom, true)
      set(isDockedAtom, false)
    }
    set(isOpenAtom, false)
  }
)

export const toggleAssistantAtom = atom(
  null,
  (get, set) => {
    const wasOpen = get(isOpenAtom)
    const newValue = !wasOpen
    
    set(isOpenAtom, newValue)
    
    // If opening and it was previously docked, restore docked state
    if (newValue && get(wasDockedAtom)) {
      set(isDockedAtom, true)
      set(wasDockedAtom, false)
    }
  }
)

export const dockAssistantAtom = atom(
  null,
  (get, set) => {
    set(isDockedAtom, true)
    set(isOpenAtom, true)
    // Clear wasDockedState since we're explicitly docking now
    set(wasDockedAtom, false)
  }
)

export const undockAssistantAtom = atom(
  null,
  (get, set) => {
    set(isDockedAtom, false)
    // Clear wasDockedState since we're explicitly undocking
    set(wasDockedAtom, false)
  }
)

export const clearPendingMessageAtom = atom(
  null,
  (get, set) => {
    set(pendingMessageAtom, undefined)
  }
)
