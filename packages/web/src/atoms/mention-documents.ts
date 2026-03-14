import { atom, getDefaultStore } from "jotai";

import type { DocumentReference } from "@/types/document-reference";

export type MentionDocumentItem = DocumentReference;

export const mentionDocumentsAtom = atom<MentionDocumentItem[]>([]);

const mentionDocumentsStore = getDefaultStore();

export function setMentionDocuments(items: MentionDocumentItem[]) {
  mentionDocumentsStore.set(mentionDocumentsAtom, items);
}

export function getMentionDocuments() {
  return mentionDocumentsStore.get(mentionDocumentsAtom);
}
