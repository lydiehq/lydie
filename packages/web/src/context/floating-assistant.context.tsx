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
  message?: string
}

interface FloatingAssistantContextValue {
  isOpen: boolean
  open: (options?: OpenOptions) => void
  close: () => void
  toggle: () => void
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
  const [isOpen, setIsOpen] = useState(() => {
    const docked = getDockedState()
    return docked ? true : getOpenState()
  })
  const [isDocked, setIsDocked] = useState(getDockedState)
  const [pendingMessage, setPendingMessage] = useState<string | undefined>()

  const open = useCallback((options?: OpenOptions) => {
    setIsOpen(true)
    setOpenState(true)
    if (options?.message) {
      setPendingMessage(options.message)
    }
  }, [])

  const close = useCallback(() => {
    setIsOpen(false)
    setOpenState(false)
  }, [])

  const toggle = useCallback(() => {
    setIsOpen((prev) => {
      const newValue = !prev
      setOpenState(newValue)
      return newValue
    })
  }, [])

  const dock = useCallback(() => {
    setIsDocked(true)
    setDockedState(true)
    setIsOpen(true)
    setOpenState(true)
  }, [])

  const undock = useCallback(() => {
    setIsDocked(false)
    setDockedState(false)
    const savedOpenState = getOpenState()
    setIsOpen(savedOpenState)
  }, [])

  // Sync state from other tabs
  useEffect(() => {
    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === ASSISTANT_DOCKED_KEY && e.newValue !== null) {
        const newDocked = e.newValue === "true"
        setIsDocked(newDocked)
        setIsOpen(newDocked || getOpenState())
      } else if (e.key === ASSISTANT_OPEN_KEY && e.newValue !== null) {
        setIsOpen(e.newValue === "true" || isDocked)
      }
    }

    window.addEventListener("storage", handleStorageChange)
    return () => window.removeEventListener("storage", handleStorageChange)
  }, [isDocked])

  const value = useMemo(
    () => ({
      isOpen,
      open,
      close,
      toggle,
      isDocked,
      dock,
      undock,
      _pendingMessage: pendingMessage,
      _clearPendingMessage: () => setPendingMessage(undefined),
    }),
    [isOpen, open, close, toggle, isDocked, dock, undock, pendingMessage],
  )

  return <FloatingAssistantContext.Provider value={value as FloatingAssistantContextValue}>{children}</FloatingAssistantContext.Provider>
}
