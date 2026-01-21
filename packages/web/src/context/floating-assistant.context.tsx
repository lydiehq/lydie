import { createContext, useContext, useState, useMemo, useCallback, type ReactNode } from "react"
import { createId } from "@lydie/core/id"

interface FloatingAssistantContextValue {
  isOpen: boolean
  open: (options?: { prompt?: string }) => void
  close: () => void
  toggle: () => void
  initialPrompt?: string
  clearPrompt: () => void
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
  const [isOpen, setIsOpen] = useState(false)
  const [initialPrompt, setInitialPrompt] = useState<string | undefined>()

  const open = useCallback((options?: { prompt?: string }) => {
    setIsOpen(true)
    if (options?.prompt) {
      setInitialPrompt(options.prompt)
    }
  }, [])

  const close = useCallback(() => {
    setIsOpen(false)
  }, [])

  const toggle = useCallback(() => {
    setIsOpen((prev) => !prev)
  }, [])

  const clearPrompt = useCallback(() => {
    setInitialPrompt(undefined)
  }, [])

  const value = useMemo(
    () => ({
      isOpen,
      open,
      close,
      toggle,
      initialPrompt,
      clearPrompt,
    }),
    [isOpen, open, close, toggle, initialPrompt, clearPrompt],
  )

  return <FloatingAssistantContext.Provider value={value}>{children}</FloatingAssistantContext.Provider>
}
