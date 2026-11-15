import type { SuggestionRender } from "../extensions/slash-commands";

export type SuggestionState<T> = {
  open: boolean;
  items: T[];
  query: string;
  selectedIndex: number;
  clientRect: (() => DOMRect | null) | null;
};

// What a host's menu renderer receives. It only draws; keys and positioning are handled here.
export type SuggestionMenuProps<T> = {
  items: T[];
  query: string;
  selectedIndex: number;
  onSelect: (index: number) => void;
  onHighlight: (index: number) => void;
};

const CLOSED: SuggestionState<never> = {
  open: false,
  items: [],
  query: "",
  selectedIndex: 0,
  clientRect: null,
};

// Bridges TipTap's suggestion callbacks to React (via useSyncExternalStore) instead of v1's
// ReactRenderer + tippy.js popups.
export function createSuggestionStore<T>() {
  let state: SuggestionState<T> = CLOSED;
  let command: ((item: T) => void) | null = null;
  const listeners = new Set<() => void>();

  function set(next: SuggestionState<T>) {
    state = next;
    for (const listener of listeners) listener();
  }

  function select(index: number) {
    const item = state.items[index];
    if (item !== undefined && command) command(item);
  }

  function highlight(index: number) {
    if (index !== state.selectedIndex) set({ ...state, selectedIndex: index });
  }

  const render: SuggestionRender<T> = () => ({
    onStart: (props) => {
      command = props.command;
      set({
        open: true,
        items: props.items,
        query: props.query,
        selectedIndex: 0,
        clientRect: props.clientRect ?? null,
      });
    },
    onUpdate: (props) => {
      command = props.command;
      set({
        open: true,
        items: props.items,
        query: props.query,
        selectedIndex:
          props.query === state.query
            ? Math.min(state.selectedIndex, Math.max(props.items.length - 1, 0))
            : 0,
        clientRect: props.clientRect ?? null,
      });
    },
    onKeyDown: ({ event }) => {
      if (!state.open) return false;
      if (event.key === "Escape") {
        set({ ...state, open: false });
        return true;
      }
      const count = state.items.length;
      if (count === 0) return false;
      if (event.key === "ArrowDown") {
        highlight((state.selectedIndex + 1) % count);
        return true;
      }
      if (event.key === "ArrowUp") {
        highlight((state.selectedIndex + count - 1) % count);
        return true;
      }
      if (event.key === "Enter" || event.key === "Tab") {
        select(state.selectedIndex);
        return true;
      }
      return false;
    },
    onExit: () => {
      command = null;
      set(CLOSED);
    },
  });

  return {
    render,
    select,
    highlight,
    getSnapshot: () => state,
    subscribe: (listener: () => void) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}

export type SuggestionStore<T> = ReturnType<typeof createSuggestionStore<T>>;
