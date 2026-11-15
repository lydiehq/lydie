// React binding for grid stores: a component re-renders only when its selected slice changes
// (by `isEqual`, default Object.is). Selectors may close over props; a new selector is re-run.
import { useRef, useSyncExternalStore } from "react";

import type { Store } from "./store.ts";

export function useStoreSelector<S, T>(
  store: Store<S>,
  selector: (state: S) => T,
  isEqual: (a: T, b: T) => boolean = Object.is,
): T {
  const cache = useRef<{ state: S; selector: (state: S) => T; value: T } | null>(null);
  const getSnapshot = () => {
    const state = store.getState();
    const last = cache.current;
    if (last && last.state === state && last.selector === selector) return last.value;
    const value = selector(state);
    const kept = last && isEqual(last.value, value) ? last.value : value;
    cache.current = { state, selector, value: kept };
    return kept;
  };
  return useSyncExternalStore(store.subscribe, getSnapshot, getSnapshot);
}
