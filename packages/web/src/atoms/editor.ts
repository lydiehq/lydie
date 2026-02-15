// Editor state management - exports from the editor registry
// All editor access should go through the registry for multi-tab support
export {
  activeDocumentIdAtom,
  activeEditorInstanceAtom,
  editorCache,
  editorRegistry,
  pendingChangeStatusAtom,
  pendingEditorChangeAtom,
} from "@/lib/editor/editor-registry";

export type {
  EditorInstance,
  PendingEditorChange,
  PendingChangeStatus,
} from "@/lib/editor/editor-registry";
