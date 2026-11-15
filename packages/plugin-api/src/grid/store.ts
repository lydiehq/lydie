// An external store for a grid's interaction state (read with `useGridSelector`, so a change
// re-renders only the components whose selected slice changed). It holds the state machine's
// state, the geometry and the rendered window; data rows live elsewhere (the view's windows).
import { EMPTY_VIEWPORT, nextViewport, reveal, sameViewport } from "./geometry.ts";
import type { Geometry, Scroll, Viewport } from "./geometry.ts";
import { initialGridState, reduce } from "./machine.ts";
import type { GridEvent, GridState } from "./machine.ts";
import type { Cell } from "./selection.ts";

export type Store<S> = {
  getState: () => S;
  setState: (next: S | ((state: S) => S)) => void;
  subscribe: (listener: () => void) => () => void;
};

export function createStore<S>(initial: S): Store<S> {
  let state = initial;
  const listeners = new Set<() => void>();
  return {
    getState: () => state,
    setState: (next) => {
      const value = typeof next === "function" ? (next as (s: S) => S)(state) : next;
      if (Object.is(value, state)) return;
      state = value;
      for (const listener of [...listeners]) listener();
    },
    subscribe: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}

export type GridStoreState = GridState & {
  geometry: Geometry | null;
  // Rendered body items and scrolling columns.
  viewport: Viewport;
};

export type GridStore = Store<GridStoreState> & {
  dispatch: (event: GridEvent) => void;
  // New geometry (columns, rows, heights): the size and the window follow.
  setGeometry: (geometry: Geometry, scroll: Scroll) => void;
  // A scroll or resize of the viewport: changes the window only when it must move.
  scrolled: (scroll: Scroll) => void;
  // The scroll position that shows `cell`, or null when it is already in view.
  revealTarget: (cell: Cell, scroll: Scroll) => { top: number; left: number } | null;
};

export function createGridStore(): GridStore {
  const store = createStore<GridStoreState>({
    ...initialGridState(),
    geometry: null,
    viewport: EMPTY_VIEWPORT,
  });
  const withViewport = (state: GridStoreState, viewport: Viewport): GridStoreState =>
    sameViewport(state.viewport, viewport) ? state : { ...state, viewport };
  return {
    ...store,
    dispatch: (event) =>
      store.setState((state) => {
        const next = reduce(state, event);
        return next === state ? state : { ...state, ...next };
      }),
    setGeometry: (geometry, scroll) =>
      store.setState((state) => {
        if (state.geometry === geometry) return state;
        const sized = reduce(state, {
          type: "setSize",
          size: { rows: geometry.rowToItem.length, cols: geometry.columnWidths.length },
        });
        return {
          ...state,
          ...sized,
          geometry,
          viewport: nextViewport(geometry, scroll, state.viewport),
        };
      }),
    scrolled: (scroll) =>
      store.setState((state) =>
        state.geometry
          ? withViewport(state, nextViewport(state.geometry, scroll, state.viewport))
          : state,
      ),
    revealTarget: (cell, scroll) => {
      const g = store.getState().geometry;
      if (!g) return null;
      const next = reveal(g, cell, scroll);
      return next.top === scroll.top && next.left === scroll.left ? null : next;
    },
  };
}
