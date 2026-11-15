// Which filter popover is open: the toolbar's "Filter" menu (also `F`) or one part of a chip
// (a new filter opens its value right away). Per collection screen.
import { createContext, use, useMemo, useState } from "react";
import type { ReactNode } from "react";

export type FilterUi = {
  menuOpen: boolean;
  setMenuOpen: (open: boolean) => void;
  // `value:<index>` etc.; null when no chip popover is open.
  openChip: string | null;
  setOpenChip: (id: string | null) => void;
};

const Context = createContext<FilterUi | null>(null);

export function FilterUiProvider({ children }: { children: ReactNode }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [openChip, setOpenChip] = useState<string | null>(null);
  const value = useMemo(
    () => ({ menuOpen, setMenuOpen, openChip, setOpenChip }),
    [menuOpen, openChip],
  );
  return <Context value={value}>{children}</Context>;
}

const NONE: FilterUi = {
  menuOpen: false,
  setMenuOpen: () => {},
  openChip: null,
  setOpenChip: () => {},
};

export function useFilterUi(): FilterUi {
  return use(Context) ?? NONE;
}

// `F` opens "add filter" unless the key is for something being typed in (fields, editable text,
// the table grid, which types into cells).
export function isFilterKey(event: {
  key: string;
  metaKey: boolean;
  ctrlKey: boolean;
  altKey: boolean;
  shiftKey: boolean;
  defaultPrevented: boolean;
  target: EventTarget | null;
}): boolean {
  if (event.key !== "f" && event.key !== "F") return false;
  if (event.metaKey || event.ctrlKey || event.altKey || event.shiftKey || event.defaultPrevented)
    return false;
  const el = event.target as HTMLElement | null;
  if (!el || typeof el.closest !== "function") return true;
  if (el.isContentEditable) return false;
  return !el.closest("input, textarea, select, [role=grid], [role=dialog]");
}
