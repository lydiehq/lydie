import { autoUpdate, computePosition, flip, offset, shift } from "@floating-ui/dom";
import type { Editor } from "@tiptap/core";
import { useLayoutEffect, useRef, useSyncExternalStore } from "react";
import type { ReactNode } from "react";
import { createPortal } from "react-dom";

import type { SuggestionMenuProps, SuggestionStore } from "./suggestion-store";

type Props<T> = {
  editor: Editor;
  store: SuggestionStore<T>;
  children: (props: SuggestionMenuProps<T>) => ReactNode;
};

// Positions a suggestion menu under the caret with floating-ui (the one positioning library the
// editor uses; v1 also shipped tippy.js for this).
export function SuggestionPopup<T>({ editor, store, children }: Props<T>) {
  const state = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot);
  const ref = useRef<HTMLDivElement>(null);
  const { open, clientRect } = state;

  useLayoutEffect(() => {
    const floating = ref.current;
    if (!open || !floating || !clientRect) return;
    const reference = {
      getBoundingClientRect: () => clientRect() ?? new DOMRect(),
      contextElement: editor.view.dom,
    };
    return autoUpdate(reference, floating, () => {
      void computePosition(reference, floating, {
        placement: "bottom-start",
        strategy: "fixed",
        middleware: [offset(6), flip({ padding: 8 }), shift({ padding: 8 })],
      }).then(({ x, y }) => {
        floating.style.transform = `translate(${Math.round(x)}px, ${Math.round(y)}px)`;
        floating.style.visibility = "visible";
      });
    });
  }, [open, clientRect, editor]);

  if (!open) return null;

  return createPortal(
    <div
      ref={ref}
      role="presentation"
      data-lydie-suggestion=""
      className="fixed top-0 left-0 z-50"
      style={{ visibility: "hidden" }}
      // Keep focus (and the selection) in the editor while clicking items.
      onMouseDown={(event) => event.preventDefault()}
    >
      {children({
        items: state.items,
        query: state.query,
        selectedIndex: state.selectedIndex,
        onSelect: store.select,
        onHighlight: store.highlight,
      })}
    </div>,
    document.body,
  );
}
