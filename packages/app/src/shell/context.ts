import { createContext, use, useRef, useSyncExternalStore } from "react";

import type { Host } from "../host/host.ts";

export const HostInternalContext = createContext<Host | null>(null);

export function useHostInternal(): Host {
  const host = use(HostInternalContext);
  if (!host) throw new Error("Needs <LydieApp> above it");
  return host;
}

// useSyncExternalStore with a selector: re-renders only when `equal(selected, previous)` is false.
export function useSelector<S, T>(
  subscribe: (listener: () => void) => () => void,
  getSnapshot: () => S,
  select: (snapshot: S) => T,
  equal: (a: T, b: T) => boolean = Object.is,
): T {
  const cache = useRef<{ snapshot: S; value: T } | null>(null);
  const get = () => {
    const snapshot = getSnapshot();
    const last = cache.current;
    if (last && last.snapshot === snapshot) return last.value;
    const value = select(snapshot);
    if (last && equal(last.value, value)) {
      cache.current = { snapshot, value: last.value };
      return last.value;
    }
    cache.current = { snapshot, value };
    return value;
  };
  return useSyncExternalStore(subscribe, get, get);
}

export const jsonEqual = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
