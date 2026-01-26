import { useAtomValue } from "jotai";

import { documentEditorAtom, titleEditorAtom } from "@/atoms/editor";

export function useDocumentEditor() {
  return useAtomValue(documentEditorAtom);
}

export function useTitleEditor() {
  return useAtomValue(titleEditorAtom);
}
