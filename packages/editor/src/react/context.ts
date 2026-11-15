import { createContext, useContext } from "react";
import type { ReactNode } from "react";

export type CodeLanguagePickerProps = {
  language: string | null;
  languages: string[];
  onChange: (language: string | null) => void;
  isDisabled: boolean;
};

// Render slots that node views read. Node views render inside EditorContent, so context reaches
// them without rebuilding the extensions when a slot changes.
export type EmbedRenderProps = {
  // The raw text between `![[` and `]]` (may include `#heading` or `#^block`).
  target: string;
  selected: boolean;
};

// A table handle's menu: what the grip on a row or column offers. `icon` names the glyph, so the
// host's design system draws it.
export type TableHandleAction = {
  id: string;
  label: string;
  icon:
    | "insert-before"
    | "insert-after"
    | "move-before"
    | "move-after"
    | "align-left"
    | "align-center"
    | "align-right"
    | "duplicate"
    | "clear"
    | "delete";
  // Items are grouped by section, separated in the menu.
  section: "insert" | "move" | "align" | "edit" | "delete";
  isDisabled: boolean;
  // A checked state (the column's alignment).
  isSelected?: boolean;
  destructive?: boolean;
  onAction: () => void;
};

export type TableHandleProps = {
  axis: "row" | "column";
  actions: TableHandleAction[];
  // The editor keeps the handle and the row or column selection while the menu is open.
  onOpenChange: (open: boolean) => void;
};

export type LydieEditorSlots = {
  renderCodeLanguagePicker?: (props: CodeLanguagePickerProps) => ReactNode;
  renderEmbed?: (props: EmbedRenderProps) => ReactNode;
};

export const LydieEditorSlotsContext = createContext<LydieEditorSlots>({});

export function useLydieEditorSlots() {
  return useContext(LydieEditorSlotsContext);
}
