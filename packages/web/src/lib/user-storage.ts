function getUserScopedKey(
  userId: string | null | undefined,
  key: string
): string {
  if (!userId) {
    return key;
  }
  return `${key}:user:${userId}`;
}

export function getUserStorage(
  userId: string | null | undefined,
  key: string
): string | null {
  if (typeof window === "undefined") {
    return null;
  }

  try {
    const scopedKey = getUserScopedKey(userId, key);
    return localStorage.getItem(scopedKey);
  } catch {
    return null;
  }
}

export function setUserStorage(
  userId: string | null | undefined,
  key: string,
  value: string
): void {
  if (typeof window === "undefined") {
    return;
  }

  try {
    const scopedKey = getUserScopedKey(userId, key);
    localStorage.setItem(scopedKey, value);
  } catch {
    // Ignore errors
  }
}

export function removeUserStorage(
  userId: string | null | undefined,
  key: string
): void {
  if (typeof window === "undefined") {
    return;
  }

  try {
    const scopedKey = getUserScopedKey(userId, key);
    localStorage.removeItem(scopedKey);
  } catch {
    // Ignore errors
  }
}

export function clearUserStorage(userId: string): void {
  if (typeof window === "undefined") {
    return;
  }

  try {
    const keysToRemove: string[] = [];
    const suffix = `:user:${userId}`;

    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.endsWith(suffix)) {
        keysToRemove.push(key);
      }
    }

    keysToRemove.forEach((key) => localStorage.removeItem(key));
  } catch {
    // Ignore errors
  }
}
