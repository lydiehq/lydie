import { atomWithStorage } from "jotai/utils"
import { getUserStorage, setUserStorage, removeUserStorage } from "./user-storage"

/**
 * Creates a Jotai atom with user-scoped localStorage persistence.
 * This integrates with the existing user-storage utility to scope storage by userId.
 */
export function atomWithUserStorage<T>(
  userId: string | null | undefined,
  key: string,
  initialValue: T,
  options?: {
    /**
     * Whether persistence is enabled. If false, the atom will still work
     * but won't persist to localStorage.
     */
    enabled?: boolean
  }
) {
  const { enabled = true } = options || {}

  // Create a custom storage implementation that uses user-storage
  const storage: {
    getItem: (key: string) => string | null
    setItem: (key: string, value: string) => void
    removeItem: (key: string) => void
  } = {
    getItem: (key: string) => {
      if (!enabled || typeof window === "undefined") {
        return null
      }
      return getUserStorage(userId, key)
    },
    setItem: (key: string, value: string) => {
      if (!enabled || typeof window === "undefined") {
        return
      }
      setUserStorage(userId, key, value)
    },
    removeItem: (key: string) => {
      if (!enabled || typeof window === "undefined") {
        return
      }
      removeUserStorage(userId, key)
    },
  }

  return atomWithStorage(key, initialValue, storage)
}
