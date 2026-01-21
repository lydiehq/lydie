import { createContext, useContext, useState, useMemo, useCallback, useEffect, type ReactNode } from "react"

const ASSISTANT_DOCKED_KEY = "assistant:docked"
const ASSISTANT_OPEN_KEY = "assistant:open"

function getDockedState(): boolean {
  if (typeof window === "undefined") return false
  try {
    const stored = localStorage.getItem(ASSISTANT_DOCKED_KEY)
    return stored === "true"
  } catch {
    return false
  }
}

function setDockedState(value: boolean): void {
  if (typeof window === "undefined") return
  try {
    localStorage.setItem(ASSISTANT_DOCKED_KEY, String(value))
  } catch {
    // Ignore localStorage errors
  }
}

function getOpenState(): boolean {
  if (typeof window === "undefined") return false
  try {
    const stored = localStorage.getItem(ASSISTANT_OPEN_KEY)
    return stored === "true"
  } catch {
    return false
  }
}

function setOpenState(value: boolean): void {
  if (typeof window === "undefined") return
  try {
    localStorage.setItem(ASSISTANT_OPEN_KEY, String(value))
  } catch {
    // Ignore localStorage errors
  }
}

interface OpenOptions {
  prompt?: string
  documentId?: string
}

interface FloatingAssistantContextValue {
  isOpen: boolean
  open: (options?: OpenOptions) => void
  close: () => void
  toggle: () => void
  initialPrompt?: string
  clearPrompt: () => void
  isDocked: boolean
  dock: () => void
  undock: () => void
}

const FloatingAssistantContext = createContext<FloatingAssistantContextValue | null>(null)

export function useFloatingAssistant() {
  const context = useContext(FloatingAssistantContext)
  if (!context) {
    throw new Error("useFloatingAssistant must be used within FloatingAssistantProvider")
  }
  return context
}

interface FloatingAssistantProviderProps {
  children: ReactNode
}

export function FloatingAssistantProvider({ children }: FloatingAssistantProviderProps) {
  // Initialize state from localStorage
  const initialIsDocked = getDockedState()
  const initialIsOpen = initialIsDocked ? true : getOpenState() // If docked, always open
  
  const [isOpen, setIsOpen] = useState(initialIsOpen)
  const [initialPrompt, setInitialPrompt] = useState<string | undefined>()
  const [isDocked, setIsDocked] = useState(initialIsDocked)

  const open = useCallback((options?: OpenOptions) => {
    setIsOpen(true)
    // Only persist open state when undocked (when docked, it's always open)
    if (!isDocked) {
      setOpenState(true)
    }
    if (options?.prompt) {
      setInitialPrompt(options.prompt)
    }
    // Note: documentId navigation is handled by the caller before opening
    // This keeps the context simple and stateless
  }, [isDocked])

  const close = useCallback(() => {
    setIsOpen(false)
    // Only persist open state when undocked
    if (!isDocked) {
      setOpenState(false)
    }
  }, [isDocked])

  const toggle = useCallback(() => {
    setIsOpen((prev) => {
      const newValue = !prev
      // Only persist open state when undocked
      if (!isDocked) {
        setOpenState(newValue)
      }
      return newValue
    })
  }, [isDocked])

  const clearPrompt = useCallback(() => {
    setInitialPrompt(undefined)
  }, [])

  const dock = useCallback(() => {
    setIsDocked(true)
    setDockedState(true)
    setIsOpen(true) // Automatically open when docking
    // Don't persist open state when docked (it's always open)
  }, [])

  const undock = useCallback(() => {
    setIsDocked(false)
    setDockedState(false)
    // Restore the previous open state from localStorage when undocking
    const savedOpenState = getOpenState()
    setIsOpen(savedOpenState)
  }, [])

  // Keep isOpen in sync with isDocked (when docked, always open)
  useEffect(() => {
    if (isDocked && !isOpen) {
      setIsOpen(true)
    }
  }, [isDocked, isOpen])

  // Persist isOpen state when it changes (only when undocked)
  useEffect(() => {
    if (!isDocked) {
      setOpenState(isOpen)
    }
  }, [isOpen, isDocked])

  // Sync localStorage when state changes externally (e.g., from another tab)
  useEffect(() => {
    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === ASSISTANT_DOCKED_KEY && e.newValue !== null) {
        const newValue = e.newValue === "true"
        if (newValue !== isDocked) {
          setIsDocked(newValue)
          if (newValue) {
            setIsOpen(true) // Auto-open when docked
          } else {
            // When undocked, restore saved open state
            const savedOpenState = getOpenState()
            setIsOpen(savedOpenState)
          }
        }
      } else if (e.key === ASSISTANT_OPEN_KEY && e.newValue !== null && !isDocked) {
        // Only sync open state when undocked
        const newValue = e.newValue === "true"
        if (newValue !== isOpen) {
          setIsOpen(newValue)
        }
      }
    }

    window.addEventListener("storage", handleStorageChange)
    return () => window.removeEventListener("storage", handleStorageChange)
  }, [isDocked, isOpen])

  const value = useMemo(
    () => ({
      isOpen,
      open,
      close,
      toggle,
      initialPrompt,
      clearPrompt,
      isDocked,
      dock,
      undock,
    }),
    [isOpen, open, close, toggle, initialPrompt, clearPrompt, isDocked, dock, undock],
  )

  return <FloatingAssistantContext.Provider value={value}>{children}</FloatingAssistantContext.Provider>
}
