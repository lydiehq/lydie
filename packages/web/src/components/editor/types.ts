import type { queries } from "@lydie/zero/queries";
import type { QueryResultType } from "@rocicorp/zero";
import type { Editor } from "@tiptap/core";

/**
 * Document type from Zero queries.
 * Use this type for editor-related components.
 */
export type EditorDocument = NonNullable<QueryResultType<typeof queries.documents.byId>>;

/**
 * Pending change from the AI assistant.
 */
export interface PendingEditorChange {
  documentId: string;
  organizationId: string;
  title?: string;
  search?: string;
  replace?: string;
}

/**
 * Status of pending change application.
 */
export type PendingChangeStatus = "applying" | "applied" | "failed" | null;

/**
 * Props for the EditorView presentational component.
 */
export interface EditorViewProps {
  doc: EditorDocument;
  contentEditor: Editor | null;
  titleEditor: Editor | null;
  isLocked: boolean;
  shouldShiftContent: boolean;
}

/**
 * Props for editor container component.
 */
export interface EditorContainerProps {
  doc: EditorDocument;
}
