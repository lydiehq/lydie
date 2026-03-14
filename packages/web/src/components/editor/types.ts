import type { queries } from "@lydie/zero/queries";
import type { QueryResultType } from "@rocicorp/zero";
import type { Editor } from "@tiptap/core";

import type { PendingChangeStatus, PendingEditorChange } from "@/atoms/editor";

/**
 * Document type from Zero queries.
 * Use this type for editor-related components.
 */
export type EditorDocument = NonNullable<QueryResultType<typeof queries.documents.byId>>;

export type { PendingChangeStatus, PendingEditorChange };

/**
 * Props for the EditorView presentational component.
 */
export interface EditorViewProps {
  doc: EditorDocument;
  contentEditor: Editor | null;
  titleEditor: Editor | null;
  shouldShiftContent: boolean;
}

/**
 * Props for editor container component.
 */
export interface EditorContainerProps {
  doc: EditorDocument;
}
