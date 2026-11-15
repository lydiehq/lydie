import type { ReactNode } from "react";

// A formatting button. The editor package supplies the behaviour (`markActions` etc.); these
// components only draw it, so @lydie/ui stays independent of TipTap.
export type EditorToolbarAction = {
  id: string;
  label: string;
  icon: ReactNode;
  isActive?: boolean;
  isDisabled?: boolean;
  // Keys shown in the tooltip, e.g. ["⌘", "B"].
  hotkeys?: string[];
  onPress: () => void;
};

export type EditorToolbarItem = EditorToolbarAction | "separator";

export type BlockTypeOption = { id: string; label: string };
