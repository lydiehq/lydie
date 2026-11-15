// Which tab views stay mounted. Visible tabs are always mounted; besides them the most recently
// active `limit` tabs stay mounted but hidden, so switching back to them mounts nothing. Older ones
// are evicted and restore from their tab state bag when shown again.
export type TabPool = {
  touch(tabId: string): void;
  // Drops tabs that no longer exist.
  retain(existing: ReadonlySet<string>): void;
  has(tabId: string): boolean;
  // Bumped when membership changes.
  version: () => number;
  subscribe: (listener: () => void) => () => void;
  limit: number;
};

export function createTabPool(limit: number): TabPool {
  let order: string[] = [];
  let version = 0;
  const listeners = new Set<() => void>();
  const changed = () => {
    version++;
    for (const listener of [...listeners]) listener();
  };
  return {
    limit,
    touch(tabId) {
      if (order[0] === tabId) return;
      const before = new Set(order);
      order = [tabId, ...order.filter((id) => id !== tabId)].slice(0, limit);
      const after = new Set(order);
      if (before.size !== after.size || [...after].some((id) => !before.has(id))) changed();
    },
    retain(existing) {
      const next = order.filter((id) => existing.has(id));
      if (next.length === order.length) return;
      order = next;
      changed();
    },
    has: (tabId) => order.includes(tabId),
    version: () => version,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}
