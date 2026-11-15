import { useContributions } from "@lydie/plugin-api";
import {
  blockTypeActions,
  getActiveBlockType,
  markActions,
  useEditorState,
} from "@lydie/plugin-api/editor";
import type { Editor } from "@lydie/plugin-api/editor";
import {
  BoldRegular,
  CodeRegular,
  EditorBubbleToolbar,
  ItalicRegular,
  StrikethroughRegular,
} from "@lydie/plugin-api/ui";
import type { EditorToolbarItem } from "@lydie/plugin-api/ui";
import type { ReactNode } from "react";

const ICONS: Record<string, ReactNode> = {
  bold: <BoldRegular />,
  italic: <ItalicRegular />,
  strike: <StrikethroughRegular />,
  code: <CodeRegular />,
};

type Props = { editor: Editor; docId: string; tabId: string | null };

// The formatting bar over a text selection: marks and block type, then what plugins add.
export function BubbleMenu({ editor, docId, tabId }: Props) {
  const contributions = useContributions("editor");
  const state = useEditorState({
    editor,
    selector: ({ editor: current }) =>
      current
        ? {
            marks: Object.fromEntries(markActions.map((a) => [a.id, a.isActive(current)])),
            blockType: getActiveBlockType(current).id,
            // Read here, so the menu follows a change of access.
            editable: current.isEditable,
          }
        : null,
  });
  if (!state) return null;
  const items: EditorToolbarItem[] = markActions
    .filter((action) => ICONS[action.id])
    .map((action) => ({
      id: action.id,
      label: action.label,
      icon: ICONS[action.id],
      isActive: state.marks[action.id],
      onPress: () => action.run(editor),
    }));
  const readOnly = !state.editable;
  const actions = contributions
    .flatMap((c) =>
      (c.selectionActions ?? []).map((action) => ({ ...action, id: `${c.pluginId}:${action.id}` })),
    )
    .filter((action) => !readOnly || action.readOnly)
    .map((action) => ({
      id: action.id,
      label: action.label,
      icon: action.icon,
      onPress: () => action.run(editor, { docId, tabId }),
    }));
  // Without edit access there is no formatting: only what plugins offer for reading.
  if (readOnly) return actions.length > 0 ? <EditorBubbleToolbar items={actions} /> : null;
  if (actions.length > 0) items.push("separator", ...actions);
  return (
    <EditorBubbleToolbar
      items={items}
      blockTypes={blockTypeActions.map(({ id, label }) => ({ id, label }))}
      activeBlockType={state.blockType}
      onBlockTypeChange={(id) => blockTypeActions.find((a) => a.id === id)?.run(editor)}
    />
  );
}
